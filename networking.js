function setStatus(msg) {
  $('#StatusPanel').html(msg);
}

function log_id(id) {
  var msg = Array.prototype.slice.call(arguments).slice(1).join(" ");
  var div_id = "div_for_"+id;
  var target = document.getElementById(div_id);
  if (target) {
    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }
  } else {
    var div = $('<div></div>');
    var msgdiv = $('<div></div>');
    div.append(document.createTextNode("> "+id+": "));
    div.append(msgdiv);
    msgdiv.css("border", "1px solid gray").css("display", "inline-block");
    msgdiv.attr("id", div_id);
    logJq(div);
    target = msgdiv[0];
  }
  target.appendChild(document.createTextNode(msg));
}

function decodeAddress(address) {
  var res = {port: 80, path: "jsfarm"};
  var match = address.match(/^([^:\/]*)(:([0-9]*))?(\/(.*))?$/);
  if (!match) return null;
  res.host = match[1];
  if (match[3]) res.port = parseInt(match[3], 10);
  if (match[5]) res.path = match[5];
  return res;
}

function CheckTarget() {
  var jq = $('input#target');
  var obj = decodeAddress(jq.val());
  var syntaxError = "Syntax error: Server";
  if (obj == null) { // parsing failed
    jq.css('background-color', '#fdd');
  } else {
    jq.removeAttr('style');
  }
}

$(CheckTarget); // check on startup

/** @constructor */
function RobinTask(con, evictfn) {
  this.con = con;
  this.origin = con.id;
  this.evict = evictfn;
}

/** @constructor */
function RobinQueue(limit) {
  this.scores = {};
  this.limit = limit;
  this.tasks = [];
  this.getScoreForTask = function(task) {
    if (this.scores.hasOwnProperty(task.origin)) {
      return this.scores[task.origin];
    }
    return 0;
  };
  this.penalizeTaskOrigin = function(task) {
    if (!this.scores.hasOwnProperty(task.origin)) {
      this.scores[task.origin] = 0;
    }
    var msg = task.msg.message, cost = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * msg.quality;
    this.scores[task.origin] -= cost; // penalize
  }
  this.popTask = function() {
    if (!this.tasks.length) return null;
    var task = this.tasks.shift(); // fifo
    this.penalizeTaskOrigin(task); // Only now, that we're actually starting to compute it!
    return task;
  };
  this.addTaskMaybe = function(task) {
    var evict_task = null;
    if (this.tasks.length == this.limit) {
      // maybe we replace a queued task?
      // find the queued task with the worst score
      var worstscore = null, worstscore_id = null;
      for (var i = 0; i < this.tasks.length; ++i) {
        if (this.tasks[i].origin === task.origin) continue; // no point
        var oldtaskscore = this.getScoreForTask(this.tasks[i]);
        if (!worstscore || oldtaskscore < worstscore) {
          worstscore = oldtaskscore;
          worstscore_id = i;
        }
      }
      
      var ntaskscore = this.getScoreForTask(task);
      if (!worstscore || worstscore >= ntaskscore) { // no tasks with worse score
        return false;
      }
      
      // we replace worstscore_id
      evict_task = this.tasks[worstscore_id];
      this.tasks.splice(worstscore_id, 1);
      
      // log("evict", JSON.stringify(evict_task.msg), "because", ntaskscore, "beats", worstscore);
    }
    this.tasks.push(task);
    
    if (evict_task) evict_task.evict();
    
    return true;
  };
}

