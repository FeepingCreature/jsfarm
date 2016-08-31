'use strict';

var WEB_WORKER = typeof importScripts === 'function';
var ELECTRON_WORKER = (typeof alert === 'undefined') && (typeof process !== 'undefined');

// if (typeof console !== 'undefined') console.log("debug: "+WEB_WORKER+", "+ELECTRON_WORKER);

// importScripts('compile.js');
// importScripts('files.js');

// not on the pool! don't spam! (TODO maybe when we're on our own connection?)
function alert_(msg) {
  // postMessage({kind: "alert", message: msg});
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  if (WEB_WORKER || ELECTRON_WORKER) {
    // postMessage({kind: "log", message: msg});
  } else {
    var div = $('<div></div>');
    // var t = time();
    // div.append(((t - LogStart)/1000.0)+": ");
    div.append(document.createTextNode('> '+msg)).append('<br>');
    logJq(div);
  }
}

/** @constructor */
function FnCache() {
  this.source = null;
  this.settings = {};
  this.fn = null;
  this.matches = function(settings, source) {
    return JSON.stringify(this.settings) === JSON.stringify(settings) && this.source === source;
  };
}

var fncache = [new FnCache, new FnCache, new FnCache, new FnCache, new FnCache, new FnCache, new FnCache, new FnCache];
var fncache_id = 0;

function is_pot(i) {
  return (i & (i - 1)) == 0;
}

var global_ram = null;

// we only use pot ranges, so this should be a low number
var floatarray_cache = {};
function alloc_floatarray(size) {
  if (!floatarray_cache.hasOwnProperty(size)) {
    floatarray_cache[size] = [];
  }
  if (!floatarray_cache[size].length) {
    floatarray_cache[size].push(new Float32Array(size));
  }
  return floatarray_cache[size].pop().fill(0);
}
function free_floatarray(array) {
  var size = array.length;
  floatarray_cache[size].push(array);
}

var time_start = null;
if (typeof process !== "undefined") time_start = process.hrtime();

