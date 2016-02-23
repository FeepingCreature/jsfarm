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

function renderScene() {
  $(window).trigger("startRender");
  
  $('#console').empty();
  
  var fullsrc = window.getFullSrc();
  var files = window.getFiles();
  
  for (var i = 0; i < files.length; ++i) {
    var file = files[i];
    file.clear();
  }
  
  var jsource = compile(files);
  
  var lines = jsource.split("\n");
  for (var i = 0; i < lines.length; ++i)
    lines[i] = (i+1)+": "+lines[i];
  var srctext = lines.join("<br>").replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  logHtml("<a href=\"#\" onclick=\"$(this).parent().find('.src').toggle();\">Source</a>"+
      "<div class=\"src\" style=\"display:none;\">"+srctext+"</div>");
  
  var canvas = document.getElementById('canvas');
  
  canvas.width = Math.max(0, Math.min(4000, document.getElementById('width').value));
  canvas.height = Math.max(0, Math.min(4000, document.getElementById('height').value));
  $(canvas).css('height', canvas.height * 512 / canvas.width);
  
  var ctx = canvas.getContext('2d');
  
  var bsize = 16;
  
  if (canvas.width % bsize != 0 || canvas.height % bsize != 0) {
    alert("Size of canvas must be a multiple of blocksize!");
    return;
  }
  
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
  
  var wipbrush = ctx.createImageData(bsize, bsize);
  
  for (var base = 0; base < bsize * bsize; ++base) {
    wipbrush.data[base*4 + 0] = 160;
    wipbrush.data[base*4 + 1] = 220;
    wipbrush.data[base*4 + 2] = 255;
    wipbrush.data[base*4 + 3] = 255;
  }
  
  var brush = ctx.createImageData(bsize, bsize);
  
  /*
  var start = window.performance.now();
  
  function finish() {
    var end = window.performance.now();
    
    log(Math.floor(end-start)+"ms: "+
        Math.floor((canvas.width*canvas.height)/((end-start)/1000))+"pps");
  }
  */
  
  var id = unique_id();
  logHtml('Running tasks: <div id="'+id+'" style="display: inline-block;"></div>');
  
  var tasks = $('#'+id);
  
  var jsfarm = window.jsfarm;
  if (!jsfarm) return;
  
  var addTaskFor = function(x_from, y_from) {
    var taskmarker = $('<div style="width: 8px; height: 8px; margin: -1px 0 0 -1px; background-color: #ff7777; border: 1px solid gray; display: inline-block; "></div>');
    tasks.append(taskmarker);
    
    var dw = canvas.width, dh = canvas.height;
    var task = {
      source: fullsrc,
      dw: dw, dh: dh,
      x_from: x_from, x_to: x_from + bsize,
      y_from, y_from, y_to: y_from + bsize
    };
    jsfarm.addTask(task).
      onStart(function() {
        ctx.putImageData(wipbrush, x_from, y_from);
      }).
      onDone(function(msg) {
        var wdata = msg.data;
        var bdata = brush.data;
        for (var i = 0; i < bdata.length; ++i) {
          bdata[i] = wdata[i];
        }
        ctx.putImageData(brush, x_from, y_from);
        taskmarker.css('background-color', '#77ff77');
      });
  };
  
  ctx.putImageData(sidesbrush, 0, 0);
  ctx.putImageData(sidesbrush, canvas.width - 6, 0);
  
  for (var y = 0; y < canvas.height; y += bsize) {
    for (var x = 0; x < canvas.width; x += bsize) {
      addTaskFor(x, y);
    }
  }
  
  jsfarm.shuffle();
  
  jsfarm.run();
}
