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
    var msg = task.msg.message;
    var cost = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * task.default_obj.quality;
    this.scores[task.origin] -= cost; // penalize
  }
  this.popTask = function() {
    if (!this.tasks.length) return null;
    var task = this.tasks.shift(); // fifo
    this.penalizeTaskOrigin(task); // Only now, that we're actually starting to compute it!
    return task;
  };
  this.addTaskMaybe = function(task) {
    // log("DEBUG: ", this.tasks.length, "==", this.limit);
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
      // if (worstscore) log("taskqueue at limit: can", ntaskscore, "beat out", worstscore, "as", task.origin, "vs.", this.tasks[worstscore_id].origin);
      if (!worstscore || worstscore >= ntaskscore) { // no tasks with worse score
        return false;
      }
      
      // we replace worstscore_id
      evict_task = this.tasks[worstscore_id];
      this.tasks.splice(worstscore_id, 1);
      
      // kick 'em while they're down
      // (the goal is to reduce evict churn)
      this.penalizeTaskOrigin(evict_task);
      // log("evict", JSON.stringify(evict_task.msg), "because", ntaskscore, "beats", worstscore);
    }
    this.tasks.push(task);
    
    if (evict_task) evict_task.evict();
    
    return true;
  };
}

/** @constructor */
function Range(x_from, y_from, x_to, y_to) {
  this.x_from = x_from;
  this.y_from = y_from;
  this.x_to = x_to;
  this.y_to = y_to;
  this.PACK_AS_OBJECT = null;
}

