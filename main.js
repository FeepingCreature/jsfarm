'use strict';

function bootstrap_progbar() {
  var progbar = $(
    '<div class="progress" style="height: 10px; margin-bottom: inherit;">'+
      '<div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="min-width: 2em; transition: inherit; line-height: inherit; font-size: 55%; ">'+
      '</div>'+
    '</div>'
  );
  return {
    bar: progbar,
    update: function(percent) {
      progbar.find(".progress-bar").
        attr("aria-valuenow", percent).
        width(percent+"%").
        html(percent+"%");
    }
  };
}

// shared helper
function logJq(jq) {
  if (typeof window !== 'undefined') {
    $('#console').append(jq);
  }
}

// opt-in to raw html logging
function logHtml() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  logJq('&gt; '+msg+'<br>');
}

var LogStart = time();

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  var div = $('<div></div>');
  var t = time();
  div.append(((t - LogStart)/1000.0)+": ");
  div.append(document.createTextNode('> '+msg)).append('<br>');
  logJq(div);
}

function LoadSettings() {
  var obj = Cookies.getJSON('settings');
  if (!obj) return;
  if (obj.hasOwnProperty('threads')) document.getElementById('threads').value = obj.threads|0;
  if (obj.hasOwnProperty('ident')) document.getElementById('ident').value = obj.ident;
}

function SaveSettings() {
  var obj = {
    threads: document.getElementById('threads').value|0,
    ident: document.getElementById('ident').value
  };
  Cookies.set('settings', obj);
}

var StorageHandlers = {
  "gist.github.com": {
    save: function(src) {
      var obj = {
        description: "JSFarm Saved File",
        files: {
          'file.cl': {content: src}
        }
      };
      $.post("https://api.github.com/gists", JSON.stringify(obj), function(obj, status) {
        if (status == "success") {
          var raw_url = obj.files['file.cl'].raw_url;
          // used to reconstruct the raw url on load
          var file_id = /\/raw\/([^\/]*)/.exec(raw_url)[1];
          var key = file_id+","+obj.html_url;
          setAnchorState('gist', key);
        }
      });
    },
    load: function(onMatch, onComplete) {
      var key = getAnchorState('gist');
      if (key) {
        onMatch();
        var halves = key.split(",");
        if (halves.length < 2) {
          log("Invalid URL: cannot load gist!");
          onComplete("");
          return;
        }
        
        var raw_url = halves[1].replace("gist.github.com/", "gist.githubusercontent.com/anonymous/")+"/raw/"+halves[0];
        $.get(raw_url, function(data) {
          onComplete(data);
        });
      }
    }
  }
};

function storeAnchor(obj) {
  var anchor_array = [];
  for (var key in obj) if (obj.hasOwnProperty(key)) {
    anchor_array.push(key+"="+obj[key]);
  }
  window.location.href = "#"+anchor_array.join(";");
}

function loadAnchor() {
  var obj = {};
  if (window.location.hash != "") {
    var parts = window.location.hash.substr(1).split(";");
    for (var i = 0; i < parts.length; ++i) {
      var part = parts[i];
      var bits = part.split("=");
      var key = bits[0];
      var value = bits.slice(1).join("=");
      obj[key] = value;
    }
  }
  return obj;
}

function setAnchorState(key, value) {
  var obj = loadAnchor();
  obj[key] = value;
  storeAnchor(obj);
}

function getAnchorState(key) {
  var obj = loadAnchor();
  if (obj.hasOwnProperty(key)) return obj[key];
  return null;
}

function Save() {
  StorageHandlers["gist.github.com"].save(window.getFullSrc());
}

function OpenLoadingModal() {
  $('#SiteLoadingModal').modal({
    backdrop: 'static',
    keyboard: false
  });
}

function CloseLoadingModal() {
  $('#SiteLoadingModal').modal('hide');
}

