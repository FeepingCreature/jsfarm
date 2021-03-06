'use strict';

/** @constructor */
function FarmFileEntry(filename, src, rowbase) {
  this.name = filename;
  this.src = src;
  this.rowbase = rowbase;
  this.clear = function() { };
  this.currentSource = function() {
    if (this.hasOwnProperty('editor')) {
      return this.editor.getValue();
    } else {
      return this.src; // editor not loaded (uninitialized tab)
    }
  };
}

function splitSrc(src) {
  var files = [];
  
  var rowbase = 0;
  
  var file_marker = "; @file ";
  
  var src_parts = src.split(file_marker);
  for (var i = 0; i < src_parts.length; ++i) {
    var part = src_parts[i];
    var src = null;
    if (i) {
      var filename_end = part.search("\n");
      if (filename_end == -1) throw "invalid file split syntax";
      var filename = part.slice(0, filename_end);
      
      // var src = part.slice(filename_end + 1);
      src = file_marker + part;
      
      for (var i = 0; i < files.length; ++i) {
        if (files[i].name == filename) {
          var loc1 = {row: rowbase, col: 0};
          var loc2 = {row: rowbase, col: filename_end};
          window.setErrorAt(loc1, loc2, "duplicate file name '"+filename+"'");
          // throw ("duplicate file name '"+filename+"'");
        }
      }
      files.push(new FarmFileEntry(filename, src, rowbase));
    } else if (part.length) {
      src = part;
      files.push(new FarmFileEntry(null, src, rowbase));
    }
    if (src) rowbase += src.split("\n").length;
  }
  return files;
};
if (typeof window !== "undefined") window["splitSrc"] = splitSrc;
