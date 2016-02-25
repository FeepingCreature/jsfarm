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
    $(canvas).css('height', canvas.height * 512 / canvas.width);
  }
  
  var ctx = canvas.getContext('2d');
  
  var quality = document.getElementById('quality').value|0;
  
  var sidesbrush = ctx.createImageData(6, canvas.height);
  
  for (var y = 0; y < canvas.height; ++y) {
    for (var x = 0; x < 6; ++x) {
      var base = y * 6 + x;
      sidesbrush.data[base*4 + 0] = 200;
      sidesbrush.data[base*4 + 1] = 80;
      sidesbrush.data[base*4 + 2] = 80;
      sidesbrush.data[base*4 + 3] = 255;
    }
  }
  
  var wipbrush_cache = {};
  var get_wipbrush = function(width, height) {
    var key = width+"x"+height;
    if (!wipbrush_cache.hasOwnProperty(key)) {
      var wipbrush = ctx.createImageData(width, height);
      for (var base = 0; base < width * height; ++base) {
        wipbrush.data[base*4 + 0] = 160;
        wipbrush.data[base*4 + 1] = 220;
        wipbrush.data[base*4 + 2] = 255;
        wipbrush.data[base*4 + 3] = 255;
      }
      return wipbrush;
    }
    return wipbrush_cache[key];
  };
  
  var brush_cache = {};
  var get_brush = function(width, height) {
    var key = width+"x"+height;
    if (!brush_cache.hasOwnProperty(key)) {
      brush_cache[key] = ctx.createImageData(width, height);
    }
    return brush_cache[key];
  };
  
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
  
  ctx.putImageData(sidesbrush, 0, 0);
  ctx.putImageData(sidesbrush, canvas.width - 6, 0);
  
  var dw = canvas.width, dh = canvas.height;
  
  var task = {
    source: fullsrc,
    dw: dw, dh: dh,
    quality: quality,
    x_from: 0, x_to: dw,
    y_from: 0, y_to: dh
  };
  
  jsfarm.addTask(task).
    onStart(function(task) {
      var brush = get_wipbrush(task.x_to - task.x_from, task.y_to - task.y_from);
      ctx.putImageData(brush, task.x_from, task.y_from);
    }).
    onDone(function(task, msg) {
      var wdata = msg.data;
      var brush = get_brush(task.x_to - task.x_from, task.y_to - task.y_from);
      var bdata = brush.data;
      for (var i = 0; i < bdata.length; ++i) {
        bdata[i] = wdata[i];
      }
      ctx.putImageData(brush, task.x_from, task.y_from);
    }).
    onProgress(function(task, frac) {
    });
  
  $('#progress').empty().append(jsfarm.progress_ui.dom);
  
  jsfarm.shuffle();
  
  jsfarm.run();
}
