'use strict';

function formatTime(d) {
  var seconds = Math.floor(d / 1000);
  
  if (seconds == 0) return "0s";
  
  var res = "";
  
  var checkUnit = function(letter, size) {
    if (seconds >= size) {
      var wholes = Math.floor(seconds / size);
      if (res.length) res += " ";
      res += wholes+letter;
      seconds -= wholes * size;
    }
  };
  
  checkUnit("y", 60*60*24*365);
  checkUnit("w", 60*60*24*7);
  checkUnit("d", 60*60*24);
  checkUnit("h", 60*60);
  checkUnit("m", 60);
  checkUnit("s", 1);
  
  return res;
}

var dom_queue = window.domq.batch();

function text(node, content) {
  /*
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  node.appendChild(document.createTextNode(content));
  */
  dom_queue.text(node, content);
}

var _progressBar = $(
'<div>'+
  '<div class="label annot annot-spacer" style="float:right; visibility: hidden;">'+
  '</div>'+
  '<div style="position: relative; display: flex;">'+
    '<div class="label label-outside annot annot-after" style="position:absolute;top:0px;">'+
    '</div>'+
    '<div class="progress">'+
      '<div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 100%;">'+
        '<span class="sr-only"></span>'+
        '<div class="label annot annot-inside"></div>'+
      '</div>'+
    '</div>'+
  '</div>'+
  '<div class="label label-outside eta"></div>'+
'</div>')[0];

var _progressBarCache = {};

function random_blue() {
  var hex = "0123456789abcdef";
  var r = Math.random(), s = Math.random();
  return "#"
    +hex[Math.floor(r*3)+5]
    +hex[Math.floor(r*4)+8]
    +hex[Math.floor(s*2)+14];
}

/** @constructor */
function ProgressInfo(settings) {
  this.settings = settings;
  
  settings.eta = settings.eta || false;
  settings.thin = settings.thin || false;
  settings.percent = settings.percent || false;
  settings.fraction = settings.fraction || false;
  settings.label_inside = settings.label_inside || false;
  settings.label_after = settings.label_after || false;
  
  this.value = 0;
  this.start = 0;
  this.max = 0;
  
  var settings_str = JSON.stringify(settings);
  if (_progressBarCache.hasOwnProperty(settings_str)) {
    this.dom = $(_progressBarCache[settings_str].cloneNode(true));
    if (settings.thin) {
      this.dom.find('.progress-bar').css('background-color', random_blue());
    }
  } else {
    this.dom = $(_progressBar.cloneNode(true));
    
    if (settings.thin) {
      this.dom.find('.progress').css('height', '5px');
    } else {
      this.dom.find('.progress-bar').addClass('progress-bar-striped');
    }
    
    if (settings.label_inside) {
      this.dom.find('.progress').css('min-width', '8em');
    } else {
      this.dom.find('.progress').css('min-width', '5px');
      this.dom.find('.annot-inside').remove();
    }
    
    if (!settings.label_after) {
      this.dom.find('.annot-after').remove();
      this.dom.find('.annot-spacer').remove();
    }
    
    _progressBarCache[settings_str] = this.dom[0];
  }
  
  this.dom_cache = {
    'progress-bar': this.dom[0].getElementsByClassName('progress-bar')[0],
    'progress'    : this.dom[0].getElementsByClassName('progress')[0],
    'sr-only'     : this.dom[0].getElementsByClassName('sr-only')[0],
    'annot'       : this.dom[0].getElementsByClassName('annot'),
    'annot-after' : this.dom[0].getElementsByClassName('annot-after'),
    'eta'         : this.dom[0].getElementsByClassName('eta')[0]
  };
  
  this.reset = function(total) {
    this.max = total;
    this.start = time();
    this.update(0);
  };
  
  this.getProgress = function() {
    return this.value / this.max;
  };
  this.getPercent = function() {
    return Math.floor(this.getProgress() * 100);
  };
  this.getEstimate = function() {
    var
      t = time(),
      f = this.getProgress(),
      t_elapsed = t - this.start,
      t_total = t_elapsed / f;
    return {
      elapsed: t_elapsed,
      remaining: t_total - t_elapsed
    };
  };
  this.update = function(newval) {
    newval = +newval;
    
    this.value = newval;
    
    var prog_percent = this.getPercent();
    var newlabel = null;
    if (settings.percent && settings.fraction) {
      newlabel = prog_percent+"%, "+this.value+" / "+this.max;
    } else if (settings.percent) {
      newlabel = prog_percent+"%";
    } else if (settings.fraction) {
      newlabel = this.value+" / "+this.max;
    }
    
    var dom_cache = this.dom_cache;
    /*
    dom_cache['progress-bar'].setAttribute('aria-valuenow', prog_percent);
    dom_cache['progress'].style.width = prog_percent+"%";
    */
    dom_queue.setAttribute(dom_cache['progress-bar'], 'aria-valuenow', prog_percent);
    dom_queue.style(dom_cache['progress'], 'width', prog_percent+"%");
    text(dom_cache['sr-only'], newlabel);
    for (var i = 0; i < dom_cache['annot'].length; ++i) {
      text(dom_cache['annot'][i], newlabel);
    }
    if (dom_cache['annot-after'].length) {
      // dom_cache['annot-after'][0].style.left = prog_percent+"%";
      dom_queue.style(dom_cache['annot-after'][0], 'left', prog_percent+"%");
    }
    
    if (this.settings.eta) {
      var stats = this.getEstimate();
      text(dom_cache['eta'], "elapsed "+formatTime(stats.elapsed)+", left "+formatTime(stats.remaining));
    }
  };
  this.update(0);
  
  this.increase = function(by) {
    this.update(this.value + by);
  };
}

