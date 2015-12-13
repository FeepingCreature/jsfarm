functions = {};

importScripts('compile.js');

function alert_(msg) {
  postMessage({kind: "alert", message: msg});
}

onmessage = function(e) {
  var from = e.data.from, to = e.data.to;
  var s2src = e.data.source;
  
  var asmjs = null;
  if (functions.hasOwnProperty(s2src)) {
    asmjs = functions[s2src];
  } else {
    var jssrc = compile(s2src);
    asmjs = new Function('stdlib', 'foreign', 'stack', jssrc);
    functions[s2src] = asmjs;
  }
  
  var width = 512, height = to - from;
  
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
    var base = (y - from) * 512 + x;
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
  
  var compiled = asmjs(stdlib, {hit: hit, isFinite: isFinite, alert_: alert_}, new ArrayBuffer(1024*256));
  
  compiled.executeRange(from, to);
  postMessage({kind: "finish", from: from, to: to, data: array});
};
