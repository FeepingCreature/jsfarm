function setStatus(msg) {
  $('#StatusPanel').html(msg);
}

function log_id(id) {
  var msg = Array.prototype.slice.call(arguments).slice(1).join(" ");
  var div_id = "div_for_"+id;
  var existing = $(document.getElementById(div_id));
  var target = null;
  if (existing.length > 0) {
    target = existing.last();
    target.find('div').empty();
  } else {
    var div = $('<div></div>');
    var msgdiv = $('<div></div>');
    div.append(document.createTextNode("> "+id+": "));
    div.append(msgdiv);
    msgdiv.css("border", "1px solid gray").css("display", "inline-block");
    div.attr("id", div_id);
    logJq(div);
    target = div;
  }
  target.find('div').append(document.createTextNode(msg));
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
    this.scores[task.origin] --; // penalize
  }
  this.popTask = function() {
    if (!this.tasks.length) return null;
    return this.tasks.shift(); // fifo
  };
  this.addTaskMaybe = function(task) {
    if (this.tasks.length == this.limit) {
      // maybe we replace a queued task?
      // find the queued task with the worst score
      var worstscore = null, worstscore_id = null;
      for (var i = 0; i < this.tasks.length; ++i) {
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
      var task = this.tasks[worstscore_id];
      log("kick", JSON.stringify(task.msg));
      task.evict();
      
      this.tasks = this.tasks.splice(worstscore_id, 1);
    }
    this.penalizeTaskOrigin(task);
    this.tasks.push(task);
    return true;
  };
}

