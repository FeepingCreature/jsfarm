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
          <label for="threads" title="Number of background threads. Default: 3">Threads</label>
          <input type="text" size="1" id="threads" name="threads" value="3">
          <label for="ident" title="Identifier for your computer in statistics. Default: connection id.">Name</label>
          <input type="text" size="10" id="ident" name="ident" value="">
        </div>
      </div>
    </div>
  </div>
</div>

<div id="canvas-frame" style="float:right;">
<canvas id="canvas" width="512" height="512" style="border: 1px solid;"></canvas>
</div>
EOT
# make sure we start without an empty newline
echo -n '<textarea id="editor">'
cat scene.s2
cat <<'EOT'
</textarea>
<script>
  setupCanvasUpload($('#canvas'));
  window.editor = CodeMirror.fromTextArea($('#editor')[0], {
    lineNumbers: true,
    mode: "scheme",
    gutters: ["error-gutter"],
EOT
echo "    theme: \"$CMTHEME\""
cat <<'EOT'
  });
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
