function setStatus(msg) {
  $('#StatusPanel').html(msg);
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

function JSFarm() {
  this.workers = [];
  
  this.tasks = [];
  
  this.peerlist = [];
  this.peerlist_last_updated = null;
  
  this.peerinfo = [];
  
  this.async_check_state = "idle";
  
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
      debug: 0
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
    });
    $('#WorkerInfo').show().css('display', 'inline-block');
    
    $('#StartButton').hide();
    $('#StopButton').show();
  };
  this.handleIncomingConnection = function(con) {
    var self = this;
    
    log("incoming", con.id);
    
    var handlePing = function(msg) {
      if (msg.kind == "ping") {
        con.send({kind: "pong", channel: msg.channel});
      }
    };
    
    var handleTask = function(msg) {
      if (msg.kind == 'task') {
        // any workers idle?
        for (var i = 0; i < self.workers.length; ++i) {
          var wrapper = self.workers[i];
          if (wrapper.state == 'idle') {
            // TODO error recovery
            wrapper.onComplete = function(data) {
              con.send({kind: 'done', channel: msg.channel});
              con.send({kind: 'result', channel: msg.channel, data: data.buffer});
              delete wrapper.onComplete;
              wrapper.state = 'idle';
            };
            wrapper.giveWork(msg.message);
            con.send({kind: 'accepted', channel: msg.channel});
            return;
          }
        }
        con.send({kind: 'rejected', reason: 'all workers busy', channel: msg.channel});
      }
    };
    
    con.on('data', handlePing);
    con.on('data', handleTask);
  };
  this.asyncCheckPeers = function() {
    var self = this;
    
    if (self.async_check_state != "idle") {
      // already got a pass running
      return;
    }
    
    self.async_check_state = "busy";
    setStatus("busy", "peer check");
    
    self.giveWorkToIdlePeers();
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
    
    
    var lastChecked = null;
    var recheckPeers = function() {
      var t = (new Date()).getTime();
      if (lastChecked == null || (t - lastChecked) > 10000) {
        lastChecked = Infinity; // never recheck while we're running
        log("it is time to relist peers");
        self.peer.listAllPeers(function(peers) {
          peerlist = peers;
          // restart the clock
          lastChecked = (new Date()).getTime();
          callBackWithNewPeers();
        });
      }
    };
    
    fn(recheckPeers, setPeerHandler);
  };
  this.giveWorkToIdlePeers = function() {
    var self = this;
    
    var goIdle = function() {
      setStatus("idle", "peer check");
      self.async_check_state = "idle";
    };
    
    var peer = self.peer;
    if (!peer) {
      goIdle();
      return;
    }
    
    self.listAllPeersDelayed(function(recheckPeers, setPeerHandler) {
      var ids = [];
      setPeerHandler(function(id) { ids.push(id); });
      
      var maybeSpawnNewConnections = null;
      
      connect = function(id) {
        log(id, "attempt to connect");
        var con = peer.connect(id);
        
        var con_refs = 0;
        var con_claim = function() { con_refs ++; };
        var con_release = function() {
          if (--con_refs == 0) {
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
            log(id, "finish:", reason, ",", JSON.stringify(Array.prototype.slice.call(arguments)));
            for (var i = 0; i < tasksInFlight.length; ++i) {
              var task = tasksInFlight[i];
              if (!task) continue;
              task.state = 'queued';
              log(id, "task", task.id, "reset due to connection loss");
            }
            delete self.connections[id];
            maybeSpawnNewConnections();
            if (!self.connections.length) {
              goIdle();
            }
          };
        };
        
        con.on('open', function() {
          var exchanges = [];
          
          var startExchange = function() {
            var channel = exchanges.length;
            log(id, "start new exchange on channel", channel);
            exchanges[channel] = exchange(channel);
            exchanges[channel].next();
          };
          
          var exchange = function*(channel) {
            var advance = function() {
              exchanges[channel].next();
            };
            con_claim();
            var time = function*() {
              var from = (new Date()).getTime();
              var to = null;
              con.send({kind: "ping", channel: channel});
              con.onceSuccessful('data', function(msg) {
                if (msg.channel != channel) return;
                
                if (msg.kind == 'pong') {
                  to = (new Date()).getTime();
                  advance();
                  return true;
                }
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
                  
                  log(id, "task", task.id, "rejected:", msg.reason);
                  result = false;
                  advance();
                  return true;
                }
              };
              task.state = 'asking';
              tasksInFlight.push(task);
              
              con.onceSuccessful('data', reactTaskAccepted);
              con.send({kind: 'task', message: task.message, channel: channel});
              yield;
              return result;
            };
            
            var waitTaskDone = function*() {
              var reactTaskDone = function(msg) {
                if (msg.channel != channel) return;
                if (msg.kind == 'done') {
                  advance();
                  return true;
                }
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
                  log(id, "task", task.id, "received data", data.length);
                  advance();
                  return true;
                }
              };
              con.onceSuccessful('data', reactTaskResultReceived);
              yield;
              return data;
            };
            
            if (!self.peerinfo.hasOwnProperty(id)) self.peerinfo[id] = {};
            if (!self.peerinfo[id].ping) {
              log(id, "measure ping");
              var tries = 3;
              var sum = 0;
              for (var i = 0; i < tries; ++i) {
                sum += yield* time();
              }
              var ping = sum / tries;
              log(id, "ping", "is "+(ping|0)+"ms");
              self.peerinfo[id].ping = ping;
            }
            
            var task = self.getQueuedTask();
            if (!task) {
              con_release();
              return;
            }
            
            log(id, "task", task.id, "submitting");
            
            if (yield* taskAccepted(task)) {
              task.onStart();
              // maybe this peer has more threads free?
              // start a new exchange
              startExchange();
            } else {
              con_release();
              return;
            }
            
            log(id, "task", task.id, "was accepted");
            
            yield* waitTaskDone();
            
            // maybe peer has more threads free now!! :o
            // nag it some more
            startExchange();
            
            var data = yield* waitTaskResultReceived();
            
            var resultInfo = {
              from: task.message.from,
              to: task.message.to,
              data: data
            };
            
            finishTask(task, resultInfo);
            
            con_release();
            return;
          };
          
          startExchange();
        });
        con.on('close', finish("close"));
        con.on('error', finish("error"));
        
        self.connections[id] = con;
      };
      
      var delay = 10;
      maybeSpawnNewConnections = function() {
        if (!self.tasks.length) return;
        
        while (true) {
          recheckPeers();
          if (!ids.length || Object.keys(self.connections).length >= self.connection_limit) {
            break;
          }
          connect(ids.pop());
        }
        if (!ids.length) {
          if (Object.keys(self.connections).length > 0) {
            log("No new peers found, but we're busy enough. Retrying in 10s");
            setTimeout(maybeSpawnNewConnections, 10000);
          } else {
            log("No peers found yet. Retrying in "+Math.floor(delay)+"ms");
            setTimeout(maybeSpawnNewConnections, delay);
            delay = Math.min(10000, delay * 1.5);
          }
        } else {
          log("connection limit reached for now");
        }
      };
      maybeSpawnNewConnections();
    });
  };
  this.run = function() {
    if (!this.tasks.length) return;
    this.asyncCheckPeers();
    setTimeout(this.run.bind(this), 1000);
  };
  this.taskcount = 0;
  this.addTask = function(msg) {
    var task = {
      state: "queued",
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
  this.getQueuedTask = function() {
    while (this.tasks.length && this.tasks[0].state == 'done') {
      this.tasks.shift();
    }
    for (var i = 0; i < this.tasks.length; ++i) {
      var task = this.tasks[i];
      if (task.state == 'queued') return task;
    }
    return null;
  };
  this._startWorker = function() {
    var worker = new Worker('pool.js');

    var marker = $('<div class="worker-marker"></div>');
    $('#WorkerInfo .workerlist').append(marker);
    
    var workerWrapper = {
      state: '',
      worker: worker,
      setState: function(state) {
        if (state == 'busy') {
          this.state = 'busy';
          marker.css('background-color', 'yellow');
        } else if (state == 'idle') {
          this.state = 'idle';
          marker.css('background-color', 'lightgreen');
        } else throw ('unknown worker state '+state);
      },
      giveWork: function(msg) {
        this.setState('busy');
        this.worker.postMessage(msg);
      }
    };
    
    workerWrapper.setState('idle');
    
    worker.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.kind == 'finish') {
        if (workerWrapper.hasOwnProperty('onComplete')) {
          workerWrapper.setState('idle');
          workerWrapper.onComplete(msg.data);
        }
      } else if (msg.kind == "progress") {
        // if (update) update((msg.progress * 100 + 0.5)|0);
      } else if (msg.kind == "alert") {
        alert(msg.message); // TODO only if self-connection
      } else throw ("what is "+msg.kind);
    });
    
    this.workers.push(workerWrapper);
  }
  this.startWorkers = function(threads) {
    for (var i = 0; i < threads; ++i) {
      this._startWorker();
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
