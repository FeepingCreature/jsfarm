'use strict';

$('#result_area > .nav-tabs a').click(function (e) {
  e.preventDefault();
  $(this).tab('show');
});

var editor_defaults = {
  lineNumbers: true,
  mode: "renderlisp",
  matchBrackets: true,
  autoCloseBrackets: true,
  indentUnit: 2,
  gutters: ["error-gutter"],
  viewportMargin: Infinity,
  showCursorWhenSelecting: true,
  lineWiseCopyCut: false // why is this on by default??
};

function getEditorCfg(jq) {
  return $.extend({}, editor_defaults, {
    extraKeys: {
      'Ctrl-Enter': function(cm) {
        RenderOrCancel(jq);
      },
      'Ctrl-Up': function(cm) {
        jq.find('#quality').val((jq.find('#quality').val()|0) * 2);
      },
      'Ctrl-Down': function(cm) {
        jq.find('#quality').val((jq.find('#quality').val()|0) / 2);
      }
    }
  });
}

var theme = Cookies.get('theme');
if (!theme || !themes.hasOwnProperty(theme)) theme = 'light';
loadTheme(theme);

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
    save: function(src, editor) {
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
          editor.markClean();
          var a = document.createElement("a");
          a.href = obj.html_url;
          logJq($(document.createTextNode('> ')).add($(a).text("Script saved.")).add('<br>'));
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
  window.location = "#"+anchor_array.join(";");
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

function Save(jq) {
  var dom = jq[0];
  StorageHandlers["gist.github.com"].save(getFullSrc(dom.editor_ui), dom.editor_ui);
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

function resizeCanvas(canvas, width, height) {
  var jq = $(canvas);
  var cw = jq.closest('.canvas-wrapper');
  var container_width = cw.width(), container_height = cw.height();
  if (canvas.width != width || canvas.height != height) {
    canvas.width = width;
    canvas.height = height;
  }
  
  // aspect ratio
  var smallscale = Math.min(container_width / width, container_height / height);
  var small_w = (width  * smallscale)|0;
  var small_h = (height * smallscale)|0;
  
  jq.off('click');
  
  var compressed = width > 512 || height > 512;
  
  var reset = function() {
    jq.removeClass('canvas-fullsize').
      css('width', small_w).css('height', small_h).
      css('margin-left', '').
      css('margin-top' , '');
    if (compressed) jq.addClass('canvas-downscaled');
    else jq.removeClass('canvas-downscaled');
    
    if (window.hasOwnProperty('fullsize_canvas')) {
      $(window).off('resize', null, window.fullsize_canvas);
      delete window.fullsize_canvas;
    }
  };
  
  reset();
  
  if (compressed) {
    jq.on('click', function() {
      if (jq.hasClass('canvas-downscaled')) {
        jq.removeClass('canvas-downscaled').addClass('canvas-fullsize');
        window.fullsize_canvas = function() {
          var win_w = window.innerWidth, win_h = window.innerHeight;
          var scale = Math.min(win_w / Math.max(win_w, width), win_h / Math.max(win_h, height));
          var target_w = (width  * scale)|0;
          var target_h = (height * scale)|0;
          jq.css('width', target_w).css('height', target_h).
            css('margin-left', (-target_w/2)|0).
            css('margin-top' , (-target_h/2)|0);
        };
        window.fullsize_canvas();
        $(window).on('resize', null, window.fullsize_canvas);
      } else {
        reset();
      }
    });
  }
}

function LoadStateFromAnchor(dom) {
  var obj = loadAnchor();
  var editor = dom.editor_ui;
  
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
    }
  };
  
  for (var key in StorageHandlers) if (StorageHandlers.hasOwnProperty(key)) {
    StorageHandlers[key].load(startLoading, function(src) {
      editor.files = splitSrc(src);
      editor.rebuildFileUi(editor.files);
      doneLoading();
    });
  }
  
  if (obj.hasOwnProperty("image")) {
    startLoading();
    var canvas = document.getElementsByClassName('render-canvas')[0];
    var img = new Image;
    img.crossOrigin = '';
    img.onload = function() {
      resizeCanvas(canvas, img.width, img.height);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      doneLoading();
    };
    img.src = obj.image;
  }
}

$(function() {
  $(window).on('beforeunload', function() {
    if (!window.editor.allClean()) {
      return "You have unsaved code! Are you sure you want to leave?";
    }
  });
});

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