/** @constructor */
function JSFarm() {
  this.workers = [];
  
  this.tasks = [];
  this.progress_ui = new ProgressUI(this.tasks);
  
  this.peerlist = [];
  this.peerlist_last_updated = null;
  
  this.peerinfo = {};
  
  this.connection_limit = 10;
  this.connections = {};
  this.id = null;
  
  this._openPeer = function() {
    log("open peer");
    var address = decodeAddress($('#settings input#target').val());
    if (!address) return null;
    
    var settings = {
      // default
      /*config: {'iceServers': [
        { url: 'stun:stun.l.google.com:19302' }
      ]},*/
      logFunction: function(){var args2=["PeerJS:"]; for(var i=0;i<arguments.length;++i)args2.push(arguments[i]);window.log.apply(window, args2);},
      debug: 0 // verbosity
    };
    settings = $.extend(settings, address);
    
    return new Peer(null, settings);
  };
  this.connect = function() {
    var self = this;
    
    var peer = self._openPeer();
    if (!peer) return;
    
    self.peer = peer;
    
    setStatus("Status: connecting");
    
    peer.on('connection', self.handleIncomingConnection.bind(self));
    peer.on('open', function(id) {
      setStatus("Status: connected as "+id);
      self.id = id;
      window.onbeforeunload = Disconnect;
      
      // sanity limit
      var threads = Math.min(36, document.getElementById('threads').value|0);
      
      self.startWorkers(threads);
      self.taskqueue.limit = threads;
    });
    $('#WorkerInfo').show().css('display', 'inline-block');
    
    $('#ConnectButton').hide();
    $('#DisconnectButton').show();
  };
  this.taskqueue = new RobinQueue(0);
  this.checkQueue = function() {
    var self = this;
    
    function giveTaskToThread(wrapper, task) {
      var msg = task.msg;
      var con = task.con;
      
      wrapper.onComplete = function(data) {
        con.send({kind: 'done', channel: msg.channel});
        con.send({kind: 'result', channel: msg.channel, data: data.buffer});
        delete wrapper.onComplete;
        
        // worker has gone idle, maybe we can assign a queued task?
        self.checkQueue(con);
      };
      
      wrapper.onProgress = function(frac) {
        con.send({kind: 'progress', value: frac, channel: msg.channel});
      };
      
      wrapper.onError = function(error) {
        con.send({kind: 'error', fatal: true, error: error, channel: msg.channel});
        delete wrapper.onError;
      };
      
      var message = $.extend({}, task.default_obj, msg.message);
      
      wrapper.giveWork(message);
    }
    
    for (var i = 0; i < self.workers.length; ++i) {
      var wrapper = self.workers[i];
      if (wrapper.state == 'idle') {
        var task = self.taskqueue.popTask();
        if (!task) return; // can stop checking workers - nothing to do
        giveTaskToThread(wrapper, task);
      }
    }
  };
  this.handleIncomingConnection = function(con) {
    var self = this;
    
    log("incoming", con.id);
    
    var handlePing = function(msg) {
      if (msg.kind == "ping") {
        con.send({kind: "pong", channel: msg.channel});
      }
    };
    
    var handleLabel = function(msg) {
      if (msg.kind == "whoareyou") {
        var jq_ident = ""+document.getElementById('ident').value;
        if (jq_ident == "") jq_ident = null;
        
        con.send({kind: "iamcalled", label: jq_ident || self.id, channel: msg.channel});
      }
    }
    
    var default_obj = {};
    
    var handleTask = function(msg) {
      if (msg.kind == 'default') {
        default_obj = msg.object;
        return;
      }
      if (msg.kind == 'task') {
        var task = new RobinTask(con, function() {
          // log("kick", JSON.stringify(msg));
          con.send({kind: 'error', fatal: false, error: 'task evicted from queue', channel: msg.channel});
        });
        task.msg = msg;
        task.default_obj = default_obj;
        
        if (self.taskqueue.addTaskMaybe(task)) {
          // log("accept task "+JSON.stringify(msg));
          con.send({kind: 'accepted', channel: msg.channel});
          // queue has gained a task, maybe we can assign it to a worker?
          self.checkQueue(con, default_obj);
        } else {
          // log("reject task "+JSON.stringify(msg));
          con.send({kind: 'rejected', reason: 'taskqueue full', channel: msg.channel});
        }
      }
    };
    
    con.on('data', handlePing);
    con.on('data', handleLabel);
    con.on('data', handleTask);
  };
  this.listAllPeersDelayed = function(fn) {
    var self = this;
    
    var peerlist = [];
    
    var peerHandler = null;
    var setPeerHandler = function(fn) {
      peerHandler = fn;
    };
    
    var peersHandled = [];
    var callBackWithNewPeers = function() {
      if (peerHandler == null) return; // not ready yet
      for (var i = 0; i < peerlist.length; ++i) {
        var id = peerlist[i];
        if (!(peersHandled.hasOwnProperty(id))) {
          log("discovered new peer", id);
          peersHandled[id] = true;
          peerHandler(id);
        }
      }
    };
    
    var recheckPeers = function() {
      log("relisting peers");
      self.peer.listAllPeers(function(peers) {
        peerlist = peers;
        callBackWithNewPeers();
      });
    };
    
    fn(recheckPeers, setPeerHandler);
  };
  this.giveWorkToIdlePeers = function() {
    var self = this;
    
    var peer = self.peer;
    
    if (!peer) {
      log("No peer connection established!");
      return;
    }
    
    var goIdle = function() { setStatus("idle", "peer check"); };
    
    // don't list peers if we got no work for them
    if (!self.gotQueuedTasks()) return;
    
    self.listAllPeersDelayed(function(recheckPeers, setPeerHandler) {
      var maybeSpawnNewConnections = null;
      
      connect = function(id) {
        // log_id(id, "attempt to connect");
        var con = peer.connect(id);
        
        var con_refs = 0;
        var con_claim = function() { con_refs ++; };
        var con_release = function() {
          if (--con_refs == 0) {
            log("nothing relevant happening on connection - close.");
            con.close();
          }
        };
        
        var firstExchangeOnConnection = true;
        
        var tasksInFlight = [];
        var markNotInFlight = function(task) {
          // remove from inflight list
          for (var i = 0; i < tasksInFlight.length; ++i) {
            if (tasksInFlight[i] === task) {
              tasksInFlight[i] = null;
              break;
            }
          }
          while (tasksInFlight.length && tasksInFlight[0] == null) {
            tasksInFlight.shift();
          }
        };
        
        var failTask = function(task) {
          task.state = 'failed';
          self.progress_ui.onTaskAborted(task);
          markNotInFlight(task);
        };
        
        var reenqueueTask = function(task) {
          if (task.state != 'asking') {
            self.progress_ui.onTaskAborted(task);
          }
          task.state = 'queued';
          task.assigned_to = null;
          markNotInFlight(task);
        };
        
        var finishTask = function(task, timer, resultInfo) {
          var msg = task.message;
          task.state = 'done';
          task.onDone(msg, resultInfo);
          self.progress_ui.onTaskCompleted(task);
          self.cost_estimate_seconds += timer.elapsed() / 1000;
          self.cost_estimate_pixels += (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from);
          // log("done: "+timer.elapsed()+" for "+(msg.x_to - msg.x_from) * (msg.y_to - msg.y_from));
          markNotInFlight(task);
        };
        
        var con_start_exchange_timer = null;
        
        var finish = function(reason) {
          return function() {
            con_start_exchange_timer.kill();
            // log_id(id, "finish:", reason, ",", JSON.stringify(Array.prototype.slice.call(arguments)));
            for (var i = 0; i < tasksInFlight.length; ++i) {
              var task = tasksInFlight[i];
              if (!task) continue;
              reenqueueTask(task);
              // log_id(id, "task", task.id, "reset due to connection loss");
            }
            log("remove connection "+id+" because "+reason);
            self.progress_ui.onCloseConnection(id);
            delete self.connections[id];
            maybeSpawnNewConnections();
          };
        };
        
        con.on('open', function() {
          var exchanges = [];
          var channel_counter = 0;
        
          var startExchange = function() {
            var channel = channel_counter ++;
            // log_id(id, "start new exchange on channel", channel);
            exchanges[channel] = exchange(channel);
            exchanges[channel].timer = new TimeoutTimer(50000, function() {
              // log_id(id, "exchange timed out");
              if (exchanges[channel].hasOwnProperty('task')) {
                var task = exchanges[channel].task;
                log(id, ": timeout on", channel, "reenqueue", task.id);
                reenqueueTask(task);
                // controversial:
                // don't start a new exchange here
                // the peer has demonstrated that it cannot render this task in a timely manner
                // leave it to another peer - hope that one shows up.
              }
              con_release();
              exchanges[channel] = null;
            });
            
            exchanges[channel].next();
          };
          
          var dfl_src = null;
          
          var exchange = function*(channel) {
            var advance = function() {
              if (exchanges[channel] == null) return; // died
              
              exchanges[channel].timer.reset(); // something happened! reset the timeout
              con_start_exchange_timer.reset(); // this one too
              
              exchanges[channel].next();
            };
            
            con_claim();
            function cleanup() {
              con_release();
              exchanges[channel].timer.kill();
              exchanges[channel] = null;
            }
            
            var time_response = function*() {
              var from = time();
              var to = null;
              con.send({kind: "ping", channel: channel});
              con.onceSuccessful('data', function(msg) {
                if (msg.channel != channel) return;
                
                if (msg.kind == 'pong') {
                  to = time();
                  advance();
                  return true;
                } else throw ("1 unexpected kind "+msg.kind);
              });
              yield;
              return to - from;
            };
            
            var get_label = function*() {
              con.send({kind: "whoareyou", channel: channel});
              var res = null;
              con.onceSuccessful('data', function(msg) {
                if (msg.channel != channel) return;
                if (msg.kind != 'iamcalled') throw ("1.1 unexpected kind "+msg.kind);
                res = msg.label;
                advance();
                return true;
              });
              yield;
              return res;
            };
            
            var taskAccepted = function*(task) {
              var result = null;
              var reactTaskAccepted = function(msg) {
                if (msg.channel != channel) return;
                
                if (msg.kind == 'accepted') {
                  // log_id(id, "task on", msg.channel, "has been accepted.");
                  task.state = 'processing';
                  task.assigned_to = id;
                  self.progress_ui.onTaskAccepted(task);
                  result = true;
                  advance();
                } else if (msg.kind == 'rejected') {
                  // log_id(id, "task", task.id, "rejected:", msg.reason);
                  reenqueueTask(task);
                  result = false;
                  advance();
                } else throw ("2 unexpected kind "+msg.kind);
                return true;
              };
              task.state = 'asking';
              tasksInFlight.push(task);
              
              con.onceSuccessful('data', reactTaskAccepted);
              
              // I'm _pretty_ sure peer.js supports reliable in-order delivery.
              // that said, to trigger a timing issue here you gotta be doing
              // something _really_ weird anyways.
              // so honestly, it's your own fault.
              if (dfl_src != task.message.source) {
                con.send({kind: 'default', object: {source: task.message.source}});
                dfl_src = task.message.source;
              }
              
              var msg = $.extend({}, task.message);
              delete msg.source; // already set in the default object
              
              con.send({kind: 'task', message: msg, channel: channel});
              yield;
              return result;
            };
            
            var waitTaskDone = function*() {
              var reactTaskDone = function(msg) {
                if (msg.channel != channel) return;
                if (msg.kind == 'done') {
                  advance();
                  return true;
                } else if (msg.kind == 'error') {
                  // late rejection
                  if (msg.fatal) {
                    log(id, ": task", task.id, "failed:", msg.fatal, msg.error, "(3)");
                    failTask(task);
                  } else {
                    // log(id, ": task", task.id, "kicked from queue, was", task.state);
                    reenqueueTask(task); // recoverable, like queue kicks
                  }
                  cleanup();
                  // don't bother reentering this exchange
                  return true;
                } else if (msg.kind == 'progress') {
                  var frac = +msg.value;
                  task.progress = frac;
                  task.onProgress(task.message, frac);
                  self.progress_ui.onTaskProgressed(task);
                } else throw ("3 unexpected kind "+msg.kind);
              };
              con.onceSuccessful('data', reactTaskDone);
              yield;
            };
            
            var waitTaskResultReceived = function*() {
              var data = null;
              var reactTaskResultReceived = function(msg) {
                if (msg.channel != channel) return;
                
                if (msg.kind == 'result') {
                  data = new Uint8Array(msg.data);
                  // log_id(id, "task", task.id, "received data", data.length);
                  advance();
                  return true;
                } else if (msg.kind == 'error') {
                  // very late rejection
                  log(id, ": task", task.id, "failed:", msg.error, "(4)");
                  if (msg.fatal) {
                    failTask(task);
                  } else {
                    reenqueueTask(task); // recoverable
                  }
                  cleanup();
                  // don't bother reentering
                  return true;
                } else if (msg.kind == 'done') {
                  log("Yes, I know that task", task.id, "is done. Why did you tell me twice? (Tolerated. But why??)");
                } else if (msg.kind == 'progress') {
                  var frac = +msg.value;
                  task.progress = frac;
                  task.onProgress(task.message, frac);
                  self.progress_ui.onTaskProgressed(task);
                } else throw ("4 unexpected kind "+msg.kind);
              };
              con.onceSuccessful('data', reactTaskResultReceived);
              yield;
              return data;
            };
            
            if (!self.peerinfo.hasOwnProperty(id)) self.peerinfo[id] = {};
            
            var peerinfo = self.peerinfo[id];
            
            if (!peerinfo.hasOwnProperty('wait_label_completion')) {
              peerinfo.wait_label_completion = function*(advance) {
                peerinfo.on_label_completion(advance);
                yield;
              };
              
              // we're the first - query for label
              var attached_fns = [];
              peerinfo.on_label_completion = function(fn) { attached_fns.push(fn); };
              
              peerinfo.label = yield* get_label();
              
              for (var i = 0; i < attached_fns.length; ++i) attached_fns[i](); // wake up the others who are waiting on us
              
              peerinfo.wait_label_completion = function*(advance) { }; // pass clean through now
            }
            
            yield* peerinfo.wait_label_completion(advance);
            
            if (firstExchangeOnConnection) {
              // as soon as we have the label...
              self.progress_ui.onOpenConnection(id, peerinfo.label);
              firstExchangeOnConnection = false;
            }
            
            if (!self.peerinfo[id].hasOwnProperty('ping')) {
              // prevent other channels from starting duplicate checks
              self.peerinfo[id].ping = null;
              var tries = 3;
              var sum = 0;
              for (var i = 0; i < tries; ++i) {
                sum += yield* time_response();
              }
              var ping = sum / tries;
              // log_id(id, "ping", "is "+(ping|0)+"ms");
              self.peerinfo[id].ping = ping;
            }
            
            var task = self.getQueuedTask();
            if (!task) {
              cleanup();
              return;
            }
            
            exchanges[channel].task = task;
            
            // log("submit task", id, ":", task.id, ":", task.message.y_from);
            // log_id(id, "task", task.id, "submitting");
            
            if (yield* taskAccepted(task)) {
              task.onStart(task.message);
              // maybe this peer has more threads free?
              // start a new exchange
              startExchange();
            } else {
              cleanup();
              return;
            }
            
            // log_id(id, "task", task.id, "was accepted");
            
            yield* waitTaskDone();
            
            // maybe peer has more threads free now!! :o
            // nag it some more
            startExchange();
            
            var data = yield* waitTaskResultReceived();
            
            // log("received task", id, ":", task.id, ":", task.message.y_from);
            
            var resultInfo = {
              x_from: task.message.x_from,
              y_from: task.message.y_from,
              x_to: task.message.x_to,
              y_to: task.message.y_to,
              data: data
            };
            
            finishTask(task, exchanges[channel].timer, resultInfo);
            
            cleanup();
            return;
          };
          
          // in the absence of other occasions, start a fresh exchange at least once a second
          // this prevents us from getting stuck if we get rejected on all fronts, for instance
          con_start_exchange_timer = new TimeoutTimer(1000, function() {
            con_start_exchange_timer.reset().run();
            startExchange();
          });
          
          startExchange();
        });
        con.on('close', finish("close"));
        con.on('error', finish("error"));
        
        self.connections[id] = con;
      };
      
      var ids = [];
      setPeerHandler(function(id) { ids.push(id); maybeSpawnNewConnections(); });
      
      var must_recheck_flag = true;
      
      maybeSpawnNewConnections = function() {
        if (!self.gotQueuedTasks()) return;
        
        var active_connections_count = Object.keys(self.connections).length;
        if (active_connections_count >= self.connection_limit) return;
        
        if (!ids.length) {
          must_recheck_flag = true;
          return;
        }
        
        var new_id = ids.pop();
        log("open new connection to", new_id);
        connect(new_id);
      };
      
      // check regularly (maybeSpawn will naturally bail if we're at the limit)
      var openNewConnectionsPeriodically = function() {
        if (!self.gotUnfinishedTasks()) return; // TODO self.done()
        
        setTimeout(openNewConnectionsPeriodically, 1000);
        maybeSpawnNewConnections();
      };
      openNewConnectionsPeriodically();
      
      var recheckPeersPeriodically = function() {
        if (!self.gotUnfinishedTasks()) return; // TODO self.done()
        
        // check every 10s
        setTimeout(recheckPeersPeriodically, 10000);
        
        if (!must_recheck_flag) return;
        must_recheck_flag = false; // yes yes, I'm on it
        
        recheckPeers();
      };
      recheckPeersPeriodically();
    });
  };
  this.shuffle = function(top_num) {
    top_num = top_num || this.tasks.length;
    var limit = this.tasks.length - top_num;
    for (var i = this.tasks.length - 1; i >= limit; --i) {
      var target = Math.floor(Math.random() * (i + 1));
      
      var temp = this.tasks[target];
      this.tasks[target] = this.tasks[i];
      this.tasks[i] = temp;
    }
  };
  this.reset = function() {
    this.tasks.length = 0;
    this.peerlist.length = 0;
    this.peerlist_last_updated = null;
    for (var key in this.connections) if (this.connections.hasOwnProperty(key)) {
      this.connections[key].close();
      delete this.connections[key];
    }
    this.cost_estimate_seconds = 1;
    this.cost_estimate_pixels = 0; // initially "Infinity" so we start with 1x1 subdiv
  };
  this.run = function() {
    this.progress_ui.reset();
    this.giveWorkToIdlePeers();
  };
  this.taskcount = 0;
  this.addTask = function(msg) {
    var task = {
      state: 'queued',
      assigned_to: null,
      progress: 0,
      id: this.taskcount++,
      message: msg,
      onStart: function(task) { },
      onDone: function(task, msg) { },
      onProgress: function(task, frac) { }
    };
    this.tasks.push(task);
    return {
      onStart: function(fn) { task.onStart = fn; return this; },
      onDone: function(fn) { task.onDone = fn; return this; },
      onProgress: function(fn) { task.onProgress = fn; return this; }
    };
  };
  this.peekQueuedTask = function() {
    while (this.tasks.length && this.tasks[0].state == 'done') {
      this.tasks.shift();
    }
    for (var i = 0; i < this.tasks.length; ++i) {
      var task = this.tasks[i];
      if (task.state == 'queued') return task;
    }
    return null;
  };
  this.cost_estimate_seconds = 1;
  this.cost_estimate_pixels = 0;
  this.estimSubdivideTask = function(task) {
    var msg = task.message;
    var task_pixels = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from);
    var estim_seconds_per_pixel = this.cost_estimate_seconds / this.cost_estimate_pixels;
    var estim_seconds_per_task = task_pixels * estim_seconds_per_pixel;
    var target_seconds_per_task = 5;
    if (estim_seconds_per_task <= target_seconds_per_task || task_pixels == 1) return false;
    // log("subdivide task: targeting", target_seconds_per_task, ", estimated", estim_seconds_per_task, "for", task_pixels);
    // subdivide into four quadrants
    var tl = task, tr = $.extend(true, {}, task),
      bl = $.extend(true, {}, task), br = $.extend(true, {}, task);
    
    var xsplit = msg.x_from + Math.ceil((msg.x_to - msg.x_from) / 2);
    var ysplit = msg.y_from + Math.ceil((msg.y_to - msg.y_from) / 2);
    
    var x_didsplit = xsplit < msg.x_to;
    var y_didsplit = ysplit < msg.y_to;
    
    tl.message.x_to   = xsplit; tl.message.y_to   = ysplit;
    tr.message.x_from = xsplit; tr.message.y_to   = ysplit;
    bl.message.x_to   = xsplit; bl.message.y_from = ysplit;
    br.message.x_from = xsplit; br.message.y_from = ysplit;
    
    var pushed = 0;
    if (x_didsplit) {
      tr.id = this.tasks.length;
      this.tasks.push(tr);
      pushed ++;
    }
    if (y_didsplit) {
      bl.id = this.tasks.length;
      this.tasks.push(bl);
      pushed ++;
      if (x_didsplit) {
        br.id = this.tasks.length;
        this.tasks.push(br);
        pushed ++;
      }
    }
    this.shuffle(pushed);
    return true;
  };
  this.getQueuedTask = function() {
    var task = this.peekQueuedTask();
    if (task) {
      while (this.estimSubdivideTask(task)) { }
      task.state = 'processing';
    }
    return task;
  };
  this.gotQueuedTasks = function() {
    return this.peekQueuedTask() != null;
  };
  this.gotUnfinishedTasks = function() {
    for (var i = 0; i < this.tasks.length; ++i) {
      if (this.tasks[i].state != 'done') return true;
    }
    return false;
  };
  this._startWorker = function(marker, index) {
    var self = this;
    var worker = new Worker('pool.js');
    
    var workerWrapper = {
      state: '',
      worker: worker,
      worker_timeout_timer: null,
      onTimeout: function() {
        // clean up
        this.worker.terminate();
        if (this.hasOwnProperty('onError')) {
          this.onError("Timeout: computation exceeded 30s");
        }
        // and restart
        self._startWorker(marker, index);
      },
      setState: function(state) {
        if (state == 'busy') {
          if (this.state != 'idle') throw ("invalid state transition from '"+this.state+"' to 'busy'");
          this.state = 'busy';
          marker.css('background-color', 'yellow');
          this.worker_timeout_timer = new TimeoutTimer(30000, this.onTimeout.bind(this));
        } else if (state == 'idle') {
          if (this.state != 'busy' && this.state != '') {
            throw ("invalid state transition from '"+this.state+"' to 'idle'");
          }
          this.state = 'idle';
          if (this.worker_timeout_timer) this.worker_timeout_timer.kill();
          marker.css('background-color', 'lightgreen');
        } else throw ('unknown worker state '+state);
      },
      giveWork: function(msg) {
        this.setState('busy');
        this.worker.postMessage(msg);
      }
    };
    
    workerWrapper.setState('idle');
    
    var busy = false; // hahahahahha this is so dirty. so. dirty.
    
    worker.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.kind == 'finish') {
        workerWrapper.setState('idle');
        if (workerWrapper.hasOwnProperty('onComplete')) {
          workerWrapper.onComplete(msg.data);
        }
      } else if (msg.kind == 'error') {
        workerWrapper.setState('idle');
        if (workerWrapper.hasOwnProperty('onError')) {
          workerWrapper.onError(msg.error);
        }
      } else if (msg.kind == "progress") {
        if (workerWrapper.hasOwnProperty('onProgress')) {
          workerWrapper.onProgress(msg.progress);
        }
      } else if (msg.kind == "alert") {
        if (!busy) { // otherwise just drop it, it's not that important, we get lots
          busy = true; // THREAD SAFETY L O L
          alert(msg.message); // TODO only if self-connection
          busy = false;
        }
      } else if (msg.kind == "log") {
        log(msg.message); // TODO only if self-connection
      } else throw ("what is "+msg.kind);
    });
    
    this.workers[index] = workerWrapper;
  }
  this.startWorkers = function(threads) {
    for (var i = 0; i < threads; ++i) {
      var marker = $('<div class="worker-marker"></div>');
      $('#WorkerInfo .workerlist').append(marker);
      this._startWorker(marker, this.workers.length);
    }
  };
  this.disconnect = function() {
    while (this.workers.length) {
      this.workers.pop().worker.terminate();
    }
    $('#WorkerInfo').hide();
    $('#WorkerInfo .workerlist').empty();
    
    this.peer.destroy();
    this.id = null;
    
    $('#DisconnectButton').hide();
    $('#ConnectButton').show();
    setStatus("Status: not running");
  };
}

function Connect() {
  window.jsfarm = new JSFarm;
  window.jsfarm.connect();
}

function Disconnect() {
  window.jsfarm.disconnect();
  window.jsfarm = null;
}
