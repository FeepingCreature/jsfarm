<!DOCTYPE html>
<html>
<head>

#include "util.h"
#define WIDTH 400
#define HEIGHT 300
#define SAVE_TEXT Open in IDE

<title>tutorial 1</title>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">

<script src="js/all.min.js"></script> 
<script>css_default_after.push('css/tutorial.css');</script>
<script src="js/main.min.js"></script>
<script>
$(window).on('save_succeeded', function() {
  // window.open("."+window.location.hash);
  // redirect instead of popup
  window.location.href = "."+window.location.hash;
});
</script>

<link rel='icon' href='data:;base64,iVBORw0KGgo='>

</head>
<body>

#define ACTIVE_PAGE 1
#include "titlebar.html.h"

<div class="container">

<h2>jsfarm tutorial</h2>

<hr>

<dl><dd>
What's the simplest possible scene?
</dd><dt>
An empty expanse, filled with nothingness. Let's define it.
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(nothing)</pre>
Note that <i>nothing</i> is an entirely valid scene object; it has no volume and
never reflects any rays. It is used as the default state for things like groups.
</div>

#define IDENT ui1

<textarea id=XSTR(IDENT)>
(require util nothing)

(lambda ()
  (let
    ((scene (nothing)))
    (render scene)))
#include "raytracer.rl.h"
</textarea>

#include "renderer.html.h"

<hr>

<dl><dd>
Well that looks boring.
</dd><dt>
Okay, let's add a plane.
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(plane normal base)</pre>
The <i>plane</i> object takes two parameters: a <i>normal</i>
and a <i>base</i>. The <i>base</i> is simply any point that lies on the plane;
the <i>normal</i> is a vector that points <b>away</b> from the plane.
Note that "plane" is a misnomer; it's actually a halfspace.

In this case, the plane has a normal of "positive Y" and is located at "&lt;0 -1 0&gt;".
</div>

#undef IDENT
#define IDENT ui2

<textarea id=XSTR(IDENT)>
(require util nothing plane)

(lambda ()
  (let
    ((scene (plane +Y -Y)))
    (render scene)))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<hr>

<dl><dd>
It still looks boring! I do not understand!
</dd><dt>
We added a plane, but the plane is not illuminated by anything.
We need to add a light source to the scene.
As opposed to a traditional raytracer, a light source is any object that emits
light of its own. It does not have to be a point source.

We'll use a downwards-facing white plane as our sky.

So we want to add a second object.

This means we have to define a <i>group</i>.

When we add our second plane, we have to make sure it emits light using the
<i>shine</i> modifier.

We will also use <i>color</i> to set the reflective color to black, to make sure
we only emit light.
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(group ...)</pre>
<i>Groups</i> combine multiple objects into one! For every point, the visible
object is simply the one that's closest to the camera.
</div>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(color rgb object)
(shine rgb object)</pre>
The <i>shine</i> function changes the emitted color of an object.
The <i>color</i> function changes the diffuse color of an object.
</div>

#undef IDENT
#define IDENT ui3
<textarea id=XSTR(IDENT)>
(require util nothing plane group color)

(lambda ()
  (let
    ((scene (group
       (plane +Y -Y)
       (color black (shine white (plane -Y (* 100 Y)))))))
    (render scene)))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<hr>

<dl><dd>
Hm, we've defined two planes but only one of them is visible.
</dd><dt>
That's correct. Only one of them emits light.
</dt><dd>
But! I wanted one of them to be illuminated by the other!
</dd><dt>
Indeed. What we require is <b>indirect illumination</b>.
So we're gonna take our existing scene and wrap it in the <i>pathtrace</i>
function.
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(pathtrace num-bounces scene)</pre>
<i>pathtrace</i> computes indirect illumination.
Whenever a ray hits an object, it casts a random sampling ray onwards,
to estimate the light that the object receives.
This randomness is the main cause of noisy images in path tracing.
</div>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(fuzz object)</pre>
<i>fuzz</i> slightly jiggles the direction of the ray being traced.
The result is anti-aliasing "for free".
</div>