/** @constructor */
function ProgressUI(jq, max_fn) {
  this.main_progress = new ProgressInfo({percent: true, fraction: true, eta: true, label_inside: true});
  this.max_fn = max_fn;
  this.label_by_id = {};
  this.contributors = {};
  this.num_connections = 0;
  
  var dom = $('<dl><dt>Tasks</dt><dd><div id="main_progress"></div></dd></dl>');
  dom.find('#main_progress').replaceWith(this.main_progress.dom);
  
  this.dom = dom;
  this.cache = {
    '.QuickProgInfo': jq.find('.QuickProgInfo')[0]
  };
  
  this.reset = function() {
    this.main_progress.reset(this.max_fn());
    
    text(this.cache['.QuickProgInfo'], "");
    
    for (var key in this.contributors) if (this.contributors.hasOwnProperty(key)) {
      this.contributors[key].dom_outer.detach();
    }
    
    this.label_by_id = {};
    this.contributors = {};
  };
  
  this.sortContributors = function() {
    var self = this;
    
    var contribList = [];
    for (var key in this.contributors) if (this.contributors.hasOwnProperty(key)) {
      this.contributors[key].dom_outer.detach();
      contribList.push(key);
    }
    contribList.sort(function(a, b) {
      return self.contributors[b].value - self.contributors[a].value;
    });
    
    for (var i = 0; i < contribList.length; ++i) {
      this.dom.append(this.contributors[contribList[i]].dom_outer);
    }
  };
  
  this.rescaleTaskListHeight = function(id) {
    var proginfo = this.contributors[this.label_by_id[id]];
    var tasks_dom = proginfo.tasks_dom;
    var numRows = tasks_dom[0].childNodes.length;
    var setHeight = proginfo._set_height || 0;
    var newHeight = numRows * 5 + 2;
    if (newHeight > setHeight) {
      tasks_dom[0].style.display = "inherit";
      tasks_dom[0].style.height = newHeight+"px";
      proginfo._set_height = newHeight;
    }
  };
  
  this.onOpenConnection = function(id, label) {
    this.num_connections ++;
    this.label_by_id[id] = label;
    var proginfo = null;
    if (this.contributors.hasOwnProperty(label)) {
      proginfo = this.contributors[label];
    } else {
      proginfo = new ProgressInfo({percent: true, fraction: true, label_inside: true});
      proginfo.refs = 0;
      proginfo.reset(this.main_progress.max);
      
      this.contributors[label] = proginfo;
      
      proginfo.tasks_dom = $('<div class="task-bar-list"></div>');
      proginfo.dom_outer = $('<div></div>').
        append($('<dt></dt>').text(label)).
        append($('<dd></dd>').append(proginfo.dom).append(proginfo.tasks_dom));
      
      this.dom.children().eq(1).after(proginfo.dom_outer);
    }
    proginfo.refs ++;
  };
  this.onCloseConnection = function(id) {
    this.num_connections --;
    this.sortContributors();
    this.updateQuickProgInfo();
    var proginfo = this.contributors[this.label_by_id[id]];
    proginfo.refs --;
    if (proginfo.refs == 0) {
      var tasks_dom = proginfo.tasks_dom;
      tasks_dom.css("display", "none");
      proginfo._set_height = 0;
    }
  };
  this.append_remove = function(fn, task) {
    var self = this, assigned_to = task.assigned_to;
    var tasks_dom = self.contributors[self.label_by_id[assigned_to]].tasks_dom;
    fn.call(dom_queue, tasks_dom[0], task._progress.dom[0]);
    dom_queue.call(function() {
      self.rescaleTaskListHeight(assigned_to);
    });
  };
  this.onTaskAccepted = function(task) {
    task._progress = new ProgressInfo({ thin: true });
    task._progress.reset(512);
    if (!this.contributors.hasOwnProperty(this.label_by_id[task.assigned_to])) {
      throw ("unknown contributor for "+task.assigned_to+": "+this.label_by_id[task.assigned_to]);
    }
    this.append_remove(dom_queue.appendChild, task);
  };
  this.onTaskProgressed = function(task) {
    task._progress.update(Math.floor(task.progress * 512));
  };
  this.onTaskCompleted = function(task) {
    // this can fail if the task never even progressed before being completed.
    if (task.hasOwnProperty('_progress')) {
      this.append_remove(dom_queue.removeChild, task);
      delete task._progress;
    }
    
    var msg = task.message;
    var size = (msg.x_to - msg.x_from) * (msg.y_to - msg.y_from) * (msg.i_to - msg.i_from);
    
    this.contributors[this.label_by_id[task.assigned_to]].increase(size);
    
    this.main_progress.increase(size);
    
    this.updateQuickProgInfo();
  };
  this.onTaskAborted = function(task) {
    if (!task.hasOwnProperty('_progress')) return;
    this.append_remove(dom_queue.removeChild, task);
    delete task._progress;
  };
  this.updateQuickProgInfo = function() {
    text(this.cache['.QuickProgInfo'], this.num_connections+" peers - "
      +this.main_progress.getPercent()+"% - "
      +this.main_progress.dom_cache['eta'].textContent);
  };
  this.updateQuickProgInfo();
}
