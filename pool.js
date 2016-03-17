'use strict';

importScripts('compile.js');
importScripts('files.js');

// not on the pool! don't spam! (TODO maybe when we're on our own connection?)
function alert_(msg) {
  // postMessage({kind: "alert", message: msg});
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  // postMessage({kind: "log", message: msg});
}

var fncache = {
  source: null,
  settings: {},
  fn: null
};

function is_pot(i) {
  return (i & (i - 1)) == 0;
}

var global_ram = new ArrayBuffer(1024*32768);

var arraycache_float = {}; // we only use pot ranges, so this should be a low number
function get_floatarray(size) {
  if (!arraycache_float.hasOwnProperty(size)) {
    arraycache_float[size] = new Float32Array(size);
  }
  return arraycache_float[size].fill(0);
}

onmessage = function(e) {
  try {
    var x_from = e.data.x_from, x_to = e.data.x_to;
    var y_from = e.data.y_from, y_to = e.data.y_to;
    var i_from = e.data.i_from, i_to = e.data.i_to;
    var dw = e.data.dw, dh = e.data.dh, di = e.data.di;
    var s2src = e.data.source;
    
    if (dw > 4096 || dh > 4096 || dw < 0 || dh < 0) throw "size limits exceeded";
    
    if (x_from < 0 || x_to > dw || y_from < 0 || y_to > dh) throw "render range outside image";
    
    var width = x_to - x_from, height = y_to - y_from;
    if (width < 0 || height < 0) throw "render range negative";
    if (!is_pot(width) || !is_pot(height)) throw "render range must be power-of-two sized";
    if (width != height) throw "render range must be quadratic";
    
    var settings = {dw: dw, dh: dh, di: di};
    
    if (JSON.stringify(settings) != JSON.stringify(fncache.settings) || s2src != fncache.source) {
      var files = splitSrc(s2src);
      var jssrc = compile(files);
      var asmjs = new Function('stdlib', 'foreign', 'heap', jssrc);
      files = null; jssrc = null;
      
      var config = {};
      
      // i is ignored - we make the safe assumption that you'll just pass every i in the range once
      var hit = function(x, y, i, r, g, b) {
        config.count++;
        
        var width = config.x_to - config.x_from;
        var t = Date.now();
        if (t - config.last_t > 1000) {
          var height = config.y_to - config.y_from;
          var progress = config.count / (width * height);
          postMessage({kind: "progress", progress: progress});
          config.last_t = t;
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
        Float64Array: Float64Array,
      };
      
      var errmsgs = [
        "Internal error: stub function called!",
        "Available memory exceeded!",
      ];
      
      var compiled = asmjs(stdlib, {
        dw: dw,
        dh: dh,
        di: di,
        hit: hit,
        error: function(code) { throw ("asm.js: "+errmsgs[code]); },
        alert_: alert_,
        isFinite: isFinite,
        stackborder: 1024*512,
        memory_limit: 1024*32768,
      }, global_ram);
      
      fncache.source = s2src;
      fncache.settings = settings;
      fncache.fn = function(x_from, y_from, i_from, x_to, y_to, i_to) {
        var size = 3 * (x_to - x_from) * (y_to - y_from);
        var array = get_floatarray(size);
        
        config.array = array;
        config.x_from = x_from;
        config.y_from = y_from;
        config.i_from = i_from;
        config.x_to = x_to;
        config.y_to = y_to;
        config.i_to = i_to;
        config.count = 0;
        config.last_t = Date.now() - 800; // initial message after 200ms
        // config.last_t = 0; // initial message straight off
        
        compiled.resetGlobals();
        
        compiled.executeRange(x_from, y_from, i_from, x_to, y_to, i_to);
        
        postMessage({
          kind: "finish",
          x_from: x_from, y_from: y_from, i_from: i_from,
          x_to  : x_to  , y_to  : y_to  , i_to  : i_to  ,
          data: array
        });
      };
    }
    
    fncache.fn(x_from, y_from, i_from, x_to, y_to, i_to);
  } catch (err) {
    postMessage({kind: "error", error: err.toString()});
  }
};
