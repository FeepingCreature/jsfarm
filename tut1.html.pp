<!DOCTYPE html>
<html>
<head>
<title>canvas tests</title>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">

<script src="js/all.min.js"></script> 
<script>css_default_after.push('css/tutorial.css');</script>
<script src="js/main.min.js"></script>

<link rel='icon' href='data:;base64,iVBORw0KGgo='>

</head>
<body>

<div class="container">

<h2>jsfarm tutorial</h2>

<hr>

<p>Bla Bla Bla Bla Bla!
</p>

#include "util.h"
#define WIDTH 400
#define HEIGHT 300

#define IDENT ui1

<textarea id=XSTR(IDENT)>
(require util nothing)

(lambda ()
  (let
    (scene (nothing))
    (render scene)))
#include "raytracer.rl.h"
</textarea>

#include "renderer.html.h"

<hr>

<p>
Bla bla blah.
</p>

#undef IDENT
#define IDENT ui2

<textarea id=XSTR(IDENT)>
(require
 util group boundgroup color
 sphere plane nothing perlin
 pathtrace csg box cylinder
 bound matrix)

(lambda ()
  (let
    (scene (group
      (color (blend blue white 0.8) (plane +Y -Y))
      (shine white (color black (plane -Y (* 10 +Y))))))
    (render scene)))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"


#include "themeswitch.html.h"

</div>

</body>
</html>
