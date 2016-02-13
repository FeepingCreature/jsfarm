functions = {};

importScripts('compile.js');
importScripts('files.js');

function alert_(msg) {
  postMessage({kind: "alert", message: msg});
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  // TODO postMessage
}

onmessage = function(e) {
  try {
    var from = e.data.from, to = e.data.to;
    var dw = e.data.dw, dh = e.data.dh;
    var s2src = e.data.source;
    
    if (dw > 4000 || dh > 4000) return; // DANGER DANGER
    
    var asmjs = null;
    if (functions.hasOwnProperty(s2src)) {
      asmjs = functions[s2src];
    } else {
      var files = splitSrc(s2src);
      var jssrc = compile(files);
      asmjs = new Function('stdlib', 'foreign', 'heap', jssrc);
      functions[s2src] = asmjs;
    }
    
    var width = dw, height = to - from;
    
    var array = new Uint8Array(4 * width * height);
    
    var count = 0;
    
    var last_t = (new Date()).getTime();
    var hit = function(x, y, success, r, g, b) {
      count++;
      
      var t = (new Date()).getTime();
      if (t - last_t > 100) {
        var progress = count / (width * height);
        postMessage({kind: "progress", progress: progress});
        last_t = t;
      }
      
      if (!success) {
        r = 0.25;
        g = 0;
        b = 0;
      }
      var base = (y - from) * dw + x;
      array[base*4 + 0] = r * 255;
      array[base*4 + 1] = g * 255;
      array[base*4 + 2] = b * 255;
      array[base*4 + 3] = 255;
    };
    
    var stdlib = {
      Infinity: Infinity,
      Math: Math,
      Int32Array: Int32Array,
      Float32Array: Float32Array,
      Float64Array: Float64Array,
    };
    
    var compiled = asmjs(stdlib, {
      dw: dw,
      dh: dh,
      hit: hit,
      abort: function() { throw "'abort' was called from asm.js"; },
      alert_: alert_,
      isFinite: isFinite,
      stackborder: 1024*4096
    }, new ArrayBuffer(1024*8192));
    
    compiled.executeRange(from, to);
    postMessage({kind: "finish", from: from, to: to, data: array});
  } catch (err) {
    postMessage({kind: "error", error: err.toString()});
  }
};