function RenderScene(jq) {
  $(window).trigger("startRender");
  
  // $('#console').empty();
  
  var dom = jq[0];
  var fullsrc = getFullSrc(dom.editor_ui);
  var files = getFiles(dom.editor_ui);
  
  for (var i = 0; i < files.length; ++i) {
    var file = files[i];
    file.clear();
  }
  
  // dirty.. so dirty...
  window.setErrorAt = function(loc1, loc2, text) {
    setEditorErrorAt(dom.editor_ui, loc1, loc2, text);
  };
  
  var jsource = "";
  try {
    jsource = compile(files);
    // to check if it actually compiles
    new Function('stdlib', 'foreign', 'heap', jsource);
  } catch (ex) {
    log("Could not compile scene: "+ex);
    return;
  }
  
  window.setErrorAt = null;
  
  var lines = jsource.split("\n");
  for (var i = 0; i < lines.length; ++i) {
    lines[i] = (i+1)+": "+lines[i];
  }
  var src = $('<div class="src" style="display:none;"></div>');
  src.append($('<pre></pre>').text(lines.join("\n").replace(/\t/g, '  ')));
  var a = $('<a></a>').attr('href', '#').on('click', function(e) { e.preventDefault(); src.toggle(); }).text('Source');
  var div = $('<div></div>');
  div.append(document.createTextNode('> Rendering. (')).append(a).append(')').append(src).append('<br>');
  logJq(div);
  
  var canvas = jq.find('canvas')[0];
  
  var nwidth = Math.max(0, Math.min(4096, jq.find('#width').val()|0));
  var nheight = Math.max(0, Math.min(4096, jq.find('#height').val()|0))
  
  resizeCanvas(canvas, nwidth, nheight);
  
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
  
  var workset = new RenderWorkset(jq, window.connection);
  if (workset.connection.local) {
    jq.find('#ConnectButton').hide();
    jq.find('#DisconnectButton').hide();
  }
  jq[0].workset = workset;
  
  jq.find('#RenderButton').hide();
  jq.find('#CancelButton').show();
  
  var dw = canvas.width, dh = canvas.height;
  
  workset.task_defaults = {
    source: fullsrc,
    dw: dw, dh: dh, di: quality
  };
  
  ctx.fillStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.7)";
  ctx.fillRect(0, 0, dw, dh);
  
  workset.onTaskAdd = function(task) {
    // ctx.fillStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.14)";
    // ctx.fillRect(task.x_from, task.y_from, task.x_to - task.x_from, task.y_to - task.y_from);
    // // work around strokeRect weirdness
    // // see http://www.mobtowers.com/html5-canvas-crisp-lines-every-time/
    // // ctx.strokeStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.6)";
    // // ctx.strokeRect(task.x_from + 0.5, task.y_from + 0.5, task.x_to - task.x_from - 1, task.y_to - task.y_from - 1);
  };
  
  workset.onTaskStart = function(task) {
    // ctx.fillStyle = "rgb("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+")";
    // ctx.fillRect(task.x_from, task.y_from, task.x_to - task.x_from, task.y_to - task.y_from);
  };
  
  var ResultData = new Float32Array(dw*dh*4);
  
  workset.onTaskDone = function(task, wdata) {
    var
      tdw = task.x_to - task.x_from,
      tdh = task.y_to - task.y_from,
      tdi = task.i_to - task.i_from;
    var brush = get_brush(tdw, tdh);
    var bdata = brush.data;
    for (var y = 0; y < tdh; ++y) {
      for (var x = 0; x < tdw; ++x) {
        var base = y * tdw + x;
        var rbase = (y + task.y_from) * dw + (x + task.x_from);
        var r = ResultData[rbase*4+0] + wdata[base*3+0]; ResultData[rbase*4+0] = r;
        var g = ResultData[rbase*4+1] + wdata[base*3+1]; ResultData[rbase*4+1] = g;
        var b = ResultData[rbase*4+2] + wdata[base*3+2]; ResultData[rbase*4+2] = b;
        var i = ResultData[rbase*4+3] + tdi; ResultData[rbase*4+3] = i;
        r /= i; g /= i; b /= i;
        
        bdata[base*4+0] = Math.floor(Math.max(0, Math.min(1, r)) * 255.99);
        bdata[base*4+1] = Math.floor(Math.max(0, Math.min(1, g)) * 255.99);
        bdata[base*4+2] = Math.floor(Math.max(0, Math.min(1, b)) * 255.99);
        bdata[base*4+3] = 255;
      }
    }
    ctx.putImageData(brush, task.x_from, task.y_from);
  };
  
  workset.onTaskProgress = function(task, frac) {
  };
  
  workset.onDone = function() {
    if (workset.connection.local) {
      // stop our temporary threads
      workset.connection.shutdown();
      jq.find('#ConnectButton').show();
    }
    CancelRender(jq);
  };
  
  var extent = Math.max(next_pot(dw), next_pot(dh));
  var task = new Range(0, 0, 0, extent, extent, quality);
  workset.addTask(task);
  
  jq.find('.progress-container').empty().append(workset.progress_ui.dom);
  
  workset.shuffle();
  
  workset.run();
}

function CancelRender(jq) {
  if (typeof jq == 'undefined') jq = $('.render_ui');
  var dom = jq[0];
  if (dom.hasOwnProperty('workset')) {
    dom.workset.cancel();
    delete dom.workset;
  }
  jq.find('#CancelButton').hide();
  jq.find('#RenderButton').show();
}

function RenderOrCancel(jq) {
  var dom = jq[0];
  if (dom.hasOwnProperty('workset')) CancelRender(jq);
  else RenderScene(jq);
}

function Connect(jq) {
  window.connection = new ServerConnection($('body'));
  window.connection.connect();
  $('#settings input').attr('disabled', 'disabled');
  log("Connected and waiting for work.");
}

function Disconnect(jq) {
  if (typeof jq !== 'undefined') {
    var dom = jq[0];
    if (dom.hasOwnProperty('workset')) CancelRender(jq);
  }
  $('#settings input').removeAttr('disabled');
  window.connection.disconnect();
  window.connection = null;
}