function workerHandleMessage(e, postMessage) {
  try {
    var x_from = e.data["x_from"]|0, x_to = e.data["x_to"]|0;
    var y_from = e.data["y_from"]|0, y_to = e.data["y_to"]|0;
    var i_from = e.data["i_from"]|0, i_to = e.data["i_to"]|0;
    var t_from = e.data["t_from"]|0, t_to = e.data["t_to"]|0;
    var dw = e.data["dw"]|0, dh = e.data["dh"]|0, di = e.data["di"]|0, dt = e.data["dt"]|0;
    var s2src = e.data["source"];
    
    if (dw > 4096 || dh > 4096 || dw < 0 || dh < 0) throw "size limits exceeded";
    
    if (x_from < 0 || x_to > dw || y_from < 0 || y_to > dh) throw "render range outside image";
    
    var width = x_to - x_from, height = y_to - y_from, time = t_to - t_from;
    if (width < 0 || height < 0 || time < 0) throw "render range negative";
    if (!is_pot(width) || !is_pot(height) || !is_pot(time)) throw "render range must be power-of-two sized";
    if (width != height) throw "render range must be quadratic";
    
    var total_size = width * height * time;
    if (total_size > 16*1024*1024) throw "render range too big!";
    if (total_size < 0) throw "render range much much too big!";
    
    var settings = {'dw': dw, 'dh': dh, 'di': di, 'dt': dt};
    
    var cache_entry = null;
    for (var i = 0; i < fncache.length; ++i) {
      if (fncache[i].matches(settings, s2src)) {
        cache_entry = fncache[i];
        break;
      }
    }
    
    if (!cache_entry) {
      var files = splitSrc(s2src);
      var jssrc = compile(files);
      
      var config = {};
      
      if (ELECTRON_WORKER) {
        var crypto = require('crypto');
        var fs = require('fs');
        var child_process = require('child_process')
        var ref = require("ref"), ffi = require("ffi");
        
        var hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(settings));
        hash.update(jssrc);
        hash = hash.digest('hex');
        
        // stolen from node-ffi
        var ext = {
          'linux':  '.so',
          'linux2': '.so',
          'sunos':  '.so',
          'solaris':'.so',
          'freebsd':'.so',
          'openbsd':'.so',
          'darwin': '.dylib',
          'mac':    '.dylib',
          'win32':  '.dll'
        }[process.platform];
        
        var src_name = "out/jsfarm_"+hash+".c";
        var bin_name = "out/jsfarm_"+hash+ext;
        var bin_temp_name = "out/jsfarm_"+hash+".temp"+ext;
        
        // double-check
        if (!fs.existsSync(bin_name)) {
          // busyspin to take lock
          while (true) {
            try {
              var fd = fs.openSync("out/.jsfarm_lock", 'wx');
              fs.closeSync(fd);
              break;
            } catch(err) { }
          }
          if (!fs.existsSync(bin_name)) {
            fs.writeFileSync(src_name, jssrc);
            // var res = child_process.spawnSync("gcc", ["-O3", "-march=native", /*"-ffast-math", */"-flto",
            //                                           // "-O2", "-march=native",
            //                                           "-g", "-lm", "-shared", "-fPIC", src_name, "-o", bin_temp_name,
            //                                           "-Ddw="+settings.dw, "-Ddh="+settings.dh, "-Ddi="+settings.di, "-Ddt="+settings.dt]);
            var res = child_process.spawnSync("clang", ["-Ofast", "-march=native", "-Wno-unknown-attributes",
                                                        "-g", "-lm", "-shared", "-fPIC", src_name, "-o", bin_temp_name,
                                                        "-Ddw="+settings.dw, "-Ddh="+settings.dh, "-Ddi="+settings.di, "-Ddt="+settings.dt]);
            
            if (res.status != 0) {
              fs.unlinkSync("out/.jsfarm_lock"); // release lock
              throw "compilation failed";
            }
            
            fs.renameSync(bin_temp_name, bin_name);
          }
          fs.unlinkSync("out/.jsfarm_lock");
        }
        
        var lib = ffi.Library(bin_name, {
          'setupScene': ['void', [] ],
          'executeRange': ['void', ['int', 'int', 'int', 'int', 'int', 'int', 'int', 'int', ref.refType(ref.types.float)] ]
        });
        
        var compiled = {
          setupScene: function() { lib.setupScene(); },
          executeRange: function(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to) {
            // TODO progress somehow?
            lib.executeRange(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to, new Buffer(config.array.buffer));
          }
        };
      } else {
        var asmjs = new Function('stdlib', 'foreign', 'heap', jssrc);
        files = null; jssrc = null;
        
        // i is ignored - we make the safe assumption that you'll just pass every i in the range once
        var hit = function(x, y, i, t, r, g, b) {
          config.count++;
          
          var width = config.x_to - config.x_from;
          var tm = Date.now();
          if (tm - config.last_tm > 1000) {
            var height = config.y_to - config.y_from;
            var progress = config.count / (width * height);
            postMessage({kind: "progress", progress: progress});
            config.last_tm = tm;
          }
          
          var base = (y - config.y_from) * width + (x - config.x_from);
          var array = config.array;
          if (base >= 0 && base < array.length) {
            // don't limit intensity per ray to 0..1
            // array[base*3 + 0] += Math.max(0, Math.min(1, r));
            // array[base*3 + 1] += Math.max(0, Math.min(1, g));
            // array[base*3 + 2] += Math.max(0, Math.min(1, b));
            array[base*3 + 0] += r;
            array[base*3 + 1] += g;
            array[base*3 + 2] += b;
          }
        };
        
        var stdlib = {
          Infinity: Infinity,
          Math: Math,
          Int32Array: Int32Array,
          Float32Array: Float32Array,
          Float64Array: Float64Array
        };
        
        var errmsgs = [
          "Internal error: stub function called!",
          "Available memory exceeded!",
          "Numeric error: NaN found!"
        ];
        
        if (!global_ram) global_ram = new ArrayBuffer(1024*32768);
        var compiled = asmjs(stdlib, {
          'dw': dw,
          'dh': dh,
          'di': di,
          'dt': dt,
          'hit': hit,
          'error': function(code) { throw ("asm.js: "+errmsgs[code]); },
          'alert_': alert_,
          'isFinite': isFinite,
          'stackborder': 1024*512,
          'memory_limit': 1024*32768
        }, global_ram);
      }
      
      compiled.setupScene();
      
      cache_entry = fncache[fncache_id++];
      fncache_id = fncache_id % fncache.length;
      cache_entry.fn = function(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to, postMessage) {
        var size = 3 * (x_to - x_from) * (y_to - y_from) * (t_to - t_from);
        var array = alloc_floatarray(size);
        
        config.array = array;
        config.x_from = x_from;
        config.y_from = y_from;
        config.i_from = i_from;
        config.t_from = t_from;
        config.x_to = x_to;
        config.y_to = y_to;
        config.i_to = i_to;
        config.t_to = t_to;
        config.count = 0;
        config.last_tm = Date.now() - 800; // initial message after 200ms
        // config.last_tm = 0; // initial message straight off
        
        function ms() { var t = process.hrtime(time_start); return t[0] * 1.0 + t[1] / 1000000000.0; }
        // if (ELECTRON_WORKER) console.log(""+process.pid+":"+ms()+": "+"executeRange start "+x_from+" "+y_from+" "+i_from+" "+t_from+" "+x_to+" "+y_to+" "+i_to+" "+t_to);
        compiled.executeRange(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to);
        // if (ELECTRON_WORKER) console.log(""+process.pid+":"+ms()+": "+"executeRange end");
        
        var data = array;
        if (ELECTRON_WORKER) {
          var base64 = require("base64-js");
          data = base64.fromByteArray(new Uint8Array(data.buffer));
        }
        
        // if (ELECTRON_WORKER) console.log(""+process.pid+":"+ms()+": "+"post message");
        postMessage({
          kind: "finish",
          x_from: x_from, y_from: y_from, i_from: i_from, t_from: t_from,
          x_to  : x_to  , y_to  : y_to  , i_to  : i_to  , t_to  : t_to  ,
          data: data
        });
        free_floatarray(array);
      };
      cache_entry.source = s2src;
      cache_entry.settings = settings;
    }
    
    cache_entry.fn(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to, postMessage);
  } catch (err) {
    postMessage({kind: "error", error: err.toString()});
  }
}

if (ELECTRON_WORKER) process.on('message', function(e) { return workerHandleMessage(e, function(msg) { process.send(msg); }); });
else if (WEB_WORKER) onmessage = function(e) { return workerHandleMessage(e, postMessage); };
