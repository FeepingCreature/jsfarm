'use strict';

var PLATFORM_ELECTRON = typeof window !== 'undefined' && window.process && window.process.type === "renderer";

function setStatus(jq, msg) {
  jq.find('#StatusPanel').html(msg);
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
  var jq_ident = "";
  if (document.getElementById('ident') != null) {
    jq_ident = ""+document.getElementById('ident').value;
  }
  if (jq_ident != "") return jq_ident;
  var hw = hashwords({wordLength: [1,5]});
  return hw.hash(self.id).join("");
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

if ($('#target').length) {
  $(CheckTarget); // check on startup, if relevant
}

/** @constructor */
function RobinTask(con, evictfn) {
  this.con = con;
  this.origin = con.id;
  this.evict = evictfn;
  this.prioritize = false;
}

/** @constructor */
function RobinQueue(limit) {
  this.last_assigned = Object.create(null);
  this.limit = limit;
  this.tasks = [];
  this.getTimeSinceLastAssigned = function(task) {
    if (task.prioritize) return Infinity; // always give priority
    if (task.origin in this.last_assigned) {
      return time() - this.last_assigned[task.origin];
    }
    return 0;
  };
  this.popTask = function() {
    if (!this.tasks.length) return null;
    var task = this.tasks.shift(); // fifo
    this.last_assigned[task.origin] = time();
    return task;
  };
  this.addTaskMaybe = function(task) {
    // log("DEBUG: ", this.tasks.length, "==", this.limit);
    var evict_task = null;
    if (this.tasks.length == this.limit) {
      // maybe we replace a queued task?
      // find the queued task with the shortest time since last assignment
      var worstscore = null, worstscore_id = null;
      for (var i = 0; i < this.tasks.length; ++i) {
        if (this.tasks[i].origin === task.origin) continue; // no point
        var oldtaskscore = this.getTimeSinceLastAssigned(this.tasks[i]);
        if (!worstscore || oldtaskscore < worstscore) { // find the client-most-recently-assigned task
          worstscore = oldtaskscore;
          worstscore_id = i;
        }
      }
      
      var ntaskscore = this.getTimeSinceLastAssigned(task);
      // if (worstscore) log("taskqueue at limit: can", ntaskscore, "beat out", worstscore, "as", task.origin, "vs.", this.tasks[worstscore_id].origin);
      if (!worstscore || ntaskscore <= worstscore) { // we've been started even more recent than the most recent one in the list
        return false; // don't replace
      }
      
      // we replace worstscore_id
      evict_task = this.tasks[worstscore_id];
      this.tasks.splice(worstscore_id, 1);
      // log("evict", JSON.stringify(evict_task.msg), "because", ntaskscore, "beats", worstscore);
    }
    this.tasks.push(task);
    
    if (evict_task) {
      evict_task.evict();
    }
    
    return true;
  };
}

/** @constructor */
function WorkRange(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to) {
  this.x_from = x_from;
  this.y_from = y_from;
  this.i_from = i_from;
  this.t_from = t_from;
  this.x_to = x_to;
  this.y_to = y_to;
  this.i_to = i_to;
  this.t_to = t_to;
  this.PACK_AS_OBJECT = null;
}

var worktask_id = 0;

/** @constructor */
function WorkTask(range, array_id) {
  this.state = 'queued';
  this.id = worktask_id ++;
  this.array_id = array_id;
  this.assigned_to = null;
  this.progress = 0.0;
  this.message = range;
  this.sclone = function() {
    var msg = this.message;
    return new WorkTask(new WorkRange(
      msg.x_from, msg.y_from, msg.i_from, msg.t_from,
      msg.x_to, msg.y_to, msg.i_to, msg.t_to), null);
  };
}

var global_help_stats = {
  num_renders_helped: 0,
  num_samples_helped: 0,
  dom_renders_helped: null,
  dom_samples_helped: null,
  dom_peer_plural: null,
  init: function() {
    var self = global_help_stats;
    self.dom_renders_helped = document.createTextNode("");
    self.dom_samples_helped = document.createTextNode("");
    self.dom_peer_plural = document.createTextNode("");
    var jq = $('<span class="helping">You have helped </span>').
      append($('<b></b>').append(self.dom_renders_helped)).
      append(" ").append(self.dom_peer_plural).append(" render ").
      append($('<b></b>').append(self.dom_samples_helped)).
      append(" samples.");
    $('#HelpedInfo').append(jq);
    self.updateInfo();
  },
  updateInfo: function() {
    var self = global_help_stats;
    self.dom_renders_helped.nodeValue = self.num_renders_helped.toString();
    self.dom_samples_helped.nodeValue = self.num_samples_helped.toLocaleString();
    if (self.num_renders_helped == 1) self.dom_peer_plural.nodeValue = "peer";
    else self.dom_peer_plural.nodeValue = "peers";
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
function LoopbackConnection() {
  this.paired = null;
  this.onData = [];
  this.onClose = [];
  this.send = function(msg) {
    // log("< ", JSON.stringify(msg));
    var paired = this.paired;
    setTimeout(function() {
      for (var i = 0; i < paired.onData.length; ++i) {
        // log("> ", JSON.stringify(msg));
        paired.onData[i](msg);
      }
    }, 0);
  };
  this.close = function() {
    var paired = this.paired;
    setTimeout(function() {
      for (var i = 0; i < paired.onClose.length; ++i) {
        paired.onClose[i]();
      }
    }, 0);
  };
  this.on = function(cond, action) {
    if (cond == 'data') {
      this.onData.push(action);
      return;
    }
    if (cond == 'open') {
      setTimeout(action, 0);
      return;
    }
    if (cond == 'close') {
      this.onClose.push(action);
      return;
    }
    if (cond == 'error') {
      return;
    }
    throw "TODO2 condition '"+cond+"'";
  };
}

/** @constructor */
function Loopback() {
  var
    client_half = new LoopbackConnection,
    server_half = new LoopbackConnection;
  
  client_half.paired = server_half;
  server_half.paired = client_half;
  
  this.listAllPeers = function(fn) {
    fn(["local"]);
  };
  this.connect = function(id) {
    if (id != "local") throw ("bad connect in loopback: "+id);
    return client_half;
  };
  this.on = function(cond, action) {
    if (cond == 'connection') {
      action(server_half);
      return;
    }
    if (cond == 'open') {
      setTimeout(action, 0);
      return;
    }
    if (cond == 'error') {
      return;
    }
    throw "TODO condition '"+cond+"'";
  };
}

var child_process = null, base64 = null;;
if (PLATFORM_ELECTRON) {
  child_process = require("child_process");
  base64 = require("base64-js");
}


/** @constructor */
function ElectronWorker(jsfile) {
  if (!PLATFORM_ELECTRON) throw "electron worker in non-electron?";
  
  this.process = child_process.fork(jsfile);
  this.terminate = function() {
    this.process.kill('SIGKILL');
  };
  this.addEventListener = function(key, fn) {
    var self = this;
    if (key != "message") throw "unknown key";
    if ('message_fn' in self) throw "message_fn already set";
    self.message_fn = fn;
    self.process.on('message', function(obj) {
      self.message_fn({data: obj});
    });
  };
  this.postMessageToWorker = function(obj) {
    this.process.send({data: obj});
  };
  this.postMessage = this.postMessageToWorker;
}

/** @constructor */
function ServerConnection(jq) {
  this.workers = [];
  
  this.peerjs = null;
  
  this.id = null;
  
  this.local = false;
  
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
    
    var giveTaskToThread = function(wrapper, task) {
      var msg = task.msg;
      var con = task.con;
      
      wrapper.onComplete = function(data) {
        // faster node.js ipc
        if (typeof data === "string") {
          if (!PLATFORM_ELECTRON) throw "what";
          data = new Float32Array(base64.toByteArray(data).buffer);
        }
        
        var rgbe_data = null;
        if (con instanceof LoopbackConnection) {
          rgbe_data = new Float32Array(data);
        } else {
          rgbe_data = encode_rgbe11(data);
        }
        
        con.send({kind: 'done', channel: msg.channel});
        con.send({kind: 'result', channel: msg.channel, data: rgbe_data.buffer});
        delete wrapper.onComplete;
        
        var pixels = data.buffer.byteLength / 12;
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
        
        // we may have restarted a worker! can we give it work?
        self.checkQueue();
      };
      
      var message = $.extend({}, task.default_obj, msg.message);
      
      wrapper.giveWork(message);
    };
    
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
    var worker = null;
    
    if (PLATFORM_ELECTRON) {
      worker = new ElectronWorker('web/js/pool.min.js');
    } else {
      worker = new Worker('js/pool.min.js');
    }
    
    var workerWrapper = {
      state: '',
      worker: worker,
      worker_timeout_timer: null,
      onTimeout: function() {
        // clean up
        this.worker.terminate();
        // and restart
        self._startWorker(marker, index);
        // CAUTION timing-related danger point!
        // callback _after_ restarting, so the callback can immediately give the
        // newly restarted worker stuff to do.
        // (otherwise, it's possible to get a hang where all workers are restarted
        //  but there's no impetus to actually give them work)
        if (this.hasOwnProperty('onError')) {
          this.onError("Timeout: computation exceeded 30s", 'timeout');
        }
      },
      setState: function(state) {
        if (state == 'busy') {
          if (this.state != 'idle') throw ("invalid state transition from '"+this.state+"' to 'busy'");
          this.state = 'busy';
          if (marker.length) dom_queue.style(marker[0], 'background-color', 'yellow');
          this.worker_timeout_timer = new TimeoutTimer(30000, this.onTimeout.bind(this));
        } else if (state == 'idle') {
          if (this.state != 'busy' && this.state != '') {
            throw ("invalid state transition from '"+this.state+"' to 'idle'");
          }
          this.state = 'idle';
          if (this.worker_timeout_timer) this.worker_timeout_timer.kill();
          if (marker.length) dom_queue.style(marker[0], 'background-color', 'lightgreen');
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
        /*setTimeout(function() {
          alert(msg.message); // TODO only if self-connection
        }, 0);*/
        log(msg.message);
      } else if (msg.kind == "log") {
        log(msg.message); // TODO only if self-connection
      } else throw ("what is "+msg.kind);
    });
    
    this.workers[index] = workerWrapper;
  }
  this.startWorkers = function(threads) {
    if (this.workers.length) throw "internal error";
    if (typeof threads === 'undefined') {
      if (document.getElementById('threads') != null) {
        threads = Math.min(36, document.getElementById('threads').value|0);
      } else {
        threads = 2;
      }
    }
    this.taskqueue.limit = threads;
    this.workers = new Array(threads);
    for (var i = 0; i < threads; ++i) {
      var marker = $('<div class="worker-marker"></div>');
      jq.find('#WorkerInfo .workerlist').append(marker);
      this._startWorker(marker, i);
    }
  };
  this.isLocal = function() {
    this.local = true;
    this.peerjs = new Loopback();
  };
  this.startup = function(onDone) {
    var self = this;
    
    setStatus(jq, "Status: connecting");
    
    self.peerjs.on('connection', self.handleIncomingConnection.bind(self));
    self.peerjs.on('open', function(id) {
      self.id = id;
      setStatus(jq, "Status: connected as <span title=\""+self.id+"\">"+getMyLabel(self)+"</span>");
      self.startWorkers();
      onDone();
      $(window).on('unload', null, Disconnect);
    });
    jq.find('#WorkerInfo').show().css('display', 'inline-block');
  };
  this.shutdown = function() {
    while (this.workers.length) {
      var wrapper = this.workers.pop();
      if (wrapper.state == 'busy') wrapper.setState('idle');
      wrapper.worker.terminate();
    }
    jq.find('#WorkerInfo').hide();
    jq.find('#WorkerInfo .workerlist').empty();
  };
  this.connect = function(onDone) {
    jq.find('#ConnectButton').prop("disabled", true);
    this.peerjs = this._connectPeerJs();
    if (!this.peerjs) return;
    
    this.startup(function() {
      jq.find('#ConnectButton').prop("disabled", false).hide();
      jq.find('#DisconnectButton').show();
      onDone();
    });
  };
  this.disconnect = function() {
    jq.find('#DisconnectButton').hide();
    this.shutdown();
    $(window).off('unload', null, Disconnect);
    
    this.peerjs.destroy();
    this.id = null;
    
    setStatus(jq, "Status: not running");
    jq.find('#ConnectButton').show();
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
    self.onDataReliable(msg);
  };
}

/** @constructor */
function RenderWorkset(jq, connection) {
  var self = this;
  
  this.workers = [];
  
  this.tasks = [];
  this.task_defaults = {};
  this.progress_ui = new ProgressUI(jq, function() { return self.task_defaults.dw * self.task_defaults.dh * self.task_defaults.di * self.task_defaults.dt; });
  
  this.peerlist = [];
  this.peerlist_last_updated = null;
  
  this.peerinfo = {};
  
  this.connection_limit = 10;
  this.connections = Object.create(null);
  this.id = null;
  
  if (connection == null) {
    connection = new ServerConnection(jq);
    connection.isLocal();
    connection.startup(function() { });
  }
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
      var peerjs = self.connection.peerjs;
      if (!(peerjs instanceof Loopback) && !peerjs.id) {
        log("not relisting because we're disconnected (weird state)");
        return;
      }
      // log("relisting peers on", self.connection.peerjs.id);
      peerjs.listAllPeers(function(peers) {
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
    
    var goIdle = function() { setStatus(jq, "idle", "peer check"); };
    
    // don't list peers if we got no work for them
    if (!self.gotQueuedTasks()) return;
    
    self.listAllPeersDelayed(function(recheckPeers, setPeerHandler) {
      var maybeSpawnNewConnections = null;
      
      var connect = function(id) {
        // log(id, "attempt to connect");
        var con = peer.connect(id);
        if (typeof con === 'undefined') {
          log("Connection failed. Peer state invalid?");
          debugger;
          return;
        }
        // log(id, "got connection "+con);
        
        var num_errors = 0;
        
        var firstExchangeOnConnection = true;
        
        var tasksInFlight = Object.create(null);
        
        var failTask = function(task) {
          if (task.state != 'accepted') throw ("failTask: invalid state transition: '"+task.state+"' to 'failed'");
          // Errors may happen for weird and random reasons!
          // task.state = 'failed';
          task.state = 'queued';
          task.assigned_to = null;
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
          self.removeTask(task);
          self.onTaskDone(msg, resultInfo.data);
          self.progress_ui.onTaskCompleted(task);
          
          var samples_rendered = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (msg.i_to - msg.i_from) * (msg.t_to - msg.t_from);
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
            log(id, ": close due to", reason);
            dispatch.finish();
            for (var key in exchanges) {
              exchanges[key].timer.kill();
              delete exchanges[key];
            }
            if (con_control_timer) { clearInterval(con_control_timer); con_control_timer = null; }
            // log_id(id, "finish:", reason, ",", JSON.stringify(Array.prototype.slice.call(arguments)));
            // log(id, "removing connection because", reason);
            var keys = Object.keys(tasksInFlight); // copy
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
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
          return finish_fn;
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
            
            exchanges[channel].next = null;
            exchange(channel);
          };
          
          var dfl_src = null;
          
          var exchange = function(channel) {
            var advance = function() {
              if (!(channel in exchanges)) return; // we have been killed in the interim
              exchanges[channel].timer.reset(); // something happened! reset the timeout
              var fn = exchanges[channel].next;
              exchanges[channel].next = null;
              fn();
            };
            var set_next = function(fn) {
              if (exchanges[channel].next != null) {
                throw "next fn already set";
              }
              exchanges[channel].next = fn;
            };
            
            var cleanup = function () {
              // exchange was already killed (by a timeout?) before we received whatever caused this
              if (!(channel in exchanges)) return;
              
              exchanges[channel].timer.kill();
              delete exchanges[channel];
            };
            
            var time_response = function(fn) {
              var from = time();
              var to = null;
              set_next(function() { fn(to - from); }); // yield; return to - from;
              dispatch.waitMsg(channel, 'pong', function(msg) {
                to = time();
                advance();
                return true;
              });
              con.send({kind: "ping", channel: channel});
            };
            
            var get_label = function(fn) {
              var res = null;
              set_next(function() { fn(res); }); // yield; return res;
              dispatch.waitMsg(channel, 'iamcalled', function(msg) {
                res = msg.label;
                advance();
                return true;
              });
              con.send({kind: "whoareyou", channel: channel, whoami: getMyLabel(self.connection)});
            };
            
            var taskAccepted = function(task, fn) {
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
              
              set_next(function() { fn(result); }); // yield; return result;
              dispatch.waitMsg(channel, /accepted|rejected/, reactTaskAccepted);
              con.send({kind: 'task', message: task.message, secret: self.connection.secret, channel: channel});
            };
            
            var waitTaskDone = function(task, fn) {
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
              set_next(function() { fn(res); }); // yield
              dispatch.waitMsg(channel, /done|error|progress/, reactTaskDone);
            };
            
            var waitTaskResultReceived = function(task, fn) {
              var data = null;
              var reactTaskResultReceived = function(msg) {
                if (msg.kind == 'result') {
                  if (con instanceof LoopbackConnection) {
                    data = new Float32Array(msg.data);
                  } else {
                    data = decode_rgbe11(new Uint8Array(msg.data));
                  }
                  // log_id(id, "task", channel, "received data", data.length);
                  advance();
                  return true;
                } else if (msg.kind == 'error') {
                  throw "This was not supposed to be possible.";
                } else throw ("4 unexpected kind "+msg.kind);
              };
              set_next(function() { fn(data); }); // yield; return data
              dispatch.waitMsg(channel, /result|error/, reactTaskResultReceived);
            };
            
            if (!self.peerinfo.hasOwnProperty(id)) self.peerinfo[id] = {};
            
            var peerinfo = self.peerinfo[id];
            
            if (!peerinfo.hasOwnProperty('wait_label_completion')) {
              var attached_fns = [];
              
              peerinfo.wait_label_completion = function(cont) {
                attached_fns.push(cont);
              };
              
              // we're the first - query for label
              get_label(function(label) {
                peerinfo.label = label;
                
                // switch off waiting now that label is set
                peerinfo.wait_label_completion = function(cont) { cont(); };
                
                // wake up the waiting ones
                for (var i = 0; i < attached_fns.length; ++i) attached_fns[i]();
              });
            }
            
            peerinfo.wait_label_completion(function() {
              if (firstExchangeOnConnection) {
                firstExchangeOnConnection = false;
                // as soon as we have the label...
                self.progress_ui.onOpenConnection(id, peerinfo.label);
                con.send({kind: 'default', object: self.task_defaults});
              }
              
              var if_ping_set_body = null;
              if (!self.peerinfo[id].hasOwnProperty('ping')) if_ping_set_body = function(next) {
                // prevent other channels from starting duplicate checks
                self.peerinfo[id].ping = null;
                
                var tries = 3;
                var sum = 0;
                
                var i = 0;
                var loop_body = function(next) {
                  time_response(function(t) {
                    sum += t;
                    if (i < tries) {
                      i++;
                      loop_body(next);
                    } else next();
                  });
                };
                
                loop_body(function() {
                  var ping = sum / tries;
                  // log_id(id, "ping", "is "+(ping|0)+"ms");
                  self.peerinfo[id].ping = ping;
                  next();
                });
              }; else if_ping_set_body = function(next) {
                next();
              };
              
              if_ping_set_body(function() {
                var task = self.getQueuedTask(id);
                if (!task) {
                  cleanup();
                  return null;
                }
                
                exchanges[channel].task = task;
                task.channel = channel;
                
                var debug = true;
                
                // log(id, "submit task", channel, ":", task.message.x_from, task.message.y_from, task.message.i_from, "is", task.state);
                // log_id(id, "task", channel, "submitting");
                
                var if_task_accepted_body = function(next) {
                  taskAccepted(task, function(accepted) {
                    if (accepted) {
                      if (debug) { debug = false; }
                      else {
                        log("internal error: next called multiple times on channel", task.channel);
                      }
                      // log_id(id, "task on", task.channel, "has been accepted.");
                      // log(id, "task on", task.channel, "has been accepted.");
                      if (task.state != 'asking') throw ("taskAccepted: invalid state transition: '"+task.state+"' to 'accepted'");
                      task.state = 'accepted';
                      task.assigned_to = id;
                      // self.progress_ui.onTaskAccepted(task);
                      self.onTaskStart(task.message);
                      // maybe this peer has more threads free?
                      // start a new exchange
                      startExchange();
                      next();
                    } else {
                      // log_id(id, "task", channel, "rejected:", msg.reason);
                      // log(id, "task", channel, "rejected:", task.reason);
                      reenqueueTask(task, 'rejected');
                      cleanup();
                    }
                  });
                };
                
                if_task_accepted_body(function() {
                  waitTaskDone(task, function(msg) {
                    if (msg.kind == 'error') {
                      // late rejection
                      if (msg.nature == 'fatal') {
                        log(peerinfo.label, " (", id, "): task", channel, "failed:", msg.fatal, msg.error, "(3, "+num_errors+")");
                        failTask(task);
                        if (num_errors++ > 2) {
                          log(id, ": giving up on this peer");
                          con.close();
                          // not sure if trigger gets called when we close it
                          // deliberately, so make sure, the function can
                          // handle being called multiple times
                          finish("close")();
                        }
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
                    
                    waitTaskResultReceived(task, function(data) {
                      // log("received task", id, ":", channel, ":", task.message.y_from);
                      var resultInfo = {
                        x_from: task.message.x_from,
                        y_from: task.message.y_from,
                        i_from: task.message.i_from,
                        t_from: task.message.t_from,
                        x_to: task.message.x_to,
                        y_to: task.message.y_to,
                        i_to: task.message.i_to,
                        t_to: task.message.t_to,
                        data: data
                      };
                      
                      finishTask(task, exchanges[channel].timer, resultInfo);
                      
                      cleanup();
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
              finish("close")(); // not sure if trigger gets called when we close it deliberately; be sure.
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
      recheck_timer = setInterval(recheckPeersPeriodically, 30000);
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
      this.tasks[target].array_id = target;
      
      this.tasks[i] = temp;
      this.tasks[i].array_id = i;
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
    var task = new WorkTask(range, this.tasks.length);
    if (this.onTaskAdd) this.onTaskAdd(range);
    this.tasks.push(task);
  };
  this.removeTask = function(task) {
    var i = task.array_id;
    // swap last task with task, replacing it
    this.tasks[i] = this.tasks[this.tasks.length - 1];
    this.tasks[i].array_id = i;
    // pop end
    this.tasks.pop();
  };
  this.peekQueuedTask = function() {
    // for (var i = 0; i < this.tasks.length; ++i) {
    for (var i = this.tasks.length - 1; i >= 0; --i) {
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
    var self = this, msg = task.message;
    var dw = this.task_defaults.dw, dh = this.task_defaults.dh;
    var task_pixels = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from);
    var task_samples = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (msg.i_to - msg.i_from) * (msg.t_to - msg.t_from);
    var estim_seconds_for_task = this.getPerfEstimatorFor(id).estimate(task_samples);
    var max_seconds_per_task = 10;
    var must_split = msg.x_to > dw || msg.y_to > dh; // invalid as-is
    // start out with a minimum size of 4*4 (if that is still too much, the timeout error will
    // force further subdivision (but that should usually not happen)
    var subdiv_limit = 4*4;
    
    if (!must_split && (estim_seconds_for_task <= max_seconds_per_task || task_pixels < subdiv_limit)) return false;
    
    var pushed = 0;
    var push = function(task) {
      if (self.onTaskAdd) self.onTaskAdd(task.message);
      task.array_id = self.tasks.length;
      self.tasks.push(task);
      pushed ++;
    };
    
    var msg_i_size = msg.i_to - msg.i_from;
    // don't split i too small
    // if (msg_i_size > /* 1 */ 8) {
    
    // only split the first i-row! splitting by i too much
    // runs into _serious_ issues with bandwidth consumption
    if (msg.i_from == 0 && msg_i_size > 4) {
      // split on i preferentially
      var bot = task, top = task.sclone();
      
      var isplit = msg.i_from + Math.ceil((msg.i_to - msg.i_from) / 2);
      
      bot.message.i_to = isplit;
      top.message.i_from = isplit;
      
      push(top);
      
      // this.shuffle(1);
      return true;
    }
    
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
    
    if (x_didsplit && task_touches_area(tr)) {
      push(tr);
    }
    if (x_didsplit && y_didsplit && task_touches_area(br)) {
      push(br);
    }
    if (y_didsplit && task_touches_area(bl)) {
      push(bl);
    }
    // this.shuffle(pushed);
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
