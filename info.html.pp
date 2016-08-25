<!DOCTYPE html>
<html>
<head>

<title>info page</title>

<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">

<script src="js/all.min.js"></script> 
<script src="js/main.min.js"></script>

<link rel='icon' href='data:;base64,iVBORw0KGgo='>

</head>
<body>

#define ACTIVE_PAGE 0
#include "titlebar.html.h"

<div class="container">

<h2>JSFarm is a P2P distributed raytracer that runs in your browser.</h2>

<p>The project is inspired by PoVRay; scenes are written in a Lisp dialect and rendering is distributed over computers connected to the network.</p>

<p><b>If you want to jump right in, <a href="tut1.html">the best place to start is this tutorial.</a></b></p>

<p>Also, there's <a href="#examples">a bunch of examples below.</a></p>

<p>Otherwise, have some text.</p>

<h3>So what's up with this project?</h3>
<p>
It started with the desire to write a raytracer like the ones I used as a kid. Something not focused on photorealistic graphics, or movie production, or hyperrealistic skin subsurface scattering or whatever,
but geometric shapes and scripted scenes. If you've ever used PoVRay, you know what I mean. But modern! Without a need to install yet another program, without having to mess with installers and permissions,
multithreaded from the start instead of bolted on, able to scale to hundreds of boxes, running at native performance of course. So why not run it in the browser, I thought? Okay, so there's actually lots
and lots of reasons why that's a bad idea.
</p>
<ul>
<li>Browsers can't do graphics!</li>
Luckily, HTML5 lets us easily draw graphics using the &lt;canvas&gt; element.
<li>Javascript is too slow for raytracing.</li>
Javascript is actually not the only language that can run in your browser! <sup>Mention Flash and I'll stab you.</sup> There's something called <a href="https://en.wikipedia.org/wiki/Asm.js">asm.js</a>, basically
similar to assembler language, but standardized and supported in all modern browsers. Performant, straightforward, safe and you can make more of it at runtime.
<li>But browsers can only talk to web servers, not each other.</li>
There's a protocol called "WebRTC", that's meant to let people use browsers for voicechat and video chat. Conveniently, it includes a data channel. Using WebRTC and a server that's only used for negotiation,
browsers can send large amounts of data to each other.
</ul>

<p>
So all the pieces were actually in place! I decided on Lisp as a scene description language, because it's incredibly easy to parse, and went to work.
A few months later, the project was basically done and I was looking forward to announcing it everywhere!
All I had to do was write some proper documentation.
</p>

<p>
So for the next four months, nothing happened. Turns out, writing documentation is <i>really</i> unrewarding? Who could have predicted this. So by the time I'd nearly finished <i>another</i> language (TBA!), I decided that if I was gonna wait for documentation to be ready, I'd never release the damn thing.
</p>

<p>
So here it is! Presenting <b>JSFarm: P2P distributed raytracing for your browser.</b> The language is completely undocumented, but things should mostly work like they do in Lisp.
There's <a href="tut1.html">a tutorial that I'd written up</a>, which introduces the basics of the scene language,
<a href="https://github.com/FeepingCreature/jsfarm/wiki/FAQ">a FAQ</a>, and
<a href="https://github.com/FeepingCreature/jsfarm/wiki/Introduction">an introduction to the user interface</a> on Github.
Click "Connect" at the top of the main page to connect to the network and start helping others compute pictures,
click "save" to save your scene to Gist. (Note that there's a rate limit of about one save a minute.) To share scenes with others, just copy the address. Poke me on Freenode in #jsfarm if you have questions.
And above all: <b>have fun rendering!</b>
</p>

<h3><a name="examples"></a>Some example scenes</h3>

<a href=".#gist=d70442a902527ad4aaf14eb93a0a94c9f910ef0e,https://gist.github.com/fb2759f7941769efce020fb792b1d09f;image=http://i.imgur.com/n6EV4MY.jpg">
  <div class="panel panel-default" style="float:left;margin-right: 12px;">
    <div class="panel-heading">Cornell box</div>
    <div class="panel-body"><img src="http://i.imgur.com/QzTtmyR.png"></div>
  </div>
</a>
<a href=".#gist=5557dce0176539ec8c65f34b22aeffcc922dc5ba,https://gist.github.com/1172c55bb9f5431cfdc04e31c645ba9b;image=http://i.imgur.com/ULNkDdP.png">
  <div class="panel panel-default" style="float:left;margin-right: 12px;">
    <div class="panel-heading">Glowsticks</div>
    <div class="panel-body"><img src="http://i.imgur.com/ULNkDdP.png"></div>
  </div>
</a>
<a href=".#gist=50a14d08edcdaf82a63be16a451d4b20d13628c5,https://gist.github.com/a6b395b487b897a0151ce6ca76b27b5c;image=http://i.imgur.com/el8rmrk.png">
  <div class="panel panel-default" style="float:left;margin-right: 12px;">
    <div class="panel-heading">Tunnel</div>
    <div class="panel-body"><img src="http://i.imgur.com/c8AZsPU.png"></div>
  </div>
</a>
<a href=".#gist=f0592a8f701b7cbf67b42973ac847c60665ad034,https://gist.github.com/0a68ef9aec817096b29271123c988102;image=http://i.imgur.com/BrX0Cl6.png">
  <div class="panel panel-default" style="float:left;margin-right: 12px;">
    <div class="panel-heading">Pavillon</div>
    <div class="panel-body"><img src="http://i.imgur.com/BrX0Cl6.png"></div>
  </div>
</a>
<a href=".#gist=34c76837bc1b842da07285d533d948efb1e3c0ec,https://gist.github.com/c8407063afd1bfcb52f30ffb0332786e;image=http://i.imgur.com/C5AfoRF.png">
  <div class="panel panel-default" style="float:left;margin-right: 12px;">
    <div class="panel-heading">Lenses (slow!)</div>
    <div class="panel-body"><img src="http://i.imgur.com/nyMKrhZ.png"></div>
  </div>
</a>

<p style="clear: both;"></p>

<script>
  LoadSettings();
</script>

#include "themeswitch.html.h"

</div>

</body>
</html>
