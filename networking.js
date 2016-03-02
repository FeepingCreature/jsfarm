function setStatus(msg) {
  $('#StatusPanel').html(msg);
}

function log_id(id) {
  var msg = Array.prototype.slice.call(arguments, 1).join(" ");
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

function getMyLabel(self) {
  var jq_ident = ""+document.getElementById('ident').value;
  if (jq_ident == "") jq_ident = null;
  return jq_ident || self.id;
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
  this.prioritize = false;
}

/** @constructor */
function RobinQueue(limit) {
  this.scores = Object.create(null);
  this.limit = limit;
  this.tasks = [];
  this.getScoreForTask = function(task) {
    if (task.prioritize) return 1;
    if (task.origin in this.scores) {
      return this.scores[task.origin];
    }
    return 0;
  };
  this.penalizeTaskOrigin = function(task) {
    if (task.prioritize) return;
    if (!(task.origin in this.scores)) {
      this.scores[task.origin] = 0;
    }
    var msg = task.msg.message;
    var cost = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (task.i_to - task.i_from);
    this.scores[task.origin] -= cost; // penalize
  }
  this.popTask = function() {
    if (!this.tasks.length) return null;
    var task = this.tasks.shift(); // fifo
    this.penalizeTaskOrigin(task); // only penalize now that we're actually starting to compute it!
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
function Range(x_from, y_from, i_from, x_to, y_to, i_to) {
  this.x_from = x_from;
  this.y_from = y_from;
  this.i_from = i_from;
  this.x_to = x_to;
  this.y_to = y_to;
  this.i_to = i_to;
  this.PACK_AS_OBJECT = null;
}

var worktask_id = 0;

/** @constructor */
function WorkTask(range) {
  this.state = 'queued';
  this.id = worktask_id ++;
  this.assigned_to = null;
  this.progress = 0.0;
  this.message = range;
  this.sclone = function() {
    var msg = this.message;
    return new WorkTask(new Range(msg.x_from, msg.y_from, msg.i_from, msg.x_to, msg.y_to, msg.i_to));
  };
}

var global_help_stats = {
  num_renders_helped: 0,
  num_samples_helped: 0,
  dom_renders_helped: null,
  dom_samples_helped: null,
  init: function() {
    this.dom_renders_helped = document.createTextNode(this.num_renders_helped);
    this.dom_samples_helped = document.createTextNode(this.num_samples_helped);
    var jq = $('<span class="helping">You have helped </span>').
      append($('<b></b>').append(this.dom_renders_helped)).
      append(" peers render ").
      append($('<b></b>').append(this.dom_samples_helped)).
      append(" samples.");
    $('#HelpedInfo').append(jq);
  },
  updateInfo: function() {
    this.dom_renders_helped.nodeValue = this.num_renders_helped.toString();
    this.dom_samples_helped.nodeValue = this.num_samples_helped.toLocaleString();
  }
};

/** @constructor */
function HelpStats() {
  this.div = $('<div class="helping">&gt; Incoming connection.</div>');
  this.samples_helped = 0;
  this.jq_peername = null;
  this.was_logged = false;
  this.first_result_submitted = true;
  this.killed = false;
  this.t_last_updated = 0;
  
  this.onLearnLabel = function(label) {
    this.jq_peername = $('<b class="peername"></b>').text(label);
  };
  this.onSendResult = function(samples) {
    if (this.killed) return;
    
    this.samples_helped += samples;
    
    var t = time();
    if (t - this.t_last_updated > 100) {
      this.t_last_updated = t;
      
      if (!this.was_logged) {
        this.dom_samples_helped = document.createTextNode("");
        var div = $('<div class="helping">&gt; You have helped </div>').
          append(this.jq_peername).
          append(" render ").
          append($('<b></b>').append(this.dom_samples_helped)).
          append(" samples! Thank you!");
        logJq(div);
        this.was_logged = true;
      }
      this.dom_samples_helped.nodeValue = this.samples_helped.toLocaleString();
    }
    
    if (this.first_result_submitted) {
      global_help_stats.num_renders_helped++;
      if (global_help_stats.num_renders_helped == 1) global_help_stats.init();
      this.first_result_submitted = false;
    }
    global_help_stats.num_samples_helped += samples;
    global_help_stats.updateInfo();
  };
  // oh wait, this client that's connected to me is just myself. don't log.
  this.ohWaitNoItsJustMe = function() {
    this.killed = true;
  };
}

/** @constructor */
function ServerConnection() {
  this.workers = [];
  
  this.peerjs = null;
  
  this.id = null;
  
  // used as a quick and dirty way to recognize ourselves to prioritize our own tasks.
  // easy to spoof, but would require us having connected to the spoofer previously.
  this.secret = ""+Math.random(); // lol uuid
  
  this.taskqueue = new RobinQueue(0);
  
  this._connectPeerJs = function() {
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
  this.checkQueue = function() {
    var self = this;
    
    function giveTaskToThread(wrapper, task) {
      var msg = task.msg;
      var con = task.con;
      
      wrapper.onComplete = function(data) {
        con.send({kind: 'done', channel: msg.channel});
        con.send({kind: 'result', channel: msg.channel, data: data.buffer});
        delete wrapper.onComplete;
        
        var pixels = data.buffer.byteLength / 4;
        con.helpstats.onSendResult((msg.message.i_to - msg.message.i_from) * pixels);
        
        // worker has gone idle, maybe we can assign a queued task?
        self.checkQueue();
      };
      
      wrapper.onProgress = function(frac) {
        con.send({kind: 'progress', value: frac, channel: msg.channel});
      };
      
      wrapper.onError = function(error, nature) {
        con.send({kind: 'error', nature: nature, error: error, channel: msg.channel});
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
    
    con.helpstats = new HelpStats();
    
    var handlePing = function(msg) {
      if (msg.kind == "ping") {
        con.send({kind: "pong", channel: msg.channel});
      }
    };
    
    var handleLabel = function(msg) {
      if (msg.kind == "whoareyou") {
        con.helpstats.onLearnLabel(msg.whoami);
        con.send({kind: "iamcalled", label: getMyLabel(self), channel: msg.channel});
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
          con.send({kind: 'error', nature: 'evict', error: 'task evicted from queue', channel: msg.channel});
        });
        task.msg = msg;
        task.default_obj = default_obj;
        if (msg.secret === self.secret) {
          con.helpstats.ohWaitNoItsJustMe();
          task.prioritize = true;
        }
        
        if (self.taskqueue.addTaskMaybe(task)) {
          // log("accept task "+JSON.stringify(msg));
          con.send({kind: 'accepted', channel: msg.channel});
          // queue has gained a task, maybe we can assign it to a worker?
          self.checkQueue();
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
          this.onError("Timeout: computation exceeded 30s", 'timeout');
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
          workerWrapper.onError(msg.error, 'fatal');
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
    if (this.workers.length) throw "internal error";
    this.workers = new Array(threads);
    for (var i = 0; i < threads; ++i) {
      var marker = $('<div class="worker-marker"></div>');
      $('#WorkerInfo .workerlist').append(marker);
      this._startWorker(marker, i);
    }
  };
  this.connect = function() {
    var self = this;
    
    self.peerjs = self._connectPeerJs();
    if (!self.peerjs) return;
    
    setStatus("Status: connecting");
    
    self.peerjs.on('connection', self.handleIncomingConnection.bind(self));
    self.peerjs.on('open', function(id) {
      setStatus("Status: connected as "+id);
      self.id = id;
      $(window).on('unload', null, Disconnect);
      
      // sanity limit
      var threads = Math.min(36, document.getElementById('threads').value|0);
      
      self.startWorkers(threads);
      self.taskqueue.limit = threads;
    });
    $('#WorkerInfo').show().css('display', 'inline-block');
    
    $('#ConnectButton').hide();
    $('#DisconnectButton').show();
  };
  this.disconnect = function() {
    while (this.workers.length) {
      this.workers.pop().worker.terminate();
    }
    $(window).off('unload', null, Disconnect);
    $('#WorkerInfo').hide();
    $('#WorkerInfo .workerlist').empty();
    
    this.peerjs.destroy();
    this.id = null;
    
    $('#DisconnectButton').hide();
    $('#ConnectButton').show();
    setStatus("Status: not running");
  };
};

/** @constructor */
function PerfEstimator() {
  this.pixels = 0;
  this.seconds = 1;
  this.reset = function() {
    this.pixels = 0;
    this.seconds = 1;
  };
  this.feedback = function(pixels, seconds) {
    this.pixels += pixels;
    this.seconds += seconds;
  };
  this.estimate = function(pixels) {
    return (this.seconds / this.pixels) * pixels;
  };
}

/** @constructor */
function HandlerFn(channel, kind, fn) {
  this.channel = channel;
  this.kind = kind;
  this.fn = fn;
  this.matches = function(msg) {
    if (msg.channel != this.channel) return false;
    if (this.kind instanceof RegExp) return this.kind.test(msg.kind);
    else return this.kind == msg.kind;
  };
}

/** @constructor */
function MessageDispatcher() {
  this.msgqueue = Object.create(null);
  this.msgqueue_id = 0;
  this.handlers = Object.create(null);
  this.handlers_id = 0;
  this.killed = false;
  this.waitMsg = function(channel, kind, fn) {
    var handler = new HandlerFn(channel, kind, fn);
    for (var key in this.msgqueue) {
      if (handler.matches(this.msgqueue[key])) {
        var remove = handler.fn(this.msgqueue[key]);
        delete this.msgqueue[key]; // successfully delivered!
        if (remove) return; // no need to store handler at all
      }
    }
    this.handlers[this.handlers_id++] = handler;
  };
  this.finish = function() {
    this.killed = true;
  };
  this.onDataReliable = function(msg) {
    if (this.killed) return; // drop all further messages
    // we can be assured we're running on the main thread, here.
    for (var key in this.handlers) {
      var handler = this.handlers[key];
      if (handler.matches(msg)) {
        if (handler.fn(msg)) delete this.handlers[key];
        return;
      }
    }
    // message has no handler
    // hold it for later, in case a handler for it turns up
    this.msgqueue[this.msgqueue_id++] = msg;
  };
  var self = this;
  this.onData = function(msg) {
    // TODO call directly on chrome (which is sane)
    setTimeout(function() {
      self.onDataReliable(msg);
    }, 0);
  };
}

/** @constructor */
function RenderWorkset(connection) {
  var self = this;
  
  this.workers = [];
  
  this.tasks = [];
  this.task_defaults = {};
  this.progress_ui = new ProgressUI(function() { return self.task_defaults.dw * self.task_defaults.dh * self.task_defaults.di; });
  
  this.peerlist = [];
  this.peerlist_last_updated = null;
  
  this.peerinfo = {};
  
  this.connection_limit = 10;
  this.connections = Object.create(null);
  this.id = null;
  
  this.connection = connection;
  
  // must be here, not in Connection, because we can't synchronize on cps from another Workset
  this.peerinfo = {};
  
  this.onTaskAdd = null;
  this.onTaskStart = null;
  this.onTaskDone = null;
  this.onTaskProgress = null;
  this.estimators_con = {};
  this.killed = false;
  
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
          // log("discovered new peer", id);
          peersHandled[id] = true;
          peerHandler(id);
        }
      }
    };
    
    var recheckPeers = function() {
      // log("relisting peers");
      self.connection.peerjs.listAllPeers(function(peers) {
        peerlist = peers;
        callBackWithNewPeers();
      });
    };
    
    fn(recheckPeers, setPeerHandler);
  };
  this.giveWorkToIdlePeers = function() {
    var self = this;
    
    var peer = self.connection.peerjs;
    
    if (!peer) {
      log("No peer connection established!");
      return;
    }
    
    var goIdle = function() { setStatus("idle", "peer check"); };
    
    // don't list peers if we got no work for them
    if (!self.gotQueuedTasks()) return;
    
    self.listAllPeersDelayed(function(recheckPeers, setPeerHandler) {
      var maybeSpawnNewConnections = null;
      
      var connect = function(id) {
        // log_id(id, "attempt to connect");
        var con = peer.connect(id);
        
        var firstExchangeOnConnection = true;
        
        var tasksInFlight = Object.create(null);
        
        var failTask = function(task) {
          if (task.state != 'accepted') throw ("failTask: invalid state transition: '"+task.state+"' to 'failed'");
          task.state = 'failed';
          self.progress_ui.onTaskAborted(task);
          delete tasksInFlight[task.id];
          self.checkAreWeDone();
        };
        
        var reenqueueTask = function(task, reason) {
          self.progress_ui.onTaskAborted(task);
          if (reason == 'timeout') {
            // Well clearly it wasn't a very good estimate, now!
            self.getPerfEstimatorFor(id).reset();
          }
          if (task.state != 'asking' && task.state != 'accepted') throw ("reenqueueTask: invalid state transition: '"+task.state+"' to 'queued'");
          task.state = 'queued';
          task.assigned_to = null;
          delete tasksInFlight[task.id];
        };
        
        var finishTask = function(task, timer, resultInfo) {
          var msg = task.message;
          if (task.state != 'accepted') throw ("finishTask: invalid state transition: '"+task.state+"' to 'done'");
          task.state = 'done';
          self.onTaskDone(msg, resultInfo);
          self.progress_ui.onTaskCompleted(task);
          
          var samples_rendered = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (msg.i_to - msg.i_from);
          var time_taken = timer.elapsed() / 1000;
          self.getPerfEstimatorFor(id).feedback(samples_rendered, time_taken);
          
          // log("done: "+timer.elapsed()+" for "+(msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (msg.i_to - msg.i_from));
          delete tasksInFlight[task.id];
          self.checkAreWeDone();
        };
        
        var con_control_timer = null;
        
        var exchanges = Object.create(null);
        
        var dispatch = new MessageDispatcher();
        con.on('data', dispatch.onData);
        
        var finish = function(reason) {
          var finish_fn = function() {
            dispatch.finish();
            for (var key in exchanges) {
              exchanges[key].timer.kill();
              delete exchanges[key];
            }
            clearInterval(con_control_timer);
            // log_id(id, "finish:", reason, ",", JSON.stringify(Array.prototype.slice.call(arguments)));
            // log(id, "removing connection because", reason);
            for (var key in tasksInFlight) {
              var task = tasksInFlight[key];
              if (task.assigned_to && task.assigned_to != id) {
                throw "why are we seeing a task from another connection?";
              }
              reenqueueTask(task, 'close');
            }
            if (Object.keys(tasksInFlight).length > 0) throw "internal error - tasks left in queue";
            
            // this might be false if we're removing peers because of errors
            // which for some reason might trigger multiple times.
            if (id in self.connections) {
              if (!firstExchangeOnConnection) {
                self.progress_ui.onCloseConnection(id);
              }
              delete self.connections[id];
            }
            maybeSpawnNewConnections();
          };
          return function() {
            // run on the main thread
            setTimeout(finish_fn, 0);
          };
        };
        
        con.on('open', function() {
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
                reenqueueTask(task, 'timeout');
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
              // async sync point
              setTimeout(function() {
                if (!(channel in exchanges)) return; // we have been killed in the interim
                exchanges[channel].timer.reset(); // something happened! reset the timeout
                exchanges[channel].next = exchanges[channel].next();
              }, 0);
            };
            
            var cleanup = function () {
              // exchange was already killed (by a timeout?) before we received whatever caused this
              if (!(channel in exchanges)) throw "I'm pretty sure this can't happen anymore actually.";
              
              exchanges[channel].timer.kill();
              delete exchanges[channel];
            };
            
            var time_response = function(cps) {
              var from = time();
              var to = null;
              con.send({kind: "ping", channel: channel});
              dispatch.waitMsg(channel, 'pong', function(msg) {
                to = time();
                advance();
                return true;
              });
              return function() { return cps(to - from); }; // yield; return to - from;
            };
            
            var get_label = function(cps) {
              con.send({kind: "whoareyou", channel: channel, whoami: getMyLabel(self.connection)});
              var res = null;
              dispatch.waitMsg(channel, 'iamcalled', function(msg) {
                res = msg.label;
                advance();
                return true;
              });
              return function() { return cps(res); }; // yield; return res;
            };
            
            var taskAccepted = function(task, cps) {
              var result = null;
              var reactTaskAccepted = function(msg) {
                // log(msg.kind, "on", id+"/"+channel);
                if (msg.kind == 'accepted') {
                  result = true;
                  advance();
                } else if (msg.kind == 'rejected') {
                  result = false;
                  advance();
                } else throw ("2 unexpected kind "+msg.kind);
                return true;
              };
              
              if (task.state != 'processing') throw ("taskAccepted: invalid state transition: '"+task.state+"' to 'asking'");
              task.state = 'asking';
              tasksInFlight[task.id] = task;
              
              dispatch.waitMsg(channel, /accepted|rejected/, reactTaskAccepted);
              
              con.send({kind: 'task', message: task.message, secret: self.connection.secret, channel: channel});
              return function() { return cps(result); }; // yield; return result;
            };
            
            var waitTaskDone = function(task, cps) {
              var res = null;
              var reactTaskDone = function(msg) {
                // log(msg.kind, "on", id+"/"+channel);
                if (msg.kind == 'done' || msg.kind == 'error') {
                  res = msg;
                  advance();
                  return true;
                } else if (msg.kind == 'progress') {
                  if (!(channel in exchanges)) return true; // connection timed out before we got here
                  var frac = +msg.value;
                  task.progress = frac;
                  self.onTaskProgress(task.message, frac);
                  if (!task.hasOwnProperty('_progress')) {
                    if (task.assigned_to == null) {
                      log(id, "received progress message for unassigned task ", JSON.stringify(task));
                      throw "this is bad.";
                    }
                    self.progress_ui.onTaskAccepted(task);
                  }
                  self.progress_ui.onTaskProgressed(task);
                  return false;
                } else throw ("3 unexpected kind "+msg.kind+" on "+id+"/"+channel);
              };
              dispatch.waitMsg(channel, /done|error|progress/, reactTaskDone);
              return function() { return cps(res); }; // yield
            };
            
            var waitTaskResultReceived = function(task, cps) {
              var data = null;
              var reactTaskResultReceived = function(msg) {
                if (msg.kind == 'result') {
                  data = new Uint8Array(msg.data);
                  // log_id(id, "task", channel, "received data", data.length);
                  advance();
                  return true;
                } else if (msg.kind == 'error') {
                  throw "This was not supposed to be possible.";
                } else throw ("4 unexpected kind "+msg.kind);
              };
              dispatch.waitMsg(channel, /result|error/, reactTaskResultReceived);
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
                  firstExchangeOnConnection = false;
                  // as soon as we have the label...
                  self.progress_ui.onOpenConnection(id, peerinfo.label);
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
                  var task = self.getQueuedTask(id);
                  if (!task) {
                    cleanup();
                    return null;
                  }
                  
                  exchanges[channel].task = task;
                  task.channel = channel;
                  
                  // log(id, "submit task", channel, ":", task.message.x_from, task.message.y_from, task.message.i_from);
                  // log_id(id, "task", channel, "submitting");
                  
                  var if_task_accepted_body = function(cps) {
                    return taskAccepted(task, function(accepted) {
                      if (accepted) {
                        // log_id(id, "task on", msg.channel, "has been accepted.");
                        // log(id, "task on", msg.channel, "has been accepted.");
                        if (task.state != 'asking') throw ("taskAccepted: invalid state transition: '"+task.state+"' to 'accepted'");
                        task.state = 'accepted';
                        task.assigned_to = id;
                        // self.progress_ui.onTaskAccepted(task);
                        self.onTaskStart(task.message);
                        // maybe this peer has more threads free?
                        // start a new exchange
                        startExchange();
                        return cps();
                      } else {
                        // log_id(id, "task", channel, "rejected:", msg.reason);
                        // log(id, "task", channel, "rejected:", msg.reason);
                        reenqueueTask(task, 'rejected');
                        cleanup();
                        return null;
                      }
                    });
                  };
                  
                  return if_task_accepted_body(function() {
                    return waitTaskDone(task, function(msg) {
                      if (msg.kind == 'error') {
                        // late rejection
                        if (msg.nature == 'fatal') {
                          log(id, ": task", channel, "failed:", msg.fatal, msg.error, "(3)");
                          failTask(task);
                        } else {
                          // log(id, ": task", channel, "kicked from queue, was", task.state);
                          reenqueueTask(task, msg.nature); // recoverable, like queue kicks
                        }
                        cleanup();
                        return;
                      }
                      
                      // maybe peer has more threads free now!! :o
                      // nag it some more
                      startExchange();
                      
                      return waitTaskResultReceived(task, function(data) {
                        // log("received task", id, ":", channel, ":", task.message.y_from);
                        var resultInfo = {
                          x_from: task.message.x_from,
                          y_from: task.message.y_from,
                          i_from: task.message.i_from,
                          x_to: task.message.x_to,
                          y_to: task.message.y_to,
                          i_to: task.message.i_to,
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
            if (!self.done()) {
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
        // log("open new connection to", new_id);
        connect(new_id);
      };
      
      // check regularly (maybeSpawn will naturally bail if we're at the limit)
      var newConnections_timer;
      var openNewConnectionsPeriodically = function() {
        if (self.done()) {
          clearInterval(newConnections_timer);
          return;
        }
        maybeSpawnNewConnections();
      };
      newConnections_timer = setInterval(openNewConnectionsPeriodically, 1000);
      maybeSpawnNewConnections();
      
      var recheck_timer;
      var recheckPeersPeriodically = function() {
        if (self.done()) {
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
  this.cancel = function() {
    for (var key in this.connections) {
      this.connections[key].close();
      delete this.connections[key];
    }
    this.killed = true;
  };
  this.run = function() {
    this.progress_ui.reset();
    this.giveWorkToIdlePeers();
  };
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
  this.getPerfEstimatorFor = function(id) {
    if (!this.estimators_con.hasOwnProperty(id)) {
      this.estimators_con[id] = new PerfEstimator();
    }
    return this.estimators_con[id];
  };
  this.estimSubdivideTask = function(id, task) {
    var msg = task.message;
    var dw = this.task_defaults.dw, dh = this.task_defaults.dh;
    var task_pixels = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from);
    var task_samples = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (msg.i_to - msg.i_from);
    var estim_seconds_for_task = this.getPerfEstimatorFor(id).estimate(task_samples);
    var max_seconds_per_task = 10;
    var must_split = msg.x_to > dw || msg.y_to > dh; // invalid as-is
    if (!must_split && (estim_seconds_for_task <= max_seconds_per_task || task_pixels == 1)) return false;
    // log("subdivide task: targeting", max_seconds_per_task, ", estimated", estim_seconds_for_task, "for", task_pixels);
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
    if (x_didsplit && y_didsplit && task_touches_area(br)) {
      if (this.onTaskAdd) this.onTaskAdd(br.message);
      this.tasks.push(br);
      pushed ++;
    }
    if (y_didsplit && task_touches_area(bl)) {
      if (this.onTaskAdd) this.onTaskAdd(bl.message);
      this.tasks.push(bl);
      pushed ++;
    }
    this.shuffle(pushed);
    return true;
  };
  this.getQueuedTask = function(id) {
    var task = this.peekQueuedTask();
    if (task) {
      while (this.estimSubdivideTask(id, task)) { }
      if (task.state != 'queued') throw ("getQueuedTask: invalid state transition: '"+task.state+"' to 'processing'");
      task.state = 'processing';
    }
    return task;
  };
  this.gotQueuedTasks = function() {
    return this.peekQueuedTask() != null;
  };
  this.gotUnfinishedTasks = function() {
    for (var i = 0; i < this.tasks.length; ++i) {
      if (this.tasks[i].state != 'done' && this.tasks[i].state != 'error') return true;
    }
    return false;
  };
  this.done = function() {
    return this.killed || !this.gotUnfinishedTasks();
  };
  this.checkAreWeDone = function() {
    if (this.done() && this.hasOwnProperty('onDone')) {
      this.onDone();
    };
  };
}