function LoadStateFromAnchor(onDone) {
  var obj = loadAnchor();
  
  var numLoading = 0; // number of async tasks waiting to load
  var startLoading = function() {
    if (numLoading == 0) {
      OpenLoadingModal();
    }
    numLoading ++;
  };
  var doneLoading = function() {
    numLoading --;
    if (numLoading == 0) {
      CloseLoadingModal(); // done
      onDone();
    }
  };
  
  for (var key in StorageHandlers) if (StorageHandlers.hasOwnProperty(key)) {
    StorageHandlers[key].load(startLoading, function(src) {
      var editor = window.editor;
      editor.files = splitSrc(src);
      editor.rebuildFileUi(editor.files);
      doneLoading();
    });
  }
  
  if (obj.hasOwnProperty("image")) {
    startLoading();
    var canvas = document.getElementById('canvas');
    var img = new Image;
    img.crossOrigin = '';
    img.onload = function() {
      if (canvas.width != img.width || canvas.height != img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      doneLoading();
    };
    img.src = obj.image;
  }
  
  if (numLoading == 0) onDone(); // nothing to do, call immediately
}

function next_pot(n) {
  // thanks, http://stackoverflow.com/questions/1322510/given-an-integer-how-do-i-find-the-next-largest-power-of-two-using-bit-twiddlin
  // repeatedly overlap n-1 with itself to fill every bit under the msb with 1 (to reach 2^k-1)
  n --;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  n ++;
  return n;
}

function renderScene() {
  $(window).trigger("startRender");
  
  $('#console').empty();
  
  var fullsrc = window.getFullSrc();
  var files = window.getFiles();
  
  for (var i = 0; i < files.length; ++i) {
    var file = files[i];
    file.clear();
  }
  
  var jsource = "";
  try {
    jsource = compile(files);
  } catch (ex) {
    log("Could not compile scene: "+ex);
    return;
  }
  
  var lines = jsource.split("\n");
  for (var i = 0; i < lines.length; ++i)
    lines[i] = (i+1)+": "+lines[i];
  var srctext = lines.join("<br>").replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  logHtml("<a href=\"#\" onclick=\"$(this).parent().find('.src').toggle();\">Source</a>"+
      "<div class=\"src\" style=\"display:none;\">"+srctext+"</div>");
  
  var canvas = document.getElementById('canvas');
  
  var nwidth = Math.max(0, Math.min(4000, document.getElementById('width').value|0));
  var nheight = Math.max(0, Math.min(4000, document.getElementById('height').value|0));
  
  if (canvas.width != nwidth || canvas.height != nheight) {
    canvas.width = nwidth;
    canvas.height = nheight;
    if (nwidth >= nheight) {
      $(canvas).css('width', 512).css('height', canvas.height * 512 / canvas.width);
    } else {
      $(canvas).css('height', 512).css('width', canvas.width * 512 / canvas.height);
    }
  }
  
  var ctx = canvas.getContext('2d');
  
  var quality = document.getElementById('quality').value|0;
  
  var memoize = function(fn) {
    var cache_obj = {};
    return function() {
      var key = JSON.stringify(arguments);
      if (!cache_obj.hasOwnProperty(key)) {
        var res = fn.apply(this, arguments);
        cache_obj[key] = res;
      }
      return cache_obj[key];
    };
  };
  
  // var wipcolor = {r: 255, g: 180, b: 160};
  var wipcolor = {r: 0, g: 0, b: 0};
  
  var get_brush = memoize(function(width, height) {
    return ctx.createImageData(width, height);
  });
  
  /*
  var start = window.performance.now();
  
  function finish() {
    var end = window.performance.now();
    
    log(Math.floor(end-start)+"ms: "+
        Math.floor((canvas.width*canvas.height)/((end-start)/1000))+"pps");
  }
  */
  
  logHtml('Processing.');
  
  var jsfarm = window.jsfarm;
  if (!jsfarm) return;
  
  jsfarm.reset();
  
  var dw = canvas.width, dh = canvas.height;
  
  jsfarm.task_defaults = {
    source: fullsrc,
    dw: dw, dh: dh,
    quality: quality
  };
  
  jsfarm.onTaskAdd = function(task) {
    ctx.fillStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.14)";
    ctx.fillRect(task.x_from, task.y_from, task.x_to - task.x_from, task.y_to - task.y_from);
    // work around strokeRect weirdness
    // see http://www.mobtowers.com/html5-canvas-crisp-lines-every-time/
    // ctx.strokeStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.6)";
    // ctx.strokeRect(task.x_from + 0.5, task.y_from + 0.5, task.x_to - task.x_from - 1, task.y_to - task.y_from - 1);
  };
  
  jsfarm.onTaskStart = function(task) {
    ctx.fillStyle = "rgb("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+")";
    ctx.fillRect(task.x_from, task.y_from, task.x_to - task.x_from, task.y_to - task.y_from);
  };
  
  jsfarm.onTaskDone = function(task, msg) {
    var wdata = msg.data;
    var brush = get_brush(task.x_to - task.x_from, task.y_to - task.y_from);
    var bdata = brush.data;
    for (var i = 0; i < bdata.length; ++i) {
      bdata[i] = wdata[i];
    }
    ctx.putImageData(brush, task.x_from, task.y_from);
  };
  
  jsfarm.onTaskProgress = function(task, frac) {
  };
  
  var extent = Math.max(next_pot(dw), next_pot(dh));
  var task = new Range(0, 0, extent, extent);
  jsfarm.addTask(task);
  
  $('#progress').empty().append(jsfarm.progress_ui.dom);
  
  jsfarm.shuffle();
  
  jsfarm.run();
}