/** @constructor */
function WorkTask(range) {
  this.state = 'queued';
  this.assigned_to = null;
  this.progress = 0.0;
  this.message = range;
  this.sclone = function() {
    var msg = this.message;
    return new WorkTask(new Range(msg.x_from, msg.y_from, msg.x_to, msg.y_to));
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
      
      wrapper.onError = function(error, fatal) {
        con.send({kind: 'error', fatal: fatal, error: error, channel: msg.channel});
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
        // log(con.id, "task on", msg.channel);
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
          self.progress_ui.onTaskAborted(task);
          task.state = 'queued';
          task.assigned_to = null;
          markNotInFlight(task);
        };
        
        var finishTask = function(task, timer, resultInfo) {
          var msg = task.message;
          task.state = 'done';
          self.onTaskDone(msg, resultInfo);
          self.progress_ui.onTaskCompleted(task);
          self.cost_estimate_seconds += timer.elapsed() / 1000;
          self.cost_estimate_pixels += (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from);
          // log("done: "+timer.elapsed()+" for "+(msg.x_to - msg.x_from) * (msg.y_to - msg.y_from));
          markNotInFlight(task);
        };
        
        var con_control_timer = null;
        
        var finish = function(reason) {
          return function() {
            clearInterval(con_control_timer);
            // log_id(id, "finish:", reason, ",", JSON.stringify(Array.prototype.slice.call(arguments)));
            for (var i = 0; i < tasksInFlight.length; ++i) {
              var task = tasksInFlight[i];
              if (!task) continue;
              reenqueueTask(task);
              // log_id(id, "task", channel, "reset due to connection loss");
            }
            log("remove connection "+id+" because "+reason);
            self.progress_ui.onCloseConnection(id);
            delete self.connections[id];
            maybeSpawnNewConnections();
          };
        };
        
        con.on('open', function() {
          var exchanges = {};
          var channel_counter = 0;
        
          var startExchange = function() {
            var channel = channel_counter ++;
            // log(id, "start new exchange on channel", channel);
            exchanges[channel] = {};
            exchanges[channel].timer = new TimeoutTimer(50000, function() {
              // log_id(id, "exchange timed out");
              if (exchanges[channel].hasOwnProperty('task')) {
                var task = exchanges[channel].task;
                // log(id, ": timeout on", channel, "reenqueue", task.state);
                reenqueueTask(task);
                // controversial:
                // don't start a new exchange here
                // the peer has demonstrated that it cannot render this task in a timely manner
                // leave it to another peer - hope that one shows up.
              }
              delete exchanges[channel];
            });
            
            exchanges[channel].next = exchange(channel);
          };
          
          var dfl_src = null;
          
          var exchange = function(channel) {
            var advance = function() {
              if (!exchanges.hasOwnProperty(channel)) return; // we are already dead.
              exchanges[channel].timer.reset(); // something happened! reset the timeout
              exchanges[channel].next = exchanges[channel].next();
            };
            
            var cleanup = function () {
              // exchange was already killed (by a timeout?) before we received whatever caused this
              if (!exchanges.hasOwnProperty(channel)) throw "I'm pretty sure this can't happen anymore actually.";
              
              exchanges[channel].timer.kill();
              delete exchanges[channel];
            };
            
            var time_response = function(cps) {
              var from = time();
              var to = null;
              con.send({kind: "ping", channel: channel});
              con.dynamic('data', function(remove, msg) {
                if (msg.channel != channel || !exchanges.hasOwnProperty(channel)) return;
                
                if (msg.kind == 'pong') {
                  to = time();
                  remove();
                  advance();
                } else throw ("1 unexpected kind "+msg.kind+" on "+channel);
              });
              return function() { return cps(to - from); }; // yield; return to - from;
            };
            
            var get_label = function(cps) {
              con.send({kind: "whoareyou", channel: channel});
              var res = null;
              con.dynamic('data', function(remove, msg) {
                if (msg.channel != channel || !exchanges.hasOwnProperty(channel)) return;
                if (msg.kind != 'iamcalled') throw ("1.1 unexpected kind "+msg.kind);
                res = msg.label;
                remove();
                advance();
              });
              return function() { return cps(res); }; // yield; return res;
            };
            
            var taskAccepted = function(task, cps) {
              var result = null;
              var reactTaskAccepted = function(remove, msg) {
                if (msg.channel != channel || !exchanges.hasOwnProperty(channel)) return;
                
                remove();
                if (msg.kind == 'accepted') {
                  // log_id(id, "task on", msg.channel, "has been accepted.");
                  // log(id, "task on", msg.channel, "has been accepted.");
                  task.state = 'processing';
                  task.assigned_to = id;
                  // self.progress_ui.onTaskAccepted(task);
                  result = true;
                  advance();
                } else if (msg.kind == 'rejected') {
                  // log_id(id, "task", channel, "rejected:", msg.reason);
                  // log(id, "task", channel, "rejected:", msg.reason);
                  reenqueueTask(task);
                  result = false;
                  advance();
                } else throw ("2 unexpected kind "+msg.kind);
              };
              task.state = 'asking';
              tasksInFlight.push(task);
              
              con.dynamic('data', reactTaskAccepted);
              
              con.send({kind: 'task', message: task.message, channel: channel});
              return function() { return cps(result); }; // yield; return result;
            };
            
            var waitTaskDone = function(task, cps) {
              var reactTaskDone = function(remove, msg) {
                if (msg.channel != channel || !exchanges.hasOwnProperty(channel)) return;
                if (msg.kind == 'done') {
                  remove();
                  advance();
                } else if (msg.kind == 'error') {
                  // late rejection
                  if (msg.fatal) {
                    log(id, ": task", channel, "failed:", msg.fatal, msg.error, "(3)");
                    failTask(task);
                  } else {
                    // log(id, ": task", channel, "kicked from queue, was", task.state);
                    reenqueueTask(task); // recoverable, like queue kicks
                  }
                  cleanup();
                  remove();
                  // don't bother reentering this exchange
                } else if (msg.kind == 'progress') {
                  var frac = +msg.value;
                  task.progress = frac;
                  self.onTaskProgress(task.message, frac);
                  if (!task.hasOwnProperty('_progress')) {
                    self.progress_ui.onTaskAccepted(task);
                  }
                  self.progress_ui.onTaskProgressed(task);
                } else throw ("3 unexpected kind "+msg.kind);
              };
              con.dynamic('data', reactTaskDone);
              return cps; // yield
            };
            
            var waitTaskResultReceived = function(task, cps) {
              var data = null;
              var reactTaskResultReceived = function(remove, msg) {
                if (msg.channel != channel || !exchanges.hasOwnProperty(channel)) return;
                
                if (msg.kind == 'result') {
                  data = new Uint8Array(msg.data);
                  // log_id(id, "task", channel, "received data", data.length);
                  remove();
                  advance();
                } else if (msg.kind == 'error') {
                  // very late rejection
                  log(id, ": task", channel, "failed:", msg.error, "(4)");
                  if (msg.fatal) {
                    failTask(task);
                  } else {
                    reenqueueTask(task); // recoverable
                  }
                  cleanup();
                  remove();
                  // don't bother reentering
                } else throw ("4 unexpected kind "+msg.kind);
              };
              con.dynamic('data', reactTaskResultReceived);
              return function() { return cps(data); };
            };
            
            if (!self.peerinfo.hasOwnProperty(id)) self.peerinfo[id] = {};
            
            var peerinfo = self.peerinfo[id];
            
            var if_label_set_body = null;
            if (!peerinfo.hasOwnProperty('wait_label_completion')) if_label_set_body = function(cps) {
              var attached_fns = [];
              
              peerinfo.wait_label_completion = function(advance, cps) {
                attached_fns.push(advance);
                return cps; // yield
              };
              
              // we're the first - query for label
              return get_label(function(label) {
                peerinfo.label = label;
                
                // switch off waiting now that label is set
                peerinfo.wait_label_completion = function(advance, cps) { return cps(); };
                
                // wake up the waiting ones
                for (var i = 0; i < attached_fns.length; ++i) attached_fns[i]();
                
                return cps(); // proceed directly.
              });
            };
            else if_label_set_body = function(cps) {
              return cps();
            };
            
            return if_label_set_body(function() {
              return peerinfo.wait_label_completion(advance, function() {
                if (firstExchangeOnConnection) {
                  // as soon as we have the label...
                  self.progress_ui.onOpenConnection(id, peerinfo.label);
                  firstExchangeOnConnection = false;
                  con.send({kind: 'default', object: self.task_defaults});
                }
                
                var if_ping_set_body = null;
                if (!self.peerinfo[id].hasOwnProperty('ping')) if_ping_set_body = function(cps) {
                  // prevent other channels from starting duplicate checks
                  self.peerinfo[id].ping = null;
                  
                  var tries = 3;
                  var sum = 0;
                  
                  var i = 0;
                  var loop_body = function(cps) {
                    return time_response(function(t) {
                      sum += t;
                      if (i < tries) {
                        i++;
                        return loop_body(cps);
                      } else return cps();
                    });
                  };
                  
                  return loop_body(function() {
                    var ping = sum / tries;
                    // log_id(id, "ping", "is "+(ping|0)+"ms");
                    self.peerinfo[id].ping = ping;
                    return cps();
                  });
                }; else if_ping_set_body = function(cps) {
                  return cps();
                };
                
                return if_ping_set_body(function() {
                  var task = self.getQueuedTask();
                  if (!task) {
                    cleanup();
                    return null;
                  }
                  
                  exchanges[channel].task = task;
                  
                  // log(id, "submit task", channel, ":", task.message.x_from, task.message.y_from);
                  // log_id(id, "task", channel, "submitting");
                  
                  var if_task_accepted_body = function(cps) {
                    return taskAccepted(task, function(accepted) {
                      if (accepted) {
                        self.onTaskStart(task.message);
                        // maybe this peer has more threads free?
                        // start a new exchange
                        startExchange();
                        return cps();
                      } else {
                        cleanup();
                        return null;
                      }
                    });
                  };
                  
                  return if_task_accepted_body(function() {
                    return waitTaskDone(task, function() {
                      // maybe peer has more threads free now!! :o
                      // nag it some more
                      startExchange();
                      
                      return waitTaskResultReceived(task, function(data) {
                        // log("received task", id, ":", channel, ":", task.message.y_from);
                        var resultInfo = {
                          x_from: task.message.x_from,
                          y_from: task.message.y_from,
                          x_to: task.message.x_to,
                          y_to: task.message.y_to,
                          data: data
                        };
                        
                        finishTask(task, exchanges[channel].timer, resultInfo);
                        
                        cleanup();
                      });
                    });
                  });
                });
              });
            });
          };
          
          // in the absence of other occasions, start a fresh exchange at least once a second
          // this prevents us from getting stuck if we get rejected on all fronts, for instance
          
          con_control_timer = setInterval(function() {
            if (self.gotUnfinishedTasks()) {
              startExchange();
            } else {
              con.close(); // work is done, shut down.
            }
          }, 1000);
          
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
      var newConnections_timer;
      var openNewConnectionsPeriodically = function() {
        // TODO self.done()
        if (!self.gotUnfinishedTasks()) {
          clearInterval(newConnections_timer);
          return;
        }
        maybeSpawnNewConnections();
      };
      newConnections_timer = setInterval(openNewConnectionsPeriodically, 1000);
      maybeSpawnNewConnections();
      
      var recheck_timer;
      var recheckPeersPeriodically = function() {
        // TODO self.done()
        if (!self.gotUnfinishedTasks()) {
          clearInterval(recheck_timer);
          return;
        }
        
        if (!must_recheck_flag) return;
        must_recheck_flag = false; // yes yes, I'm on it
        
        recheckPeers();
      };
      recheck_timer = setInterval(recheckPeersPeriodically, 10000);
      recheckPeers();
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
  this.onTaskAdd = null;
  this.onTaskStart = null;
  this.onTaskDone = null;
  this.onTaskProgress = null;
  this.addTask = function(range) {
    var task = new WorkTask(range);
    if (this.onTaskAdd) this.onTaskAdd(range);
    this.tasks.push(task);
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
  this.task_defaults = {};
  this.estimSubdivideTask = function(task) {
    var msg = task.message;
    var dw = this.task_defaults.dw, dh = this.task_defaults.dh;
    var task_pixels = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from);
    var estim_seconds_per_pixel = this.cost_estimate_seconds / this.cost_estimate_pixels;
    var estim_seconds_per_task = task_pixels * estim_seconds_per_pixel;
    var max_seconds_per_task = 10;
    var must_split = msg.x_to > dw || msg.y_to > dh; // invalid as-is
    if (!must_split && (estim_seconds_per_task <= max_seconds_per_task || task_pixels == 1)) return false;
    // log("subdivide task: targeting", max_seconds_per_task, ", estimated", estim_seconds_per_task, "for", task_pixels);
    // subdivide into four quadrants
    var tl = task, tr = task.sclone(), bl = task.sclone(), br = task.sclone();
    
    var xsplit = msg.x_from + Math.ceil((msg.x_to - msg.x_from) / 2);
    var ysplit = msg.y_from + Math.ceil((msg.y_to - msg.y_from) / 2);
    
    var x_didsplit = xsplit < msg.x_to;
    var y_didsplit = ysplit < msg.y_to;
    
    tl.message.x_to   = xsplit; tl.message.y_to   = ysplit;
    tr.message.x_from = xsplit; tr.message.y_to   = ysplit;
    bl.message.x_to   = xsplit; bl.message.y_from = ysplit;
    br.message.x_from = xsplit; br.message.y_from = ysplit;
    
    var task_touches_area = function(task) {
      var msg = task.message;
      return msg.x_from < dw && msg.y_from < dh;
    };
    
    var pushed = 0;
    if (x_didsplit && task_touches_area(tr)) {
      if (this.onTaskAdd) this.onTaskAdd(tr.message);
      this.tasks.push(tr);
      pushed ++;
    }
    if (y_didsplit && task_touches_area(bl)) {
      if (this.onTaskAdd) this.onTaskAdd(bl.message);
      this.tasks.push(bl);
      pushed ++;
    }
    if (x_didsplit && y_didsplit && task_touches_area(br)) {
      if (this.onTaskAdd) this.onTaskAdd(br.message);
      this.tasks.push(br);
      pushed ++;
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
          this.onError("Timeout: computation exceeded 30s", false);
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
          workerWrapper.onError(msg.error, true);
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
