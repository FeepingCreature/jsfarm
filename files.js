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
          throw ("duplicate file name '"+filename+"'");
        }
      }
      files.push({name: filename, src: src, rowbase: rowbase, clear: function(){}});
    } else if (part.length) {
      src = part;
      files.push({name: null, src: src, rowbase: rowbase, clear: function(){}});
    }
    if (src) rowbase += src.split("\n").length;
  }
  return files;
};
