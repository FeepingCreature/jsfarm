'use strict';

/** @constructor */
function EditorUi() {
  this.files = [];
  this.addEditors = function(newfiles) {
    var editors_dom = $('#editors_content');
    for (var i = 0; i < newfiles.length; ++i) {
      var newfile = newfiles[i];
      var div = $('<div class="tab-pane"></div>');
      var area = $('<textarea></textarea>');
      div.append(area);
      
      var position = newfile.position || editors_dom.children().length;
      var marker = editors_dom.children().eq(position - 1);
      if (marker.length) marker.after(div);
      else editors_dom.append(div);
      
      var editor = CodeMirror.fromTextArea(area[0], editor_cfg);
      editor.setValue(newfile.src);
      editor.clearHistory();
      editor.markClean();
      
      newfile.checkStar = function(editor, newfile) {
        return function() {
          if (editor.isClean(newfile.undostate)) newfile.editstar.css('visibility', 'hidden');
          else newfile.editstar.css('visibility', 'visible');
        };
      }(editor, newfile);
      editor.on('change', newfile.checkStar);
      
      newfile.editor = editor;
      newfile.container = div;
    }
  };
  this.rebuildEditors = function(newfiles) {
    var editors_dom = $('#editors_content');
    editors_dom.empty();
    this.addEditors(newfiles);
  };
  this.removeEditors = function(rmfiles) {
    for (var i = 0; i < rmfiles.length; ++i) {
      rmfiles[i].container.remove();
    }
  };
  this.allClean = function() {
    for (var i = 0; i < this.files.length; ++i) {
      var file = this.files[i];
      if (!file.editor.isClean(file.undostate)) return false;
    }
    return true;
  };
  this.markClean = function() {
    for (var i = 0; i < this.files.length; ++i) {
      var file = this.files[i];
      file.undostate = file.editor.changeGeneration(true);
      file.checkStar();
    }
  };
  this.addRiders = function(newfiles) {
    var self = this;
    var riders = $('#riders');
    for (var i = 0; i < newfiles.length; ++i) {
      var newfile = newfiles[i];
      var li = $('<li role="presentation"></li>');
      var a = $('<a class="ajaxLink"></a>');
      var name = newfile.name;
      var tn = null;
      if (newfile.name == null) {
        tn = document.createTextNode('main');
        tn = $('<i></i>').append(tn);
      } else {
        tn = document.createTextNode(newfile.name);
      }
      var editstar = $('<span style="visibility:hidden;">*</span>');;
      
      a.append(tn);
      a.append(editstar);
      
      li.append(a);
      li.on('click', function(name) { return function() { self.showFile(name); }; }(newfile.name));
      
      newfile.editstar = editstar;
      newfile.rider = li;
      
      var position = newfile.position || riders.children().length;
      var marker = riders.children().eq(position - 1);
      if (marker.length) marker.after(li);
      else riders.append(li);
    }
  };
  this.showFile = function(name) {
    for (var i = 0; i < this.files.length; ++i) {
      var file = this.files[i];
      if (file.name == name) {
        file.container.css('display', 'inline-block');
        file.rider.addClass('active');
        file.editor.refresh();
      } else {
        file.container.hide();
        file.rider.removeClass('active');
      }
    }
  };
  this.rebuildRiders = function(newfiles) {
    var riders = $('#riders');
    riders.empty();
    this.addRiders(newfiles);
  };
  this.removeRiders = function(rmfiles) {
    for (var i = 0; i < rmfiles.length; ++i) {
      rmfiles[i].rider.remove();
    }
  };
  this.rebuildFileUi = function(newfiles) {
    this.rebuildEditors(newfiles);
    this.rebuildRiders(newfiles);
    this.showFile(null);
  };
  this.removeFromUi = function(rmfiles) {
    this.removeEditors(rmfiles);
    this.removeRiders(rmfiles);
  };
  this.addToUi = function(newfiles) {
    this.addEditors(newfiles);
    this.addRiders(newfiles);
  };
}

var editor = new EditorUi;
window.editor = editor;

window.getFullSrc = function() {
  // read back
  // TODO move to files.js
  var src = "";
  for (var i = 0; i < editor.files.length; ++i) {
    var file = editor.files[i];
    src += file.editor.getValue();
  }
  return src;
};

window.getFiles = function() {
  var src = window.getFullSrc();
  // rebuild/reassign line numbers and contents
  // TODO move into editor
  var files = editor.files;
  var newfiles = splitSrc(src);
  for (var i = 0; i < files.length; ++i) files[i].assigned = false;
  
  var toAdd = [], toRemove = [];
  
  var targetlist = [];
  
  for (var i = 0; i < newfiles.length; ++i) {
    var newfile = newfiles[i];
    var file = null;
    for (var k = 0; k < files.length; ++k) {
      if (files[k].name == newfile.name) {
        file = files[k];
        file.assigned = true;
        break;
      }
    }
    if (!file) {
      newfile.position = i;
      toAdd.push(newfile);
      targetlist.push(newfile);
    } else {
      var editor_changed = file.src != newfile.src;
      if (editor_changed) {
        file.src = newfile.src;
        file.editor.setValue(file.src);
      }
      file.rowbase = newfile.rowbase;
      targetlist.push(file);
    }
  }
  
  for (var i = 0; i < files.length; ++i) {
    if (!files[i].assigned) toRemove.push(files[i]);
  }
  
  editor.removeFromUi(toRemove);
  editor.addToUi(toAdd);
  editor.files = targetlist;
  
  return targetlist;
};

window.setErrorAt = function(loc1, loc2, text) {
  var i = null;
  var editor = window.editor;
  for (i = 0; i < editor.files.length; ++i) {
    editor.files[i].clear();
  }
  
  for (i = 0; i < editor.files.length; ++i) {
    var file = editor.files[i];
    if (file.rowbase > loc1.row) break;
  }
  
  if (i == 0) { return; } // throw "internal messup";
  
  var err_file = editor.files[i-1]; // "last" file in which the error could lie
  
  var cm_editor = err_file.editor;
  loc1.row -= err_file.rowbase;
  loc2.row -= err_file.rowbase;
  
  var mark = cm_editor.markText(
    {line: loc1.row, ch: loc1.column},
    {line: loc2.row, ch: loc2.column},
    {className: "error-marker"}
  );
  
  err_file.clear = function() {
    mark.clear();
    cm_editor.clearGutter("error-gutter");
    err_file.clear = function(){};
  };
  
  var marker = $('<div class="error-icon"></div>');
  marker.attr('title', text);
  marker.tooltip({ container: 'body' });
  
  cm_editor.setGutterMarker(loc1.row, "error-gutter", marker[0]);
  
  editor.showFile(err_file.name);
  
  // thanks http://codemirror.977696.n3.nabble.com/Scroll-to-line-td4028275.html
  var h = cm_editor.getScrollInfo().clientHeight;
  var coords = cm_editor.charCoords({line: loc1.row, ch: loc1.column}, "local");
  cm_editor.scrollTo(null, (coords.top + coords.bottom - h) / 2);
};
