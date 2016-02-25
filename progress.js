function formatTime(d) {
  var seconds = Math.floor(d / 1000);
  
  if (seconds == 0) return "0s";
  
  var parts = [];
  
  var checkUnit = function(letter, size) {
    if (seconds >= size) {
      var wholes = Math.floor(seconds / size);
      parts.push(wholes+letter);
      seconds -= wholes * size;
    }
  };
  
  checkUnit("y", 60*60*24*365);
  checkUnit("w", 60*60*24*7);
  checkUnit("d", 60*60*24);
  checkUnit("h", 60*60);
  checkUnit("m", 60);
  checkUnit("s", 1);
  
  return parts.join(" ");
}

var _progressBar = $('\
<div>\
  <div class="label annot annot-spacer" style="float:right; visibility: hidden;">\
  </div>\
  <div style="position: relative; display: flex;">\
    <div class="label label-outside annot annot-after" style="position:absolute;top:0px;">\
    </div>\
    <div class="progress">\
      <div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 100%;">\
        <span class="sr-only"></span>\
        <div class="label annot annot-inside"></div>\
      </div>\
    </div>\
  </div>\
  <div class="label label-outside eta"></div>\
</div>')[0];

var _progressBarCache = {};

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
    this.value = 0;
  };
  
  this.getProgress = function() {
    return this.value / this.max;
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
    
    var prog_percent = Math.floor(this.getProgress() * 100);
    var newlabel = null;
    if (settings.percent && settings.fraction) {
      newlabel = prog_percent+"%, "+this.value+" / "+this.max;
    } else if (settings.percent) {
      newlabel = prog_percent+"%";
    } else if (settings.fraction) {
      newlabel = this.value+" / "+this.max;
    }
    
    var text = function(node, content) {
      while (node.firstChild) {
        node.removeChild(node.firstChild);
      }
      node.appendChild(document.createTextNode(content));
    };
    
    var dom_cache = this.dom_cache;
    dom_cache['progress-bar'].setAttribute('aria-valuenow', prog_percent);
    dom_cache['progress'].style.width = prog_percent+"%";
    text(dom_cache['sr-only'], newlabel);
    for (var i = 0; i < dom_cache['annot'].length; ++i) {
      text(dom_cache['annot'][i], newlabel);
    }
    if (dom_cache['annot-after'].length) {
      dom_cache['annot-after'][0].style.left = prog_percent+"%";
    }
    
    if (this.settings.eta) {
      var stats = this.getEstimate();
      text(dom_cache['eta'], "elapsed "+formatTime(stats.elapsed)+", remaining "+formatTime(stats.remaining));
    }
  };
  this.update(0);
  
  this.increment = function() {
    this.update(this.value + 1);
  };
}

/** @constructor */
function ProgressUI(tasks) {
  this.tasks = tasks;
  
  this.main_progress = new ProgressInfo({percent: true, fraction: true, eta: true, label_inside: true});
  this.label_by_id = {};
  this.contributors = {};
  
  var dom = $('<dl><dt>Tasks</dt><dd><div id="main_progress"></div></dd></dl>');
  dom.find('#main_progress').replaceWith(this.main_progress.dom);
  
  this.dom = dom;
  
  this.reset = function() {
    this.main_progress.reset(this.tasks.length);
    
    for (var key in this.contributors) if (this.contributors.hasOwnProperty(key)) {
      this.contributors[key].dom_outer.detach();
    }
    
    this.label_by_id = {};
    this.contributors = {};
  };
  
  this.addToDom = function(label) {
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
    var newHeight = numRows * 5;
    if (newHeight > setHeight) {
      tasks_dom[0].style.display = "inherit";
      tasks_dom[0].style.height = newHeight+"px";
      proginfo._set_height = newHeight;
    }
  };
  
  this.onOpenConnection = function(id, label) {
    this.label_by_id[id] = label;
    var proginfo = null;
    if (this.contributors.hasOwnProperty(label)) {
      proginfo = this.contributors[label];
    } else {
      proginfo = new ProgressInfo({percent: true, fraction: true, label_inside: true});
      proginfo.refs = 0;
      proginfo.reset(this.tasks.length);
      
      this.contributors[label] = proginfo;
      
      proginfo.tasks_dom = $('<div class="task-bar-list"></div>');
      proginfo.dom_outer = $('<div></div>').
        append($('<dt></dt>').text(label)).
        append($('<dd></dd>').append(proginfo.dom).append(proginfo.tasks_dom));
      
      this.dom.append(proginfo.dom_outer);
    }
    proginfo.refs ++;
  };
  this.onCloseConnection = function(id) {
    this.sortContributors();
    var proginfo = this.contributors[this.label_by_id[id]];
    proginfo.refs --;
    if (proginfo.refs == 0) {
      var tasks_dom = proginfo.tasks_dom;
      tasks_dom.css("display", "none");
      proginfo._set_height = 0;
    }
  };
  this.onTaskAccepted = function(task) {
    task._progress = new ProgressInfo({ thin: true });
    task._progress.reset(512);
    var tasks_dom = this.contributors[this.label_by_id[task.assigned_to]].tasks_dom;
    tasks_dom[0].appendChild(task._progress.dom[0]);
    this.rescaleTaskListHeight(task.assigned_to);
  };
  this.onTaskProgressed = function(task) {
    task._progress.update(Math.floor(task.progress * 512));
  };
  this.onTaskCompleted = function(task) {
    var node = task._progress.dom[0];
    node.parentNode.removeChild(node);
    this.rescaleTaskListHeight(task.assigned_to);
    delete task._progress;
    
    this.main_progress.increment();
    this.contributors[this.label_by_id[task.assigned_to]].increment();
  };
  this.onTaskAborted = function(task) {
    var node = task._progress.dom[0];
    node.parentNode.removeChild(node);
    this.rescaleTaskListHeight(task.assigned_to);
    delete task._progress;
  };
}