#undef IDENT
#define IDENT ui4
<textarea id=XSTR(IDENT)>
(require util nothing plane group color pathtrace)

(lambda ()
  (let
    ((scene (group
       (plane +Y -Y)
       (color black (shine white (plane -Y (* 100 Y))))))
     (scene' (fuzz (pathtrace 10 scene))))
    (render scene')))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<hr>

<dl><dd>
Somehow I expected more.
</dd><dt>
The default material of the floor is a perfect diffuse reflector. The ceiling is white;
consequentially, the floor is also white.
Let's make this scene more interesting by putting a sphere on the ground.
Note that the origin is at &lt;0 0 0&gt;; to be visible, an object has to be
somewhere in +Z.
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(sphere center radius)</pre>
This one should be self-explanatory.
</div>

#undef IDENT
#define IDENT ui5
<textarea id=XSTR(IDENT)>
(require util nothing plane group color sphere pathtrace)

(lambda ()
  (let
    ((scene
      (group
       (plane +Y -Y)
       (sphere (vec3f 0 0 5) 1)
       (color black (shine white (plane -Y (* 100 Y))))))
     (scene' (fuzz (pathtrace 10 scene))))
    (render scene')))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<dl><dd>
Huh. Shouldn't it be uniform white again? The sphere is also a perfect diffuse reflector.
</dd><dt>
Indeed. Well observed! However, since the sphere touches the plane, it's easy for a
ray to get "stuck" underneath it, especially since we only set ten bounces.
Try to increase the number of bounces to 100.
</dt></dl>

<hr>

<dl><dd>
This scene still looks boring.
</dd><dt>
What, one uniformly white sphere not good enough for you??
Fine, whatever, have a box.
</dt><dd>
I just-
</dd><dt>
Have ten boxes!! And ten cylinders!!!
</dt></dl>

#undef IDENT
#define IDENT ui6
<textarea id=XSTR(IDENT)>
(require util nothing plane group color sphere pathtrace
         box boundgroup cylinder)

(lambda ()
  (let
    ((scene
      (group
       (plane +Y -Y)
       (sphere (vec3f 0 0 5) 1)
       (for/group
        i 0 10
        (color
         (vec3f (rand) (rand) (rand))
         (group
          (box (vec3f -2 -1 (+ i 2)) (vec3f -1.5 -0.5 (+ i 2.5)))
          (cylinder (vec3f 2 -1 (+ i 2)) (vec3f 2 -0.5 (+ i 2)) 0.5))))
       (color black (shine white (plane -Y (* 100 Y))))))
     (scene' (fuzz (pathtrace 10 scene))))
    (render scene')))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(rand)</pre>
Returns a random number between 0 and 1.
</div>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(cylinder from to radius)</pre>
A capped cylinder between <i>from</i> and <i>to</i> with radius <i>radius</i>.
</div>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(for/group variable from to body)</pre>
A for-loop, where every pass through the loop (for <i>variable</i> from <i>from</i>
to <i>to - 1</i>) is expected to produce one object. The objects are combined into a group.
</div>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(box from to)</pre>
An axis-aligned box with one corner at <i>from</i> and the other at <i>to</i>.
</div>

<dl><dd>
Okay, okay, you can make boxes and cylinders. I'm very impressed with your boxes and cylinders.
</dd><dt>
You better be.
</dt><dd>
Out of interest, how many boxes can you make per scene?
</dd><dt>
32509.
</dt><dd>
That's an oddly specific number.
</dd><dt>
Six planes for each side of the box, makes 408 bytes.
Five intersections for the planes, 540 bytes.
And one bounding box, 68 bytes. In sum, 1016 bytes.
There's 32MB allocated per thread. Minus 512KB
reserved for the stack, and divided by 1016, that's 32509 boxes.
Honestly, 1016 bytes is kind of depressing. Maybe you can rewrite the raytracer to be more efficient. :)
</dt><dd>
Rewrite the raytracer?
</dd><dt>
Try and click on the tabs - you have complete access to the raytracer's source right here in your browser.
You can change it in any fashion you want.
</dt></dl>

<hr>

<dl><dd>
Hm. This looks cool but maybe it'd look even cooler if I could see it from above and the left.
</dd><dt>
Why I have just the thing for that!
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(camera position lookat scene)</pre>
Normally, there is an implicit camera positioned at &lt;0 0 0&gt; and looking towards +Z, with "up" being +Y and "right" being +X.
Using the <i>camera</i> function will transform the scene to position the camera at <i>position</i> and looking towards <i>lookat</i>.
</div>

#undef IDENT
#define IDENT ui7
<textarea id=XSTR(IDENT)>
(require util nothing plane group color sphere pathtrace
         box boundgroup cylinder camera)

(lambda ()
  (let
    ((the-floor (plane +Y -Y))
     (the-sky (color black (shine white (plane -Y (* 100 Y)))))
     (the-sphere (sphere (vec3f 0 0 5) 1))
     (the-stuff (for/group
        i 0 10
        (color
         (vec3f (rand) (rand) (rand))
         (group
          (box (vec3f -2 -1 (+ i 2)) (vec3f -1.5 -0.5 (+ i 2.5)))
          (cylinder (vec3f 2 -1 (+ i 2)) (vec3f 2 -0.5 (+ i 2)) 0.5)))))
     (scene
      (group
       the-floor
       the-sky
       the-sphere
       the-stuff))
     (scene' (fuzz (pathtrace 10 scene)))
     (scene'' (camera (vec3f -3 2 0) (vec3f 0 0 5) scene')))
    (render scene'')))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<hr>

<dl><dd>
This is neat, but the sphere in the middle is in the way of my view.
Can we sink it into the ground? Like, bore a hole right down the middle and put it in there?
</dd><dt>
<p>
Now we get into the realm of
&quot;<a href="https://en.wikipedia.org/wiki/Constructive_solid_geometry">Constructive Solid Geometry</a>&quot; (CSG).</p>
<p>This might get a bit complicated. We highly recommend that you go off and read that Wikipedia page if you are not yet familiar with CSG.</p>
<p>Fundamentally speaking, <span title="What's the problem?">CSG is just the application of set theory to solid bodies</span>.
In other words, what we have considered a <b>plane</b> is in reality a half-space,
a dividing surface above which is air and below which is solidity. Similarly, a
<b>sphere</b> is just the set of all points within its radius.</p>
<p><b>It is important to understand</b> that there is a difference between a sphere
and an "anti-sphere" (a <i>negate</i>d sphere) - a sphere is an object surrounded by a lot of nothing,
an <b>anti-sphere</b> is a bubble of nothing, surrounded by a lot of stuff.</p>
<p>This will require an example. To illustrate, let's take the <b>intersection</b> between our sphere and a box.</p>
</dt></dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(intersect objects...)</pre>
The <i>intersect</i> object is an object formed by the intersection of its parameters.
At each point on its surface, the innermost object is visible.
</div>

#undef IDENT
#define IDENT ui8
<textarea id=XSTR(IDENT)>
(require util nothing plane group color sphere pathtrace
         box boundgroup cylinder camera csg)

(lambda ()
  (let
    ((the-floor (plane +Y -Y))
     (the-sky (color black (shine white (plane -Y (* 100 Y)))))
     (the-sphere-center (vec3f 0 0 5))
     (the-sphere (sphere the-sphere-center 1))
     (the-box (box (- the-sphere-center 0.66) (+ the-sphere-center 0.66)))
     (the-stuff
      (for/group
       i 0 10
       (color
        (vec3f (rand) (rand) (rand))
        (group
         (box (vec3f -2 -1 (+ i 2)) (vec3f -1.5 -0.5 (+ i 2.5)))
         (cylinder (vec3f 2 -1 (+ i 2)) (vec3f 2 -0.5 (+ i 2)) 0.5)))))
     (scene
      (group
       the-floor
       the-sky
       (intersect
        (color red the-sphere)
        (color green the-box))
       the-stuff))
     (scene' (fuzz (pathtrace 10 scene)))
     (scene'' (camera (vec3f -3 2 0) (vec3f 0 0 5) scene')))
    (render scene'')))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<hr>

<dl><dd>
<p>I see. So the combination of box and sphere means that the corners of our box have been filed off.</p>
<p>... Wait. I don't see.</p>
</dd><dt>
<p>It's straightforward. Fundamentally, an <i>intersect</i> object is comprised of only those parts of either object that are <b>inside the other object</b>.</p>
<p>The edge length of the box is a bit larger than the diameter of the sphere.
So towards the sides of the box, where it was smaller than the sphere, only the box is visible, since it's inside of the sphere.
However, since the sphere is round, it's smaller at the corners than the box, so at those spots it's inside of the box. So only the sphere is visible.</p>
<p>Now, how can we use this to cut out a hole in the ground?</p>
<p>Simple: we form the intersect between the floor and a <b>negated cylinder</b>.</p>
<p>With a normal cylinder, we'd get all the parts of the floor that are inside the cylinder;
with a negated one, we'll get an object comprised of all the parts of the floor that are <b>outside</b> the cylinder.</p>
<p>Essentially, the cylinder will be missing from the floor.</p>
<p>Also, we lower our central sphere-box-thing into the hole we just created, neatly hiding it from view.</p>
</dt>
</dl>

<div class="panel infofield">
#include "infomarker.html.h"
<pre>(negate object)</pre>
The <i>negate</i> object is identical to its parameter object, except that the parameter object's
inside becomes its outside and its inside becomes its outside.
It essentially turns the object inside-out.
</div>

#undef IDENT
#define IDENT ui9
<textarea id=XSTR(IDENT)>
(require util nothing plane group color sphere pathtrace
         box boundgroup cylinder camera csg)

(lambda ()
  (let
    ((the-floor (plane +Y -Y))
     (the-sky (color black (shine white (plane -Y (* 100 Y)))))
     (the-sphere-center (vec3f 0 -1 5))
     (the-sphere (sphere the-sphere-center 1))
     (the-box (box (- the-sphere-center 0.66) (+ the-sphere-center 0.66)))
     (the-weird-box-sphere-thing
      (intersect
       (color red the-sphere)
       (color green the-box)))
     (the-floor'
      (intersect
       the-floor
       (negate (cylinder (vec3f 0 1 5) (vec3f 0 -2 5) 1.3))))
     (the-stuff
      (for/group
       i 0 10
       (color
        (vec3f (rand) (rand) (rand))
        (group
         (box (vec3f -2 -1 (+ i 2)) (vec3f -1.5 -0.5 (+ i 2.5)))
         (cylinder (vec3f 2 -1 (+ i 2)) (vec3f 2 -0.5 (+ i 2)) 0.5)))))
     
     (scene
      (group
       the-floor'
       the-sky
       the-weird-box-sphere-thing
       the-stuff))
     (scene' (fuzz (pathtrace 10 scene)))
     (scene'' (camera (vec3f -3 2 0) (vec3f 0 0 5) scene')))
    (render scene'')))
#include "raytracer.rl.h"
</textarea>
#include "renderer.html.h"

<hr>

<dl><dd>
I think I get the idea.
</dd><dt>
Cheers! Now go forth and render pretty pictures.
</dt></dl>

#include "themeswitch.html.h"

</div>

</body>
</html>
