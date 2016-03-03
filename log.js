'use strict';

// shared helper
function logJq(jq) {
  if (typeof window !== 'undefined') {
    var console = $('#console');
    console.append(jq);
    console.scrollTop(1<<30);
  }
}

// opt-in to raw html logging
function logHtml() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  logJq('&gt; '+msg+'<br>');
}

var LogStart = time();

function log() {
  var msg = Array.prototype.slice.call(arguments).join(" ");
  var div = $('<div></div>');
  // var t = time();
  // div.append(((t - LogStart)/1000.0)+": ");
  div.append(document.createTextNode('> '+msg)).append('<br>');
  logJq(div);
}
