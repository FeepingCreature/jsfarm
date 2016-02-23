importScripts('compile.js');
importScripts('files.js');

function alert_(msg) {
  postMessage({kind: "alert", message: msg});
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  // TODO postMessage
}

fncache = {
  source: null,
  settings: {},
  fn: null
};

onmessage = function(e) {
  try {
    var from = e.data.from, to = e.data.to;
    var dw = e.data.dw, dh = e.data.dh;
    var s2src = e.data.source;
    
    if (dw > 4000 || dh > 4000) return; // DANGER DANGER
    
    var width = dw, height = to - from;
    
    var settings = {width: width, height: height};
    
    if (JSON.stringify(settings) != JSON.stringify(fncache.settings) || s2src != fncache.source) {
      var files = splitSrc(s2src);
      var jssrc = compile(files);
      asmjs = new Function('stdlib', 'foreign', 'heap', jssrc);
      
      var array = new Uint8Array(4 * width * height);
      
      var config = {};
      
      var hit = function(x, y, success, r, g, b) {
        config.count++;
        
        var t = (new Date()).getTime();
        if (t - config.last_t > 100) {
          var progress = config.count / (width * height);
          postMessage({kind: "progress", progress: progress});
          config.last_t = t;
        }
        
        if (!success) {
          r = 0.25;
          g = 0;
          b = 0;
        }
        var base = (y - config.from) * dw + x;
        array[base*4 + 0] = Math.max(0, Math.min(255, r * 255));
        array[base*4 + 1] = Math.max(0, Math.min(255, g * 255));
        array[base*4 + 2] = Math.max(0, Math.min(255, b * 255));
        array[base*4 + 3] = 255;
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
        hit: hit,
        error: function(code) { throw ("asm.js: "+errmsgs[code]); },
        alert_: alert_,
        isFinite: isFinite,
        stackborder: 1024*512,
        memory_limit: 1024*32768,
      }, new ArrayBuffer(1024*32768));
      
      fncache.source = s2src;
      fncache.settings = settings;
      fncache.fn = function(from, to) {
        
        config.from = from;
        config.to = to;
        config.count = 0;
        config.last_t = (new Date()).getTime();
        
        compiled.resetGlobals();
        
        compiled.executeRange(from, to);
        postMessage({kind: "finish", from: from, to: to, data: array});
      };
    }
    
    fncache.fn(from, to);
  } catch (err) {
    postMessage({kind: "error", error: err.toString()});
  }
};
