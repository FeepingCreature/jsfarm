'use strict';

function setupStar(editor, file) {
  var fn = function() {
    if (editor.isClean(file.undostate)) file.editstar.css('visibility', 'hidden');
    else file.editstar.css('visibility', 'visible');
  };
  file.checkStar = fn;
  editor.on('change', fn);
}

/** @constructor */
function EditorUi(jq) {
  this.files = [];
  this.addEditors = function(newfiles) {
    var editors_dom = jq.find('#editors_content');
    for (var i = 0; i < newfiles.length; ++i) {
      var newfile = newfiles[i];
      var div = $('<div class="tab-pane"></div>');
      var area = $('<textarea></textarea>');
      div.append(area);
      
      area.val(newfile.src);
      
      var position = newfile.position || editors_dom.children().length;
      var marker = editors_dom.children().eq(position - 1);
      if (marker.length) marker.after(div);
      else editors_dom.append(div);
      
      newfile.container = div;
    }
  };
  this.rebuildEditors = function(newfiles) {
    var editors_dom = jq.find('#editors_content');
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
      if (!file.hasOwnProperty('editor')) continue; // uninitialized
      if (!file.editor.isClean(file.undostate)) return false;
    }
    return true;
  };
  this.markClean = function() {
    for (var i = 0; i < this.files.length; ++i) {
      var file = this.files[i];
      if (file.hasOwnProperty('editor')) {
        file.undostate = file.editor.changeGeneration(true);
        file.checkStar();
      }
    }
  };
  this.addRiders = function(newfiles) {
    var self = this;
    var riders = jq.find('#riders');
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
      var editstar = $('<span style="visibility:hidden;">*</span>');
      
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
        if (!file.hasOwnProperty('editor')) {
          var area = file.container.find('textarea')[0];
          file.editor = CodeMirror.fromTextArea(area, getEditorCfg(jq));
          setupStar(file.editor, file);
          setTimeout(function(file) {
            return function() {
              file.editor.refresh();
            };
          }(file), 0);
        }
      } else {
        file.container.hide();
        file.rider.removeClass('active');
      }
    }
  };
  this.rebuildRiders = function(newfiles) {
    var riders = jq.find('#riders');
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
    var self = this;
    setTimeout(function() { self.showFile(null); }, 0);
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

function getFullSrc(editor) {
  // read back
  var src = "";
  for (var i = 0; i < editor.files.length; ++i) {
    var file = editor.files[i];
    src += file.currentSource();
  }
  return src;
}

function getFiles(editor) {
  var src = getFullSrc(editor);
  // rebuild/reassign line numbers and contents
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
        if (file.editor.getValue() != file.src) {
          // TODO does this actually ever happen??
          file.editor.setValue(file.src);
        }
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
}

function setEditorErrorAt(editor, loc1, loc2, text) {
  var i = null;
  for (i = 0; i < editor.files.length; ++i) {
    editor.files[i].clear();
  }
  
  for (i = 0; i < editor.files.length; ++i) {
    var file = editor.files[i];
    if (file.rowbase > loc1.row) break;
  }
  
  if (i == 0) { return; } // throw "internal messup";
  
  var err_file = editor.files[i-1]; // "last" file in which the error could lie
  
  loc1.row -= err_file.rowbase;
  loc2.row -= err_file.rowbase;
  
  editor.showFile(err_file.name);
  
  var cm_editor = err_file.editor;
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
  
  
  // thanks http://codemirror.977696.n3.nabble.com/Scroll-to-line-td4028275.html
  var h = cm_editor.getScrollInfo().clientHeight;
  var coords = cm_editor.charCoords({line: loc1.row, ch: loc1.column}, "local");
  cm_editor.scrollTo(null, (coords.top + coords.bottom - h) / 2);
};
