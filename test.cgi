#!/bin/sh
set -e
DFL_TARGET="$SERVER_NAME:$SERVER_PORT/jsfarm"
echo Content-Type: text/html
echo ""
cat <<'EOT'
<!DOCTYPE html>
<html>
<head>
<title>canvas tests</title>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1"><!-- Latest compiled and minified CSS -->

<link rel="stylesheet" href="css/bootstrap.min.css">
<!-- Optional theme -->
EOT
THEME="css/bootstrap-theme.min.css"
CMTHEME="neat"
if [ "$QUERY_STRING" = "dark" ]
then
  THEME="css/bootstrap-cyborg.min.css"
  CMTHEME="lesser-dark"
fi
echo "<link rel=\"stylesheet\" href=\"$THEME\">"
echo "<link rel=\"stylesheet\" href=\"css/$CMTHEME.css\">"
cat <<'EOT'
<link rel="stylesheet" href="css/site.css">
<link rel="stylesheet" href="addon/lint/lint.css">

<script src="jquery.min.js"></script> 
<!-- Latest compiled and minified JavaScript -->
<script src="bootstrap.min.js"></script>

<script src="jquery.color-2.1.0.min.js"></script>

<script src="lib/codemirror.js"></script>
<link rel="stylesheet" href="lib/codemirror.css">
<script src="mode/scheme/scheme.js"></script>
<script src="addon/selection/mark-selection.js"></script>

<script src="imgur_canvas.js"></script>

<script src="peer.js"></script>
<script src="compile.js"></script>
<script src="files.js"></script>
<script src="main.js"></script>
<script src="networking.js"></script>

</head>
<body>

<div class="container">

<div class="panel panel-primary">
  <div class="panel-body small-panel">
    <a href="#" title="Settings" onclick="$('#settings').toggle()"><span class="glyphicon glyphicon-cog" aria-hidden="true"></span></a>
    Background Processing
    &bull;
    <div class="panel panel-primary status-panel no-margin"><div class="panel-body smaller-panel" id="StatusPanel">Status: not running</div></div>
    <div id="WorkerInfo" class="starts-hidden">
    &bull;
    <div class="workerlist">
    </div>
    </div>
    &bull;
    <button type="button" id="StartButton" onclick="Start();">Start</button>
    <button type="button" id="StopButton" onclick="Stop();" class="starts-hidden">Stop</button>
    <div id="settings" class="starts-hidden">
      <hr class="sane">
      <div class="panel panel-primary no-margin">
        <div class="panel-body small-panel">
          <label for="target" title="Address of the discovery server (PeerServer)">Server</label>
EOT
cat <<EOT
          <input type="text" id="target" name="target" size="25" value="$DFL_TARGET" oninput="CheckTarget();">
EOT
cat <<'EOT'
          <label for="threads" title="Number of background threads. Default: 2">Threads</label>
          <input type="text" size="1" id="threads" name="threads" value="2">
          <label for="ident" title="Identifier for your computer in statistics. Default: connection id.">Name</label>
          <input type="text" size="10" id="ident" name="ident" value="">
          <label for="width" title="Width of the rendered image. Please be considerate.">Width</label>
          <input type="text" size="6" id="width" name="width" value="512">
          <label for="height" title="Height of the rendered image. Please be considerate.">Height</label>
          <input type="text" size="6" id="height" name="height" value="512">
        </div>
      </div>
    </div>
  </div>
</div>

<!-- :sigh: -->
<table><tr><td style="vertical-align:top;width:100%;height:100%;">

<div id="editors">
<ul id="riders" class="nav nav-tabs">
</ul>
<span id="editors_content" class="tab-content">
EOT
# make sure we start without an empty newline
echo -n '<textarea id="editor">'
cat scene.s2
cat <<'EOT'
</textarea>
</span>
</div>

</td>
<td>

<div id="canvas-frame">
<canvas id="canvas" width="512" height="512" style="border: 1px solid; width: 512px; height: 512px;"></canvas>
</div>

</td></tr></table>

<script>
  setupCanvasUpload($('#canvas'));
  var editor_cfg = {
    lineNumbers: true,
    mode: "scheme",
    gutters: ["error-gutter"],
EOT
echo "    theme: \"$CMTHEME\""
cat <<'EOT'
  };
  var original_src = $('#editor')[0].value;
  
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
    this.addRiders = function(newfiles) {
      var self = this;
      var riders = $('#riders');
      for (var i = 0; i < newfiles.length; ++i) {
        var newfile = newfiles[i];
        var li = $('<li role="presentation"></li>');
        var a = $('<a href="#"></a>');
        var name = newfile.name;
        var tn = null;
        if (newfile.name == null) {
          tn = document.createTextNode('main');
          tn = $('<i></i>').append(tn);
        } else {
          tn = document.createTextNode(newfile.name);
        }
        a.append(tn);
        li.append(a);
        li.on('click', function(name) { return function() { self.showFile(name); }; }(newfile.name));
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
  
  editor.files = splitSrc(original_src);
  editor.rebuildFileUi(editor.files);
  
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
        file.src = newfile.src;
        file.editor.setValue(file.src);
        file.rowbase = newfile.rowbase;
        targetlist.push(file);
      }
    }
    
    for (var i = 0; i < files.length; ++i) {
      if (!files[i].assigned) toRemove.push(files[i]);
    }
    
    /*
    var toRemoveNames = [], toAddNames = [];
    for (var i = 0; i < toRemove.length; ++i) toRemoveNames.push(toRemove[i].name);
    for (var i = 0; i < toAdd.length; ++i) toAddNames.push(toAdd[i].name);
    log("toRemove", JSON.stringify(toRemoveNames));
    log("toAdd", JSON.stringify(toAddNames));
    */
    
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
    
    if (i == 0) throw "internal messup";
    
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
</script>
<hr>
<button type="button" id="RunButton" onclick="run()">Run</button>
<script>
  $(function() {
    $("#RunButton").click();
  });
</script>
<hr>
<p>Console</p>
<div style="clear:both;"></div>
<div style="border:1px solid; min-height: 10pt;" id="console">
</div>
</div>
</body>
</html>
EOT
