'use strict';

var IS_WORKER = typeof importScripts === 'function';

// importScripts('compile.js');
// importScripts('files.js');

// not on the pool! don't spam! (TODO maybe when we're on our own connection?)
function alert_(msg) {
  // postMessage({kind: "alert", message: msg});
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  if (IS_WORKER) {
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

var global_ram = new ArrayBuffer(1024*32768);

// we only use pot ranges, so this should be a low number
function get_floatarray(size) {
  if (!get_floatarray.cache.hasOwnProperty(size)) {
    get_floatarray.cache[size] = new Float32Array(size);
  }
  return get_floatarray.cache[size].fill(0);
}
get_floatarray.cache = {};

if (IS_WORKER) onmessage = function(e) {
  try {
    var x_from = e.data["x_from"], x_to = e.data["x_to"];
    var y_from = e.data["y_from"], y_to = e.data["y_to"];
    var i_from = e.data["i_from"], i_to = e.data["i_to"];
    var t_from = e.data["t_from"], t_to = e.data["t_to"];
    var dw = e.data["dw"], dh = e.data["dh"], di = e.data["di"], dt = e.data["dt"];
    var s2src = e.data["source"];
    
    if (dw > 4096 || dh > 4096 || dw < 0 || dh < 0) throw "size limits exceeded";
    
    if (x_from < 0 || x_to > dw || y_from < 0 || y_to > dh) throw "render range outside image";
    
    var width = x_to - x_from, height = y_to - y_from;
    if (width < 0 || height < 0) throw "render range negative";
    if (!is_pot(width) || !is_pot(height)) throw "render range must be power-of-two sized";
    if (width != height) throw "render range must be quadratic";
    
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
      var asmjs = new Function('stdlib', 'foreign', 'heap', jssrc);
      files = null; jssrc = null;
      
      var config = {};
      
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
      
      cache_entry = fncache[fncache_id++];
      fncache_id = fncache_id % fncache.length;
      cache_entry.fn = function(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to) {
        var size = 3 * (x_to - x_from) * (y_to - y_from) * (t_to - t_from);
        var array = get_floatarray(size);
        
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
        
        compiled.resetGlobals();
        
        compiled.executeRange(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to);
        
        postMessage({
          kind: "finish",
          x_from: x_from, y_from: y_from, i_from: i_from, t_from: t_from,
          x_to  : x_to  , y_to  : y_to  , i_to  : i_to  , t_to  : t_to  ,
          data: array
        });
      };
      cache_entry.source = s2src;
      cache_entry.settings = settings;
    }
    
    cache_entry.fn(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to);
  } catch (err) {
    postMessage({kind: "error", error: err.toString()});
  }
};
