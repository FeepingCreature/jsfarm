<!DOCTYPE html>
<html>
<head>
<title>canvas tests</title>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">

<script src="js/all.min.js"></script> 
<script src="js/main.min.js"></script>

<link rel='icon' href='data:;base64,iVBORw0KGgo='>

</head>
<body>

<div class="container">

<div class="panel panel-primary">
  <div class="panel-body small-panel">
    <a class="ajaxLink" title="Settings" onclick="$('#settings').toggle()"><span class="glyphicon glyphicon-cog" aria-hidden="true"></span></a>
    <span class="heading">Background Processing &bull;</span>
    <div class="panel panel-primary status-panel no-margin"><div class="panel-body smaller-panel" id="StatusPanel">Status: not running</div></div>
    <div id="WorkerInfo" class="starts-hidden">
    <span class="heading">&bull;</span>
    <div class="workerlist">
    </div>
    </div>
    <span class="heading">&bull;</span>
    <button type="button" id="ConnectButton" onclick="Connect($('.render_ui'));">Connect</button>
    <button type="button" id="DisconnectButton" onclick="Disconnect($('.render_ui'));" class="starts-hidden">Disconnect</button>
    <span class="heading">&bull;
    <span id="HelpedInfo"></span>
    </span>
    <div id="settings" class="starts-hidden">
      <hr class="sane">
      <div class="panel panel-primary no-margin">
        <div class="panel-body small-panel">
          <label for="target" title="Address of the discovery server (PeerServer)">Server</label>
          <input type="text" id="target" name="target" size="25" value="" oninput="CheckTarget();">
          <label for="threads" title="Number of background threads you contribute to the network. Default: 2">Threads</label>
          <input type="text" size="1" id="threads" name="threads" value="2" oninput="SaveSettings()">
          <label for="ident" title="Label used for this computer. Defaults to connection id.">Label</label>
          <input type="text" size="10" id="ident" name="ident" value="" oninput="SaveSettings()">
        </div>
      </div>
    </div>
  </div>
</div>

#include "util.h"
#define WIDTH 512
#define HEIGHT 512

#define IDENT ui1
#include "default.rl.h"
#include "renderer.html.h"

<script>
  $('#target')[0].defaultValue = location.host+"/jsfarm";
  var dom = document.getElementById(XSTR(IDENT-container));
  var editor = dom.editor_ui;
  LoadSettings();
  LoadStateFromAnchor(dom);
</script>

<hr class="semisane">
<p>Console</p>
<div style="clear:both;"></div>
<div id="console">
</div>

#include "themeswitch.html.h"

</div>

<div class="modal" id="SiteLoadingModal" tabindex="-1" role="dialog">
  <div class="modal-dialog" role="document" style="padding-top: 5%;">
    <div class="modal-content">
      <div style="text-align: center;" class="modal-body">
        <h2>Page is loading.</h2>
        <h3>Please wait...</h3>
      </div>
    </div>
  </div>
</div>
</body>
</html>