/** @constructor */
function JSFarm() {
  this.workers = [];
  
  this.tasks = [];
  
  this.peerlist = [];
  this.peerlist_last_updated = null;
  
  this.peerinfo = {};
  
  this.connection_limit = 10;
  this.connections = {};
  
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
  this.start = function() {
    var self = this;
    
    var peer = self._openPeer();
    if (!peer) return;
    
    self.peer = peer;
    
    setStatus("Status: connecting");
    
    peer.on('connection', self.handleIncomingConnection.bind(self));
    peer.on('open', function(id) {
      setStatus("Status: connected as "+id);
      window.onbeforeunload = Stop;
      
      // sanity limit
      var threads = Math.min(16, parseInt($('#settings input#threads').val(), 10));
      
      self.startWorkers(threads);
      self.taskqueue.limit = threads;
    });
    $('#WorkerInfo').show().css('display', 'inline-block');
    
    $('#StartButton').hide();
    $('#StopButton').show();
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
      
      wrapper.onError = function(error) {
        con.send({kind: 'error', error: error, channel: msg.channel});
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
    
    var default_obj = {};
    
    var handleTask = function(msg) {
      if (msg.kind == 'default') {
        default_obj = msg.object;
        return;
      }
      if (msg.kind == 'task') {
        var task = new RobinTask(con, function() {
          con.send({kind: 'error', reason: 'task evicted from queue', channel: msg.channel});
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
        log_id(id, "attempt to connect");
        var con = peer.connect(id);
        
        var con_refs = 0;
        var con_claim = function() { con_refs ++; };
        var con_release = function() {
          if (--con_refs == 0) {
            log("nothing relevant happening on connection - close.");
            con.close();
          }
        };
        
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
        
        var finishTask = function(task, resultInfo) {
          task.state = 'done';
          task.onDone(resultInfo);
          markNotInFlight(task);
        };
        
        var finish = function(reason) {
          return function() {
            log_id(id, "finish:", reason, ",", JSON.stringify(Array.prototype.slice.call(arguments)));
            for (var i = 0; i < tasksInFlight.length; ++i) {
              var task = tasksInFlight[i];
              if (!task) continue;
              task.state = 'queued';
              log_id(id, "task", task.id, "reset due to connection loss");
            }
            log("remove connection "+id+" because "+reason);
            delete self.connections[id];
            maybeSpawnNewConnections();
          };
        };
        
        con.on('open', function() {
          var exchanges = [];
          var channel_counter = 0;
          
          var startExchange = function() {
            var channel = channel_counter ++;
            log_id(id, "start new exchange on channel", channel);
            exchanges[channel] = exchange(channel);
            exchanges[channel].timer = new TimeoutTimer(50000, function() {
              log_id(id, "task timed out");
              var self = exchanges[channel].timer;
              if (self.hasOwnProperty('task')) {
                // back to queue!
                log("timeout on", id, "reenqueue", self.task.id);
                self.task.state = 'queued';
                markNotInFlight(self.task);
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
              exchanges[channel].next();
            };
            
            con_claim();
            function cleanup(quietly) {
              con_release();
              if (!quietly) log_id(id, "task cleanup: kill timer on channel", channel);
              exchanges[channel].timer.kill();
              exchanges[channel] = null;
            }
            
            var time = function*() {
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
            
            var taskAccepted = function*(task) {
              var result = null;
              var reactTaskAccepted = function(msg) {
                if (msg.channel != channel) return;
                
                if (msg.kind == 'accepted') {
                  task.state = 'processing';
                  result = true;
                  advance();
                  return true;
                } else if (msg.kind == 'rejected') {
                  // back in the queue you go
                  task.state = 'queued';
                  markNotInFlight(task);
                  
                  log_id(id, "task", task.id, "rejected:", msg.reason);
                  result = false;
                  advance();
                  return true;
                } else throw ("2 unexpected kind "+msg.kind);
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
                  task.state = 'failed';
                  markNotInFlight(task);
                  log(id, ": task", task.id, "failed:", msg.error);
                  
                  advance();
                  return true;
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
                  log_id(id, "task", task.id, "received data", data.length);
                  advance();
                  return true;
                } else throw ("4 unexpected kind "+msg.kind);
              };
              con.onceSuccessful('data', reactTaskResultReceived);
              yield;
              return data;
            };
            
            if (!self.peerinfo.hasOwnProperty(id)) self.peerinfo[id] = {};
            if (!self.peerinfo[id].hasOwnProperty('ping')) {
              log_id(id, "measure ping");
              self.peerinfo[id].ping = null;
              var tries = 3;
              var sum = 0;
              for (var i = 0; i < tries; ++i) {
                sum += yield* time();
              }
              var ping = sum / tries;
              log_id(id, "ping", "is "+(ping|0)+"ms");
              self.peerinfo[id].ping = ping;
            }
            
            var task = self.getQueuedTask();
            if (!task) {
              cleanup(true);
              return;
            }
            
            exchanges[channel].timer.task = task;
            
            // log("submit task", id, ":", task.id, ":", task.message.from);
            log_id(id, "task", task.id, "submitting");
            
            if (yield* taskAccepted(task)) {
              task.onStart();
              // maybe this peer has more threads free?
              // start a new exchange
              startExchange();
            } else {
              cleanup(true);
              return;
            }
            
            log_id(id, "task", task.id, "was accepted");
            
            yield* waitTaskDone();
            
            // maybe peer has more threads free now!! :o
            // nag it some more
            startExchange();
            
            var data = yield* waitTaskResultReceived();
            
            // log("received task", id, ":", task.id, ":", task.message.from);
            
            var resultInfo = {
              from: task.message.from,
              to: task.message.to,
              data: data
            };
            
            finishTask(task, resultInfo);
            
            cleanup(false);
            return;
          };
          
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
  this.run = function() { this.giveWorkToIdlePeers(); };
  this.taskcount = 0;
  this.addTask = function(msg) {
    var task = {
      state: 'queued',
      id: this.taskcount++,
      message: msg,
      onStart: function() { },
      onDone: function() { }
    };
    this.tasks.push(task);
    return {
      onDone: function(fn) { task.onDone = fn; return this; },
      onStart: function(fn) { task.onStart = fn; return this; }
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
  this.getQueuedTask = function() {
    var task = this.peekQueuedTask();
    if (task) {
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
        // cleanup
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
        // if (update) update((msg.progress * 100 + 0.5)|0);
      } else if (msg.kind == "alert") {
        if (!busy) { // otherwise just drop it, it's not that important, we get lots
          busy = true; // THREAD SAFETY L O L
          alert(msg.message); // TODO only if self-connection
          busy = false;
        }
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
  this.stop = function() {
    while (this.workers.length) {
      this.workers.pop().worker.terminate();
    }
    $('#WorkerInfo').hide();
    $('#WorkerInfo .workerlist').empty();
    
    this.peer.destroy();
    
    $('#StopButton').hide();
    $('#StartButton').show();
    setStatus("Status: not running");
  };
}

function Start() {
  window.jsfarm = new JSFarm;
  window.jsfarm.start();
}

function Stop() {
  window.jsfarm.stop();
  window.jsfarm = null;
}
