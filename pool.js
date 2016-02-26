importScripts('compile.js');
importScripts('files.js');

function alert_(msg) {
  postMessage({kind: "alert", message: msg});
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  postMessage({kind: "log", message: msg});
}

fncache = {
  source: null,
  settings: {},
  fn: null
};

function is_pot(i) {
  return (i & (i - 1)) == 0;
}

var global_ram = new ArrayBuffer(1024*32768);

var arraycache = {}; // we only use pot ranges, so this should be a low number
function get_uint8array(size) {
  if (!arraycache.hasOwnProperty(size)) {
    arraycache[size] = new Uint8Array(size);
  }
  return arraycache[size];
}

onmessage = function(e) {
  try {
    var x_from = e.data.x_from, x_to = e.data.x_to;
    var y_from = e.data.y_from, y_to = e.data.y_to;
    var dw = e.data.dw, dh = e.data.dh;
    var quality = e.data.quality;
    var s2src = e.data.source;
    
    if (dw > 4000 || dh > 4000 || dw < 0 || dh < 0) throw "size limits exceeded";
    
    if (x_from < 0 || x_to > dw || y_from < 0 || y_to > dh) throw "render range outside image";
    
    var width = x_to - x_from, height = y_to - y_from;
    if (width < 0 || height < 0) throw "render range negative";
    if (!is_pot(width) || !is_pot(height)) throw "render range must be power-of-two sized";
    if (width != height) throw "render range must be quadratic";
    
    var settings = {dw: dw, dh: dh, quality: quality};
    
    if (JSON.stringify(settings) != JSON.stringify(fncache.settings) || s2src != fncache.source) {
      var files = splitSrc(s2src);
      var jssrc = compile(files);
      asmjs = new Function('stdlib', 'foreign', 'heap', jssrc);
      files = null; jssrc = null;
      
      var config = {};
      
      var hit = function(x, y, success, r, g, b) {
        config.count++;
        
        var width = config.x_to - config.x_from;
        var t = Date.now();
        if (t - config.last_t > 1000) {
          var height = config.y_to - config.y_from;
          var progress = config.count / (width * height);
          postMessage({kind: "progress", progress: progress});
          config.last_t = t;
        }
        
        if (!success) {
          r = 0.25;
          g = 0;
          b = 0;
        }
        var base = (y - config.y_from) * width + (x - config.x_from);
        var array = config.array;
        if (base >= 0 && base < array.length) {
          array[base*4 + 0] = Math.max(0, Math.min(255, r * 255));
          array[base*4 + 1] = Math.max(0, Math.min(255, g * 255));
          array[base*4 + 2] = Math.max(0, Math.min(255, b * 255));
          array[base*4 + 3] = 255;
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
        quality: quality,
        hit: hit,
        error: function(code) { throw ("asm.js: "+errmsgs[code]); },
        alert_: alert_,
        isFinite: isFinite,
        stackborder: 1024*512,
        memory_limit: 1024*32768,
      }, global_ram);
      
      fncache.source = s2src;
      fncache.settings = settings;
      fncache.fn = function(x_from, y_from, x_to, y_to) {
        
        config.array = get_uint8array(4 * (x_to - x_from) * (y_to - y_from));
        config.x_from = x_from;
        config.y_from = y_from;
        config.x_to = x_to;
        config.y_to = y_to;
        config.count = 0;
        config.last_t = 0; // initial message straight off
        
        compiled.resetGlobals();
        
        compiled.executeRange(x_from, y_from, x_to, y_to);
        postMessage({kind: "finish", x_from: x_from, y_from: y_from, x_to: x_to, y_to: y_to, data: config.array});
      };
    }
    
    fncache.fn(x_from, y_from, x_to, y_to);
  } catch (err) {
    postMessage({kind: "error", error: err.toString()});
  }
};
