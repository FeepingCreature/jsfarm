'use strict';

$('#result_area > .nav-tabs a').click(function (e) {
  e.preventDefault();
  $(this).tab('show');
});

var editor_cfg = {
  lineNumbers: true,
  mode: "scheme",
  matchBrackets: true,
  autoCloseBrackets: true,
  indentUnit: 2,
  gutters: ["error-gutter"],
  extraKeys: {
    'Ctrl-Enter': function(cm) {
      RenderOrCancel();
    },
    'Ctrl-Up': function(cm) {
      $('#quality').val(($('#quality').val()|0) * 2);
    },
    'Ctrl-Down': function(cm) {
      $('#quality').val(($('#quality').val()|0) / 2);
    },
  },
};

var css_default_before = [
  'css/bootstrap.min.css',
  'addon/lint/lint.css',
  'lib/codemirror.css',
];

var css_default_after = [
  'css/site.css',
];

var themes = {
  'light': {
    editor_theme: 'neat',
    css: [
      'css/bootstrap-theme.min.css',
      'css/neat.css',
      'site-light.css',
    ]
  },
  'dark': {
    editor_theme: 'lesser-dark',
    css: [
      'css/bootstrap-cyborg.min.css',
      'css/lesser-dark.css',
      'site-dark.css',
    ]
  },
};

function loadCss(url) {
  var link = document.createElement("link");
  link.href = url;
  link.type = "text/css";
  link.rel = "stylesheet";
  link.className = "theme";
  $('meta').add('link.theme').last().after(link);
}
function loadTheme(theme) {
  $('link.theme').remove();
  var theme = themes[theme];
  for (var i = 0; i < css_default_before.length; i++) {
    loadCss(css_default_before[i]);
  }
  for (var i = 0; i < theme.css.length; i++) {
    loadCss(theme.css[i]);
  }
  for (var i = 0; i < css_default_after.length; i++) {
    loadCss(css_default_after[i]);
  }
  editor_cfg.theme = theme.editor_theme;
  var editor = window.editor;
  for (var i = 0; i < editor.files.length; ++i) {
    var file = editor.files[i];
    file.editor.setOption('theme', theme.editor_theme);
  }
}

var theme = Cookies.get('theme');
if (!theme || !themes.hasOwnProperty(theme)) theme = 'light';
loadTheme(theme);

function setTheme(theme) {
  Cookies.set('theme', theme);
  loadTheme(theme);
}

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
          MarkEditorsSaved();
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

function resizeCanvas(canvas, width, height) {
  var jq = $(canvas);
  if (canvas.width != width || canvas.height != height) {
    canvas.width = width;
    canvas.height = height;
  }
  
  // aspect ratio
  var smallscale = Math.min(512 / width, 512 / height);
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
      resizeCanvas(canvas, img.width, img.height);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      doneLoading();
    };
    img.src = obj.image;
  }
  
  if (numLoading == 0) onDone(); // nothing to do, call immediately
}

function MarkEditorsSaved() {
  window.editor.markClean();
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

function RenderScene() {
  if (!window.connection) {
    log("You must be connected to the network!");
    return;
  }
  
  $(window).trigger("startRender");
  
  // $('#console').empty();
  
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
  for (var i = 0; i < lines.length; ++i) {
    lines[i] = (i+1)+": "+lines[i];
  }
  var src = $('<div class="src" style="display:none;"></div>');
  src.append($('<pre></pre>').text(lines.join("\n").replace(/\t/g, '  ')));
  var a = $('<a></a>').attr('href', '#').on('click', function(e) { e.preventDefault(); src.toggle(); }).text('Source');
  var div = $('<div></div>');
  div.append(document.createTextNode('> Rendering. (')).append(a).append(')').append(src).append('<br>');
  logJq(div);
  
  var canvas = document.getElementById('canvas');
  
  var nwidth = Math.max(0, Math.min(4096, document.getElementById('width').value|0));
  var nheight = Math.max(0, Math.min(4096, document.getElementById('height').value|0));
  
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
  
  var workset = new RenderWorkset(window.connection);
  
  window.workset = workset;
  
  $('#RenderButton').hide();
  $('#CancelButton').show();
  
  var dw = canvas.width, dh = canvas.height;
  
  workset.task_defaults = {
    source: fullsrc,
    dw: dw, dh: dh, di: quality
  };
  
  workset.onTaskAdd = function(task) {
    ctx.fillStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.14)";
    ctx.fillRect(task.x_from, task.y_from, task.x_to - task.x_from, task.y_to - task.y_from);
    // work around strokeRect weirdness
    // see http://www.mobtowers.com/html5-canvas-crisp-lines-every-time/
    // ctx.strokeStyle = "rgba("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+", 0.6)";
    // ctx.strokeRect(task.x_from + 0.5, task.y_from + 0.5, task.x_to - task.x_from - 1, task.y_to - task.y_from - 1);
  };
  
  workset.onTaskStart = function(task) {
    ctx.fillStyle = "rgb("+wipcolor.r+", "+wipcolor.g+", "+wipcolor.b+")";
    ctx.fillRect(task.x_from, task.y_from, task.x_to - task.x_from, task.y_to - task.y_from);
  };
  
  workset.onTaskDone = function(task, msg) {
    var wdata = msg.data;
    var brush = get_brush(task.x_to - task.x_from, task.y_to - task.y_from);
    var bdata = brush.data;
    for (var i = 0; i < bdata.length; ++i) {
      bdata[i] = wdata[i];
    }
    ctx.putImageData(brush, task.x_from, task.y_from);
  };
  
  workset.onTaskProgress = function(task, frac) {
  };
  
  workset.onDone = CancelRender;
  
  var extent = Math.max(next_pot(dw), next_pot(dh));
  var task = new Range(0, 0, 0, extent, extent, quality);
  workset.addTask(task);
  
  $('#progress').empty().append(workset.progress_ui.dom);
  
  workset.shuffle();
  
  workset.run();
}

function CancelRender() {
  if (window.hasOwnProperty('workset')) {
    window.workset.cancel();
    delete window.workset;
  }
  $('#CancelButton').hide();
  $('#RenderButton').show();
}

function RenderOrCancel() {
  if (window.hasOwnProperty('workset')) CancelRender();
  else RenderScene();
}

function Connect() {
  window.connection = new ServerConnection;
  window.connection.connect();
  log("Connected and waiting for work.");
}

function Disconnect() {
  if (window.hasOwnProperty('workset')) CancelRender();
  window.connection.disconnect();
  window.connection = null;
}
