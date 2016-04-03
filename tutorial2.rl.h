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
