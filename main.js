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

// opt-in to raw html logging
function logHtml() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  if (typeof window !== 'undefined') {
    $('#console').append('&gt; '+msg+'<br>');
  }
}

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  if (typeof window !== 'undefined') {
    $('#console').append(document.createTextNode('> '+msg)).append('<br>');
  }
}

function run() {
  $('#console').empty();
  
  var s2src = window.editor.getValue();
  
  var source = compile(s2src);
  
  var lines = source.split("\n");
  for (var i = 0; i < lines.length; ++i)
    lines[i] = (i+1)+": "+lines[i];
  var srctext = lines.join("<br>").replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  logHtml("<a href=\"#\" onclick=\"$(this).parent().find('.src').toggle();\">Source</a>"+
      "<div class=\"src\" style=\"display:none;\">"+srctext+"</div>");
  
  var ctx = document.getElementById('canvas').getContext('2d');
  
  var stepsize = 1;
  
  var progressbrush = ctx.createImageData(6, 512);
  
  for (var y = 0; y < 512; ++y) {
    for (var x = 0; x < 6; ++x) {
      var base = y * 6 + x;
      progressbrush.data[base*4 + 0] = 200;
      progressbrush.data[base*4 + 1] = 80;
      progressbrush.data[base*4 + 2] = 80;
      progressbrush.data[base*4 + 3] = 255;
    }
  }
  
  var wipbrush = ctx.createImageData(512, 1);
  
  for (var base = 0; base < 512; ++base) {
    wipbrush.data[base*4 + 0] = 96;
    wipbrush.data[base*4 + 1] = 200;
    wipbrush.data[base*4 + 2] = 255;
    wipbrush.data[base*4 + 3] = 255;
  }
  
  var brush = ctx.createImageData(512, stepsize);
  
  function executeInBack(from, to, finalize) {
    var worker = new Worker("pool.js");
    // var update = null;
    worker.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.kind == "finish") {
      } else if (msg.kind == "alert") {
        alert(msg.message);
      } else if (msg.kind == "progress") {
        // if (update) update((msg.progress * 100 + 0.5)|0);
      } else throw ("what is "+msg.kind);
    });
    // var progbar = bootstrap_progbar();
    // update = progbar.update;
    
    worker.postMessage({from: from, to: to, source: source});
  }
  
  var start = window.performance.now();
  
  function finish() {
    var end = window.performance.now();
    
    log(Math.floor(end-start)+"ms: "+
        Math.floor((512*512)/((end-start)/1000))+"pps");
  }
  
  var id = unique_id();
  logHtml('Running tasks: <div id="'+id+'" style="display: inline-block;"></div>');
  
  var tasks = $('#'+id);
  
  var jsfarm = window.jsfarm;
  if (!jsfarm) return;
  
  var addTaskFor = function(y) {
    var taskmarker = $('<div style="width: 8px; height: 8px; margin: -1px 0 0 -1px; background-color: #ff7777; border: 1px solid gray; display: inline-block; "></div>');
    tasks.append(taskmarker);
    
    var task = { source: s2src, from: y, to: Math.min(512, y + stepsize) };
    jsfarm.addTask(task).
      onStart(function() {
        log("onStart");
        ctx.putImageData(wipbrush, 0, y);
      }).
      onDone(function(msg) {
        var from = task.from, to = task.to, wdata = msg.data;
        var bdata = brush.data;
        for (var i = 0; i < bdata.length; ++i) {
          bdata[i] = wdata[i];
        }
        ctx.putImageData(brush, 0, y);
        taskmarker.css('background-color', '#77ff77');
      });
  };
  
  ctx.putImageData(progressbrush, 0, 0);
  ctx.putImageData(progressbrush, 512 - 6, 0);
  
  for (var y = 0; y < 512; y += stepsize) {
    addTaskFor(y);
  }
  
  jsfarm.run();
  // jsfarm.giveWorkToIdlePeers();
  
  /*
  for (var y = 0; y < 512; y += stepsize) {
    var taskmarker = $('<div style="width: 8px; height: 8px; margin: -1px 0 0 -1px; background-color: #ff7777; border: 1px solid gray; display: inline-block; "></div>');
    tasks.append(taskmarker);
    pool.
      addTask({ source: source, from: y, to: Math.min(512, y + stepsize) }).
      onDone(function(msg) {
        var from = msg.from, to = msg.to, wdata = msg.data;
        var bdata = brush.data;
        for (var i = 0; i < wdata.length; ++i) {
          bdata[i] = wdata[i];
        }
        ctx.putImageData(brush, 0, from);
        this.css('background-color', '#77ff77');
      }.bind(taskmarker)).
      onProgress(function(percent) {
        var red = $.Color("#ff7777");
        var green = $.Color("#77ff77");
        this.css('background-color', red.transition(green, percent).toHexString(false));
      }.bind(taskmarker));
  }
  pool.run();*/
}
