#include "prelude.rl.h"
; @file util

; last changed 2016-03-28

; ground rules
; * All ray-object tests must be total; ie. every
;   ray-object test generates a hit.
;   Hits may apply at infinity to indicate "misses";
;   this is important to detect whether ray:pos was
;   inside or outside an object (for CSG).

(def make-res
  (macro
    ()
    '(make-struct
      (emit (vec3f 0))
      (diffuse (vec3f 0))
      (reflect 0.)
      (transfer 0.)
      (ior 1.)
      (normal (vec3f 0))
      (distance 0.)
      (hit-id 1)
      (hit-side OUTSIDE))))

(def OUTSIDE 0)
(def INSIDE 1)

(def set-default-material
  (lambda (res)
    (seq
     (set res:emit (vec3f 0))
     (set res:diffuse (vec3f 1))
     (set res:reflect 0.)
     (set res:transfer 0.)
     (set res:ior 1.))))

(def object-id-counter 1)
(def get-object-id
  (lambda ()
    (let
      (res object-id-counter)
      (seq
       (set object-id-counter (+ 1 object-id-counter))
       res))))

(def make-ray
  (macro
    ()
    '(make-struct
      (pos (vec3f 0))
      (dir (vec3f 0))
      ; id of obj to skip generating hit for
      (avoid-obj-id 0)
      ; side of obj to skip generating hit for
      (avoid-obj-side INSIDE))))

(def make-ray-like
  (macro
    (srcray)
    `(make-struct
      (pos (vec3f 0))
      (dir (vec3f 0))
      (avoid-obj-id (: ,srcray avoid-obj-id))
      (avoid-obj-side (: ,srcray avoid-obj-side)))))

(def alloc-ray
  (macro
    ()
    '(alloc-struct
      (pos (vec3f 0))
      (dir (vec3f 0))
      (avoid-obj-id 0)
      (avoid-obj-side INSIDE))))

(def SceneFun
  (closure-type
   (list
    (typeof (make-ray))
    (typeof (make-res)))
   'void))

(def rewrap
  (macro
    (fn lamb)
    `(if (struct? ,fn)
       (alloc-struct
        (bound (: ,fn bound))
        (fn (type SceneFun ,lamb)))
       (alloc-struct
        (bound (make-bound (vec3f (- 0 Infinity)) (vec3f Infinity)))
        (fn (type SceneFun ,lamb))))))

; http://burtleburtle.net/bob/rand/smallprng.html
(def rand_a 0)
(def rand_b 0)
(def rand_c 0)
(def rand_d 0)

(def rand32
  (lambda ()
    (let
      (e (- rand_a (| (<< rand_b 27) (>>> rand_b 5))))
      (seq
       (set rand_a (^ rand_b (| (<< rand_c 17) (>>> rand_c 15))))
       (set rand_b (+ rand_c rand_d))
       (set rand_c (+ rand_d e))
       (set rand_d (+ e rand_a))
       (>>> rand_d 0)))))

(def rand (lambda ()
            (let
              (r (rand32))
              (s (unsigned-to-float r))
              (t (/ s (unsigned-to-float 4294967295)))
              t)))

(def rand_seed (lambda (seed)
                 (seq
                  (set rand_a 0xf1ea5eed)
                  (set rand_b (| seed 0))
                  (set rand_c (| seed 0))
                  (set rand_d (| seed 0))
                  (for i 0 20 (rand32)))))

(rand_seed 17)

(def rand-sphere
  (type (function-type '() Vec3f)
    (lambda ()
      (let
        (rand2 (lambda () (- (* (rand) 2) 1)))
        (v (vec3f (rand2) (rand2) (rand2)))
        (if (<= (length v) 1)
          v
          (rand-sphere))))))

(def rand-halfsphere
  (lambda (normal)
    (let
      (r (normalized (rand-sphere)))
      (if (< (dot normal r) 0)
        (- 0 r)
        r))))

(def halfsphere
  (lambda (normal)
    (let
      (v (normalized (rand-sphere)))
      (d (dot normal v))
      (if (< d 0) (- 0 v) v))))

(def cos-weighted-halfsphere
  (type (function-type (list Vec3f) Vec3f)
    (lambda (normal)
      (let
        (v (halfsphere normal))
        (d (dot normal v))
        (if (<= (rand) d)
          v
          (cos-weighted-halfsphere normal))))))

(def get-scenefun
  (lambda (thing)
    (seq
     (if (struct? thing)
       (: thing fn)
       thing))))

(def make-bound
  (lambda (from to)
    (alloc-struct (from from) (to to))))

(def SceneObject
  (typeof
   (alloc-struct
    (bound (make-bound (vec3f 0) (vec3f 1)))
    (fn (type SceneFun ((lambda () (lambda (ray res) (noop)))))))))

(def coords-ray-flat
  (lambda (x y)
    (let
      (dw (float dw))
      (dh (float dh))
      (ratio (/ dw dh))
      (ray (alloc-ray))
      (seq
       (inside ray false)
       (set ray:pos
            (vec3f
             0
             0
             (/ (- projscale) fov)))
       (set ray:dir
            (normalized
             (vec3f
              (* ratio fov (- (/ x (/ dw 2)) 1))
              (* fov (- 1 (/ y (/ dh 2))))
              1)))
       ray))))

(def latlon-to-dir
  (lambda (lat lon)
    (let
      (clat (cos lat))
      (vec3f (* clat (sin lon)) (sin lat) (* clat (cos lon))))))

(def coords-dir-panini
  (lambda (x y)
    (let
      (sqr (lambda (v) (* v v)))
      (d 1)
      (k (/ (sqr x) (sqr (+ d 1))))
      (dscr (- (* (sqr k) (sqr d)) (* (+ k 1) (- (* k (sqr d)) 1))))
      (sq (sqrt dscr))
      (kd (* k d))
      (clon (/ (- sq kd) (+ k 1)))
      (S (/ (+ d 1) (+ d clon)))
      (lon (atan2 x (* S clon)))
      (lat (atan2 y S))
      (latlon-to-dir lat lon))))

(def coords-ray-panini
  (lambda (x y)
    (let
      (dw (float dw))
      (dh (float dh))
      (ratio (/ dw dh))
      (ray (alloc-ray))
      (vx (- (* 2 (/ x dw)) 1)) ; -1..1
      (vy (- (* 2 (/ y dh)) 1)) ; -1..1
      (seq
       (set vx (* vx ratio fov))
       (set vy (* vy -1 fov))
       (set (: ray pos)
            (vec3f
             0
             0
             (/ (- projscale) fov)))
       (set (: ray dir) (normalized (coords-dir-panini vx vy)))
       ray))))

(def coords-ray coords-ray-panini)

(def fuzz
  (lambda (fn)
    (type SceneFun
      (lambda (ray res)
        (let
          (ray2 (make-ray-like ray))
          (seq
           (set ray2:pos ray:pos)
           (set ray2:dir
                (normalized
                 (+
                  (vec3f (/ (rand) dw) (/ (rand) dh) 0)
                  ray:dir)))
           (fn ray2 res)))))))

(def translate
  (lambda (vec fn)
    (let
      (fun (get-scenefun fn))
      (translate-fn
       (type
         SceneFun
         (lambda (ray res)
           (let
             (ray2 (make-ray-like ray))
             (seq
              (set ray2:pos (- ray:pos vec))
              (set ray2:dir ray:dir)
              (fun ray2 res))))))
      (if (struct? fn)
        (alloc-struct
         (bound (make-bound (+ vec fn:bound:from) (+ vec fn:bound:to)))
         (fn translate-fn))
        translate-fn))))

(def scale
  (lambda (vec fn)
    (let
      (fun (get-scenefun fn))
      (inv-vec (/ 1 vec))
      (scale-fn
       (type
         SceneFun
         (lambda (ray res)
           (let
             (ray2 (make-ray-like ray))
             (dir-scaled (* inv-vec ray:dir))
             (dir-adjust (length dir-scaled))
             (dir' (/ dir-scaled dir-adjust))
             (seq
              (set ray2:pos (* inv-vec ray:pos))
              (set ray2:dir dir')
              (fun ray2 res)
              ; translate back to original-ray space
              (set res:distance (/ res:distance dir-adjust))
              (set res:normal
                   (normalized (* inv-vec res:normal))))))))
      (if (struct? fn)
        (alloc-struct
         (bound (make-bound (* vec fn:bound:from) (* vec fn:bound:to)))
         (fn scale-fn))
        scale-fn))))

(def render
  (lambda (scene)
    (let
      (fn (get-scenefun scene))
      (lambda (x y i)
        (let
          (ray (coords-ray x y))
          (res (make-res))
          (seq
           (rand_seed (+ i (* di (+ x (* dw y)))))
           (fn ray res)
           (if (isfinite res:distance)
            res:emit
            black)))))))

; @file matrix

(require util)

; row-major
(def alloc-matrix
  (lambda (a b c d)
    (alloc-struct
     (a a)
     (b b)
     (c c)
     (d d))))

(def make-matrix
  (macro
    (a b c d)
    `(make-struct
      (a ,a)
      (b ,b)
      (c ,c)
      (d ,d))))

(def ident-matrix
  (macro ()
    `(make-matrix
      (vec4f 1 0 0 0)
      (vec4f 0 1 0 0)
      (vec4f 0 0 1 0)
      (vec4f 0 0 0 1))))

(def dot4
  (macro (a b)
    `(let
       (m (* ,a ,b))
       (+ m:x m:y m:z m:w))))

(def mat-mult-mv3
  (lambda (mat v w)
    (let
      (v' (vec4f v:x v:y v:z w))
      (vec4f
       (dot4 mat:a v')
       (dot4 mat:b v')
       (dot4 mat:c v')
       (dot4 mat:d v')))))

; modifies and returns its parameter
(def mat-transpose
  (lambda (mat)
    (let
      (a (vec4f mat:a:x mat:b:x mat:c:x mat:d:x))
      (b (vec4f mat:a:y mat:b:y mat:c:y mat:d:y))
      (c (vec4f mat:a:z mat:b:z mat:c:z mat:d:z))
      (d (vec4f mat:a:w mat:b:w mat:c:w mat:d:w))
      (seq
       (set mat:a a)
       (set mat:b b)
       (set mat:c c)
       (set mat:d d)
       mat))))

; modifies and returns its parameter
(def mat-mult-mm
  (lambda (mat1 mat2)
    (seq
     (mat-transpose mat2)
     (let
       (a1 mat1:a) (b1 mat1:b) (c1 mat1:c) (d1 mat1:d)
       (a2 mat2:a) (b2 mat2:b) (c2 mat2:c) (d2 mat2:d)
       (a (vec4f (dot4 a1 a2) (dot4 a1 b2) (dot4 a1 c2) (dot4 a1 d2)))
       (b (vec4f (dot4 b1 a2) (dot4 b1 b2) (dot4 b1 c2) (dot4 b1 d2)))
       (c (vec4f (dot4 c1 a2) (dot4 c1 b2) (dot4 c1 c2) (dot4 c1 d2)))
       (d (vec4f (dot4 d1 a2) (dot4 d1 b2) (dot4 d1 c2) (dot4 d1 d2)))
       (seq
        (set mat2:a a)
        (set mat2:b b)
        (set mat2:c c)
        (set mat2:d d)
        mat2)))))

(def mat-translate
  (lambda (v mat)
    (let
      (x v:x)
      (y v:y)
      (z v:z)
      (seq
       (mat-mult-mm
        (make-matrix
         (vec4f 1 0 0 x)
         (vec4f 0 1 0 y)
         (vec4f 0 0 1 z)
         (vec4f 0 0 0 1))
        mat)
       mat))))

(def mat-scale
  (lambda (v mat)
    (let
      (x v:x)
      (y v:y)
      (z v:z)
      (seq
       (mat-mult-mm
        (make-matrix
         (vec4f x 0 0 0)
         (vec4f 0 y 0 0)
         (vec4f 0 0 z 0)
         (vec4f 0 0 0 1))
        mat)
       mat))))

(def mat-rotate
  (lambda (axis angle mat)
    (if (= angle 0)
      mat
      (let
        (na (normalized axis))
        (x na:x)
        (y na:y)
        (z na:z)
        (s (sin angle))
        (c (cos angle))
        (nc (- 1 c))
        (xs (* x s))
        (ys (* y s))
        (zs (* z s))
        (seq
         (mat-mult-mm
          ; see https://www.opengl.org/sdk/docs/man2/xhtml/glRotate.xml
          (make-matrix
           (vec4f (+ (* x x nc) c ) (- (* y x nc) zs) (+ (* z x nc) ys) 0)
           (vec4f (+ (* y x nc) zs) (+ (* y y nc) c ) (- (* z y nc) xs) 0)
           (vec4f (- (* z x nc) ys) (+ (* y z nc) xs) (+ (* z z nc) c ) 0)
           (vec4f         0                 0                 0         1))
          mat)
         mat)))))

; standard gaussian invert
(def mat-invert
  (lambda (mat)
    (let
      (res (ident-matrix))
      (set-row
       (lambda (mat i v)
         (if (= i 0) (set mat:a v)
           (if (= i 1) (set mat:b v)
             (if (= i 2) (set mat:c v)
               (set mat:d v))))))
      (get-row
       (lambda (mat i)
         (if (= i 0) mat:a
           (if (= i 1) mat:b
             (if (= i 2) mat:c
               mat:d)))))
      (get-cell
       (lambda (mat row col)
         (let
           (row' (get-row mat row))
           (if (= col 0) row':x
             (if (= col 1) row':y
               (if (= col 2) row':z
                 row':w))))))
      (scale-row
       (lambda (i f)
         (seq
          (set-row mat i (* f (get-row mat i)))
          (set-row res i (* f (get-row res i))))))
      (sub-row
       (lambda (i j f)
         (seq
          (set-row mat i (- (get-row mat i)
                            (* f (get-row mat j))))
          (set-row res i (- (get-row res i)
                            (* f (get-row res j)))))))
      (seq
       (for col 0 4
         (for row 0 4
           (seq
            (if (= row col)
              (scale-row row (/ 1. (get-cell mat row col)))
              (sub-row row col (/
                                (get-cell mat row col)
                                (get-cell mat col col)))))))
       (set mat res)
       mat))))

(def mat-transform-bound
  (lambda (mat bound)
    (let
      (U bound:from)
      (V bound:to)
      ; get the eight corners of the bound cube
      (a (vec3f U:x U:y U:z)) (b (vec3f U:x U:y V:z))
      (c (vec3f U:x V:y U:z)) (d (vec3f U:x V:y V:z))
      (e (vec3f V:x U:y U:z)) (f (vec3f V:x U:y V:z))
      (g (vec3f V:x V:y U:z)) (h (vec3f V:x V:y V:z))
      ; transform them
      (a' (mat-mult-mv3 mat a 1)) (b' (mat-mult-mv3 mat b 1))
      (c' (mat-mult-mv3 mat c 1)) (d' (mat-mult-mv3 mat d 1))
      (e' (mat-mult-mv3 mat e 1)) (f' (mat-mult-mv3 mat f 1))
      (g' (mat-mult-mv3 mat g 1)) (h' (mat-mult-mv3 mat h 1))
      ; return (bound min max)
      (make-bound
       (vec3f (min a':x b':x c':x d':x e':x f':x g':x h':x)
              (min a':y b':y c':y d':y e':y f':y g':y h':y)
              (min a':z b':z c':z d':z e':z f':z g':z h':z))
       (vec3f (max a':x b':x c':x d':x e':x f':x g':x h':x)
              (max a':y b':y c':y d':y e':y f':y g':y h':y)
              (max a':z b':z c':z d':z e':z f':z g':z h':z))))))

(def vec4->vec3
  (lambda (v)
    (let
      ; TODO what do about fourth component??
      (vec3f v:x v:y v:z))))

(def matrix-transform
  (lambda (mat' fn)
    (let
      (fun (get-scenefun fn))
      (mat (make-matrix (vec4f 0) (vec4f 0) (vec4f 0) (vec4f 0)))
      (invmat (make-matrix (vec4f 0) (vec4f 0) (vec4f 0) (vec4f 0)))
      (seq
       (set mat mat')
       (set invmat mat')
       (mat-invert invmat)
       (let
         (mat-fn
          (type SceneFun
            (lambda (ray res)
              (let
                (ray2 (make-ray-like ray))
                (distfac 0.)
                (seq
                 (set ray2:pos
                      (vec4->vec3 (mat-mult-mv3 invmat ray:pos 1)))
                 (set ray2:dir
                      (vec4->vec3 (mat-mult-mv3 invmat ray:dir 0)))
                 (set distfac (/ 1. (length ray2:dir)))
                 (set ray2:dir (* ray2:dir distfac))
                 (fun ray2 res)
                 ; translate back to original-ray space
                 (set res:distance (* res:distance distfac))
                 (set res:normal
                      (normalized
                       (vec4->vec3 (mat-mult-mv3 mat res:normal 0)))))))))
         (if (struct? fn)
           (alloc-struct
            (bound (mat-transform-bound mat fn:bound))
            (fn mat-fn))
           mat-fn))))))

(def rotate
  (lambda (axis angle obj)
    (let
      (mat (ident-matrix))
      (seq
       (mat-rotate axis angle mat)
       (matrix-transform mat obj)))))

(def rotate-around
  (lambda (pos axis angle obj)
    (let
      (mat (ident-matrix))
      (-pos (- 0 pos))
      (seq
       (mat-translate -pos mat)
       (mat-rotate axis angle mat)
       (mat-translate pos mat)
       (matrix-transform mat obj)))))

(def camera
  (lambda (pos look-at scene)
    (let
      (mat (ident-matrix))
      (dir (- look-at pos))
      (-pos (- 0 pos))
      (flatdir (vec3f dir:x 0 dir:z))
      (seq
       ; translate the camera position into the origin
       (mat-translate -pos mat)
       ; rotate planar direction into +Z
       (mat-rotate (cross flatdir +Z) (angle flatdir +Z) mat)
       (let
         (dir' (vec4->vec3 (mat-mult-mv3 mat dir 0)))
         (seq
          (mat-rotate (cross dir' +Z) (angle dir' +Z) mat)
          (matrix-transform mat scene)))))))

; transform obj so that a-b lies in c-d
(def transform-into
  (lambda (a b c d obj)
    (let
      (mat (ident-matrix))
      (d1 (- b a))
      (d2 (- d c))
      (d1-length (length d1))
      (d2-length (length d2))
      (seq
       ; translate a to 0
       (mat-translate (- 0 a) mat)
       ; rotate d1 to x
       (mat-rotate
        (cross d1 (vec3f 1 0 0))
        (angle d1 (vec3f 1 0 0))
        mat)
       ; scale d1 to d2 on x
       (mat-scale (vec3f (/ d2-length d1-length) 1 1) mat)
       ; rotate x to d2
       (mat-rotate
        (cross (vec3f 1 0 0) d2)
        (angle (vec3f 1 0 0) d2)
        mat)
       ; translate back to c
       (mat-translate c mat)
       ; and apply
       (matrix-transform mat obj)))))
; @file pathtrace
(require util matrix)

(def reflect-at
  (lambda (normal incoming)
    (let
      (n normal)
      (a (- 0 incoming))
      (k (/ (dot a n) (dot n n)))
      (r (- (* 2 k n) a))
      r)))

(def get-reflect-color
  (lambda (res ray pos fn)
    (let
      (ray2 (make-ray-like ray))
      (res2 (make-res))
      (seq
       (set ray2:pos pos)
       (set ray2:dir
            (reflect-at res:normal ray:dir))
       (set ray2:avoid-obj-id res:hit-id)
       (set ray2:avoid-obj-side
            (if (= res:hit-side OUTSIDE) INSIDE OUTSIDE))
       (fn ray2 res2)
       (if (isfinite (: res2 distance))
         (: res2 emit)
         (vec3f 0))))))

(def get-transfer-color
  (lambda (res ray pos fn)
    (let
      (ray2 (make-ray-like ray))
      (res2 (make-res))
      (angle-factor (if
                   (= res:hit-side OUTSIDE)
                   (/ 1 res:ior)
                   res:ior))
      ; normal on the same side as the ray dir
      (my-norm (if
                   (= res:hit-side OUTSIDE)
                   (- 0 res:normal)
                   res:normal))
      (a' (* angle-factor (sin (angle my-norm ray:dir))))
      (if
        (>= a' 1)
        ; total internal reflection
        (get-reflect-color res ray pos fn)
        ; refraction
        (let
          (a (asin a'))
          (rmat (ident-matrix))
          (seq
           (mat-rotate (cross my-norm ray:dir) a rmat)
           (set ray2:pos pos)
           (set ray2:dir
                (vec4->vec3 (mat-mult-mv3 rmat my-norm 0)))
           (set ray2:avoid-obj-id res:hit-id)
           (set ray2:avoid-obj-side res:hit-side)
           (fn ray2 res2)
           (if (isfinite (: res2 distance))
             (: res2 emit)
             (vec3f 0)
             ; (vec3f a 0 0)
             )))))))

(def >0 (macro (arg) `(> ,arg 0)))

(def pathtrace_internal
  (type
    (function-type
     (list
      (typeof (make-ray))
      (typeof (make-res))
      SceneFun
      'int
      'float)
     'void)
    (lambda (ray res fn depth impact)
      (seq
       (fn ray res)
       (if
         (and
          (>0 depth)
          (isfinite (: res distance))
          (> impact 0.001)
          (>0 (length-squared (: res diffuse))))
         (let
           (startpos
            (+
             (: ray pos)
             (* (: ray dir) (: res distance))))
           (color (: res diffuse))
           (seq
            ; transfer step
            (if (and (>0 res:transfer) (<= (rand) res:transfer))
              (let
                (trace_next
                 (local-lambda (ray2 res2)
                   (pathtrace_internal ray2 res2 fn (- depth 1) impact)))
                (transfercolor
                 (get-transfer-color
                  res
                  ray
                  startpos
                  trace_next))
                (seq
                 (set res:emit
                      (+ res:emit (* color transfercolor)))))
              ; else reflect step
              (if (and (>0 res:reflect) (< (rand) res:reflect))
                (let
                  (trace_next
                   (local-lambda
                    (ray2 res2)
                    (pathtrace_internal ray2 res2 fn (- depth 1) impact)))
                  (reflcolor
                   (get-reflect-color
                    res
                    ray
                    startpos
                    trace_next))
                  (seq
                   ; factor for remaining diffuse bounce
                   (set (: res emit)
                        (+
                         (: res emit) (* color reflcolor)))))
                ; else diffuse step
                (let
                  (ray2 (make-ray))
                  (res2 (make-res))
                  (impactf (max (max res:diffuse:x res:diffuse:y) res:diffuse:z))
                  (seq
                   (set ray2:pos startpos)
                   ; (set ray2:dir (halfsphere (: res normal)))
                   (set ray2:dir (cos-weighted-halfsphere (: res normal)))
                   (set ray2:avoid-obj-id res:hit-id)
                   (set ray2:avoid-obj-side
                        (if (= res:hit-side OUTSIDE) INSIDE OUTSIDE))
                   (pathtrace_internal ray2 res2 fn (- depth 1) (* impact impactf))
                   (if (isfinite (: res2 distance))
                     (set (: res emit)
                          (+
                           (: res emit)
                           (* color res2:emit))))))))))
         ; (if (= depth 0) (set (: res emit) (vec3f 0 1 0)))
         )))))

(def pathtrace
  (lambda (depth scene)
    (let
      (fn (get-scenefun scene))
      (lambda (ray res) (pathtrace_internal ray res fn depth 1.)))))
; @file sphere
(require util)

(def
  sphere
  (lambda (center radius)
    (let
      (my-id (get-object-id))
      (rsq (* radius radius))
      (alloc-struct
       (bound (make-bound (- center (vec3f radius)) (+ center (vec3f radius))))
       (fn 
        (type SceneFun
          (lambda (ray res)
            (seq
             ; by default, missing hits hit from outside at infinity
             (set res:hit-id my-id)
             (set res:hit-side OUTSIDE)
             (set res:distance Infinity)
             (let
               (pos (- ray:pos center)) ; shift ray so we can pretend center is at 0
               (dir ray:dir)
               (p (sum (* 2 pos dir)))
               (inside (- (+ rsq (* p p (/ 1. 4.))) (sum (* pos pos))))
               (if
                 (>= inside 0)
                 (let
                   (sq (sqrt inside))
                   (k (- 0 (/ p 2)))
                   (k1 (- k sq))
                   (k2 (+ k sq))
                   (outside-hit
                    (and
                     (> k1 0)
                     (not
                      (and
                       (= ray:avoid-obj-id my-id)
                       (= ray:avoid-obj-side OUTSIDE)))))
                   (inside-hit
                    (and
                     (> k2 0)
                     (not
                      (and
                       (= ray:avoid-obj-id my-id)
                       (= ray:avoid-obj-side INSIDE)))))
                   (if
                     (or outside-hit inside-hit)
                     (let
                       (distance (if outside-hit k1 k2))
                       (side (if outside-hit OUTSIDE INSIDE))
                       (seq
                        (set-default-material res)
                        (set res:distance distance)
                        (set res:hit-side side)
                        (set
                         res:normal
                         ; center at 0
                         (normalized (+ pos (* dir distance))))))))))))))))))
; @file bound
(require util)

(def get-bounding-box
  (macro (obj)
    `(if (struct? ,obj)
       (: ,obj bound)
       (make-bound (vec3f (- 0 Infinity)) (vec3f Infinity)))))

(def merge-bounding-box
  (lambda (box1 box2)
    (seq
     (make-bound
      (vec3f
       (min (: box1 from x) (: box2 from x))
       (min (: box1 from y) (: box2 from y))
       (min (: box1 from z) (: box2 from z)))
      (vec3f
       (max (: box1 to x) (: box2 to x))
       (max (: box1 to y) (: box2 to y))
       (max (: box1 to z) (: box2 to z)))))))

(def intersect-bounding-box
  (lambda (box1 box2)
    (seq
     (make-bound
      (vec3f
       (max (: box1 from x) (: box2 from x))
       (max (: box1 from y) (: box2 from y))
       (max (: box1 from z) (: box2 from z)))
      (vec3f
       (min (: box1 to x) (: box2 to x))
       (min (: box1 to y) (: box2 to y))
       (min (: box1 to z) (: box2 to z)))))))

(def infinite-sized-box
  (lambda (box)
    (and
     (and (= (: box from x) (- 0 Infinity))
          (and
           (= (: box from y) (- 0 Infinity))
           (= (: box from z) (- 0 Infinity))))
     (and (= (: box to x) Infinity)
          (and
           (= (: box to y) Infinity)
           (= (: box to z) Infinity))))))

(def ray_hits_bound
  (lambda (from to ray)
    (let
      (enter (vec3f (- 0 Infinity)))
      (exit (vec3f Infinity))
      ; shift ray into origin
      (rfrom (- from (: ray pos)))
      (rto (- to (: ray pos)))
      (dir (: ray dir))
      (seq
       (if (!= (: dir x) 0)
         (let
           (a (/ (: rfrom x) (: dir x)))
           (b (/ (: rto x) (: dir x)))
           (seq
            (set (: enter x) (min a b))
            (set (: exit x) (max a b)))))
       (if (!= (: dir y) 0)
         (let
           (a (/ (: rfrom y) (: dir y)))
           (b (/ (: rto y) (: dir y)))
           (seq
            (set (: enter y) (min a b))
            (set (: exit y) (max a b)))))
       (if (!= (: dir z) 0)
         (let
           (a (/ (: rfrom z) (: dir z)))
           (b (/ (: rto z) (: dir z)))
           (seq
            (set (: enter z) (min a b))
            (set (: exit z) (max a b)))))
       (let
         (last_entry (max (max (: enter x) (: enter y)) (: enter z)))
         (first_exit (min (min (: exit x) (: exit y)) (: exit z)))
         ; if entry is before exit, and exit is ahead of us
         (and (>= first_exit last_entry) (>= first_exit 0)))))))

(def bound
  (lambda (from to obj)
    (let
      (fn (get-scenefun obj))
      (alloc-struct
       (bound (make-bound from to))
       (fn (type SceneFun
             (lambda (ray res)
               (seq
                (set (: res hit-side) OUTSIDE)
                (set (: res distance) Infinity)
                (if (ray_hits_bound from to ray)
                  (fn ray res))))))))))
; @file plane
(require util)

(def plane
  (lambda (normal base)
    (let
      (my-id (get-object-id))
      (type SceneFun
        (lambda (ray res)
          (let
            (pos ray:pos)
            (dir ray:dir)

            (denom (dot normal dir))
            (facing-down (< denom 0))
            (facing-up (not facing-down))

            (predist (dot normal (- pos base)))
            (pos-below-plane (< predist 0))
            (pos-above-plane (not pos-below-plane))

            (seq
             (set-default-material res)
             ; by default, "missing" hits hit at infinity
             (set res:hit-id my-id)
             (set res:hit-side (if facing-down INSIDE OUTSIDE))
             (set res:distance Infinity)
             
             ; hit from above, if we aren't to skip it
             (if (and
                  pos-above-plane
                  facing-down
                  (not
                   (and
                    (= ray:avoid-obj-id my-id)
                    (= ray:avoid-obj-side OUTSIDE))))
               (seq
                (set res:hit-side OUTSIDE)
                (set res:normal normal)
                (set res:distance (- 0 (/ predist denom)))))
             
             ; hit from below, if we aren't to skip it
             (if (and
                  pos-below-plane
                  facing-up
                  (not
                   (and
                    (= ray:avoid-obj-id my-id)
                    (= ray:avoid-obj-side INSIDE))))
               (seq
                (set res:hit-side INSIDE)
                (set res:normal normal)
                (set res:distance (- 0 (/ predist denom))))))))))))
; @file color
(require util)

(def wiggle
  (lambda (f v)
    (normalized (+ v (* f (rand-sphere))))))

(def set-material-fun
  (macro (setcmd)
    `(lambda (param object)
       (let
         (fn (get-scenefun object))
         (rewrap
          object
          (if (callable? param)
            (lambda (ray res)
              (seq
               (fn ray res)
               (let
                 (pos (+ ray:pos
                         (* ray:dir res:distance)))
                 (value (param pos))
                 ,setcmd)))
            (lambda (ray res)
              (seq
               (fn ray res)
               (let
                 (value param)
                 ,setcmd)))))))))

(def shine (set-material-fun (set res:emit value)))
(def color (set-material-fun (set res:diffuse value)))
(def transfer (set-material-fun (set res:transfer value)))
(def ior (set-material-fun (set res:ior value)))
(def reflect (set-material-fun (set res:reflect value)))
(def roughness
  (set-material-fun (set res:normal (wiggle value res:normal))))

(def checker
  (lambda (a b)
    (type
      (closure-type (list Vec3f) Vec3f)
      (lambda (v)
        (let
          (i (^
              (if (> (% (: v x) 2) 1) 1 0)
              (if (> (% (+ (: v y) 0.5) 2) 1) 1 0)
              (if (> (% (: v z) 2) 1) 1 0)))
          (if (= i 0) a b))))))

; @file perlin
(def choose4
  (lambda (a b n)
    `(alias
      (%a ,a)
      (%b ,b)
      (vec4f
       ,(if (= (& n 1) 0) '(: %a x) '(: %b x))
       ,(if (= (& n 2) 0) '(: %a y) '(: %b y))
       ,(if (= (& n 4) 0) '(: %a z) '(: %b z))
       ,(if (= (& n 8) 0) '(: %a w) '(: %b w))))))

(def perm
  (macro (x)
    `(let (i ,x) (% (* i (+ 1 (* i 34))) 289))))

(def perm4
  (macro (i)
    `(alias
      (%i ,i)
      (perm (+
             (: %i x)
             (perm (+
                    (: %i y)
                    (perm (+
                           (: %i z)
                           (perm (: %i w)))))))))))

(def n4
  (lambda (f0 f1 i0 i1 s)
    `(grad ,(choose4 f0 f1 s) (perm4 ,(choose4 i0 i1 s)))))

(def lerp
  (lambda (f a b)
    (+ a (* f (- b a)))))

(def grad (lambda (f hash)
            (let
              ; convert low 5 bits of hash code into directions
              (h (& hash 31))
              (u (if (< h 24) (: f x) (: f y)))
              (v (if (< h 16) (: f y) (: f z)))
              (w (if (< h  8) (: f z) (: f w)))
              (+
               (if (= (& h 1) 0) u (- 0 u))
               (if (= (& h 2) 0) v (- 0 v))
               (if (= (& h 4) 0) w (- 0 w))))))

(def metalerp
  (macro
    ()
    (let
      (lerp4 (lambda (base) (n4 'f0 'f1 'iv0 'iv1 base)))
      (lerp3 (lambda (base) `(lerp
                              (: l x)
                              ,(lerp4 base)
                              ,(lerp4 (+ base 1)))))
      (lerp2 (lambda (base) `(lerp
                              (: l y)
                              ,(lerp3 base)
                              ,(lerp3 (+ base 2)))))
      (lerp1 (lambda (base) `(lerp
                              (: l z)
                              ,(lerp2 base)
                              ,(lerp2 (+ base 4)))))
      (lerp0 (lambda (base) `(lerp
                              (: l w)
                              ,(lerp1 base)
                              ,(lerp1 (+ base 8)))))
      (lerp0 0))))

(def floor4 (lambda (v)
              (vec4f
               (floor (: v x))
               (floor (: v y))
               (floor (: v z))
               (floor (: v w)))))

(def fade (lambda (t)
            (* t t t (+ 10 (* t (- (* t 6) 15))))))

; thanks http://staffwww.itn.liu.se/~stegu/aqsis/aqsis-newnoise/noise1234.cpp
; and https://github.com/ashima/webgl-noise/blob/master/src/classicnoise4D.glsl
(def perlin4
  (lambda (v)
    (let
      (iv0 (floor4 v))
      (iv1 (+ iv0 1))
      (f0 (- v iv0))
      (f1 (- f0 1))
      (l (fade f0))
      (* 0.5 (+ 1 (* 0.87 (metalerp)))))))

(def xperlin4
  (lambda (v)
    (max 0 (min 1 (+ 0.5 (* 3 (- 0.5 (perlin4 v))))))))

(def xperlin31
  (lambda (v w)
    (xperlin4 (vec4f
               (: v x)
               (: v y)
               (: v z)
               w))))

(def octave
  (lambda (v)
    (+
     (* (/ 16 31.) (xperlin31 (* v  1)  0))
     (* (/  8 31.) (xperlin31 (* v  2) 10))
     (* (/  4 31.) (xperlin31 (* v  4) 20))
     (* (/  2 31.) (xperlin31 (* v  8) 30))
     (* (/  1 31.) (xperlin31 (* v 16) 40)))))
; @file group
(require util bound nothing)

(def group2
  (lambda (obj1 obj2)
    (let
      (fn1 (get-scenefun obj1))
      (fn2 (get-scenefun obj2))
      (alloc-struct
       (bound (merge-bounding-box
               (get-bounding-box obj1)
               (get-bounding-box obj2)))
       (fn (type SceneFun
             (lambda (ray res1)
               (let
                 (res2 (make-res))
                 (seq
                  (fn1 ray res1)
                  (fn2 ray res2)
                  (if (< res2:distance res1:distance)
                    (set res1 res2)))))))))))

(def groupfun
  (lambda (args)
    (if (= (size args) 0)
      '(nothing)
      (if (= (size args) 1)
        (first args)
        (let
          (pivot (/ (size args) 2))
          (left (groupfun (slice 0 pivot args)))
          (right (groupfun (slice pivot (size args) args)))
          (list 'group2 left right))))))

(def group
  (macro (...)
    (groupfun ...)))

; @file csg
(require util bound)

(def negate
  (lambda (obj)
    (let
      (fn (get-scenefun obj))
      (type
        SceneFun
        (lambda (ray res)
          (let
            (ray2 (make-ray))
            (seq
             (set ray2 ray)
             (set ray2:avoid-obj-side
                  (if
                    (= ray:avoid-obj-side OUTSIDE)
                    INSIDE
                    OUTSIDE))
             (fn ray2 res)
             (set res:normal (- 0 res:normal))
             (set res:hit-side
                  (if
                    (= res:hit-side OUTSIDE)
                    INSIDE
                    OUTSIDE)))))))))

(def
  intersect2
  (lambda (obj1 obj2)
    (let
      (fn1 (get-scenefun obj1))
      (fn2 (get-scenefun obj2))
      (my-id (get-object-id))
      (alloc-struct
       (bound (intersect-bounding-box
               (get-bounding-box obj1)
               (get-bounding-box obj2)))
       (fn
        (type SceneFun
          (lambda (ray res1)
            (let
              ; local variables
              (fn1 fn1)
              (fn2 fn2)
              (res2 (make-res))
              (ray2 (make-ray))
              (searching true)
              (cycles 0)
              (offset 0.0)
              (seq
               (set ray2 ray)
               (set ray2:avoid-obj-id 0) ; don't avoid anything
               (fn1 ray2 res1)
               (fn2 ray2 res2)
               (while searching
                 (seq
                  (set cycles (+ 1 cycles))
                  (if (> cycles 999)
                    ; error state
                    (seq
                     (set searching false)
                     (set res1:emit (vec3f 1 0 0))
                     (set res1:diffuse (vec3f 0)))
                    (seq
                     ; wlog res1 is closer
                     (if (< res2:distance res1:distance)
                       (let
                         (temp-res (make-res))
                         (temp-fn fn1)
                         (seq
                          (set temp-res res1)
                          (set res1 res2)
                          (set res2 temp-res)
                          (set fn1 fn2)
                          (set fn2 temp-fn))))
                     (if (not (isfinite res1:distance))
                       (seq
                        (set res1:hit-side
                             ; if we're infinitely inside both obj1 and obj2
                             (if (and
                                  (= res1:hit-side INSIDE)
                                  (= res2:hit-side INSIDE))
                               INSIDE
                               OUTSIDE))
                        (set searching false))
                       ; otherwise res1:distance is finite
                       (if (and
                            (= res2:hit-side INSIDE)
                            (not
                             (and
                              (= ray:avoid-obj-id my-id)
                              (= ray:avoid-obj-side res1:hit-side))))
                         ; then res1 happened inside the body of obj2
                         ; and is thus our relevant intersect hit
                         (set searching false)
                         ; otherwise, step past res1
                         (seq
                          ; redo res1 from "offset"
                          (set offset (+ offset res1:distance))
                          ; advance ray
                          (set ray2:pos
                               (+ ray:pos (* offset ray:dir)))
                          ; adjust hit2 for new ray2
                          (set res2:distance
                               (- res2:distance res1:distance))
                          ; adjust ray2 flags
                          (set ray2:avoid-obj-id res1:hit-id)
                          (set ray2:avoid-obj-side res1:hit-side)
                          ; recompute res1
                          (fn1 ray2 res1)
                          ; and loop
                          )))))))
               ; res1 will contain the intersect hit
               ; adjust back to ray-space
               (set res1:distance
                    (+ offset res1:distance))
               (set res1:hit-id my-id))))))))))

; TODO factor into util
(def intersectfun
  (lambda (args)
    (if (= (size args) 0)
      '(nothing)
      (if (= (size args) 1)
        (first args)
        (let
          (pivot (/ (size args) 2))
          (left (intersectfun (slice 0 pivot args)))
          (right (intersectfun (slice pivot (size args) args)))
          (list 'intersect2 left right))))))

(def intersect
  (macro (...)
    (intersectfun ...)))
; @file cylinder

(require csg plane sphere bound util matrix)

(def cylinder
  (lambda (r a b)
    (let
      (stdcyl (bound
               (vec3f (- 0 r) 0 (- 0 r)) ; from
               (vec3f r 1 r) ; to
               (intersect
                ; cylinder
                (scale (vec3f 1 Infinity 1) (sphere (vec3f 0) r))
                ; bottom cap
                (plane (vec3f 0 -1 0) (vec3f 0 0 0))
                ; top cap
                (plane (vec3f 0 1 0) (vec3f 0 1 0)))))
      (transform-into
       (vec3f 0 0 0)
       (vec3f 0 1 0)
       a
       b
       stdcyl))))
; @file box
(require plane csg bound)

(def
  box
  (lambda (a' b')
    (let
      (a (vec3f
          (min (: a' x) (: b' x))
          (min (: a' y) (: b' y))
          (min (: a' z) (: b' z))))
      (b (vec3f
          (max (: a' x) (: b' x))
          (max (: a' y) (: b' y))
          (max (: a' z) (: b' z))))
      (bound a b (intersect
                  (plane (vec3f -1  0  0) a)
                  (plane (vec3f  1  0  0) b)
                  (plane (vec3f  0 -1  0) a)
                  (plane (vec3f  0  1  0) b)
                  (plane (vec3f  0  0 -1) a)
                  (plane (vec3f  0  0  1) b))))))
; @file nothing
(require util)

(def nothing
  (lambda ()
    (type SceneFun
      (lambda (ray res)
        (seq
         (set res:distance Infinity)
         (set res:hit-side OUTSIDE))))))
; @file boundgroup
(require util bound group nothing)

(def bound-wrap
  (lambda (fn)
    (if (struct? fn)
      fn
      (alloc-struct
       (bound (make-bound (vec3f (- 0 Infinity)) (vec3f Infinity)))
       (fn (type SceneFun fn))))))

(def bound-group
  (lambda (a b)
    (let
      (box1 (get-bounding-box a))
      (box2 (get-bounding-box b))
      (combined-box (merge-bounding-box box1 box2))
      (if (infinite-sized-box combined-box)
        ; then
        (group a b)
        ; else
        (bound
         (: combined-box from)
         (: combined-box to)
         (group a b))))))

(def for/group-lambda-type
  (closure-type
   (list 'int)
   SceneObject))

(def for/group-fn
  (type
   (function-type (list
                   'int
                   'int
                   for/group-lambda-type)
                  SceneObject)
   (lambda (from to fn)
     (if (= from to)
       (bound-wrap (nothing))
       (if (= (+ 1 from) to)
         (bound-wrap (fn from))
         (let
           (pivot (+ from (/ (- to from) 2)))
           (left (for/group-fn from pivot fn))
           (right (for/group-fn pivot to fn))
           (bound-group left right)))))))

(def for/group
  (macro (var from to body)
    `(let
       (%fgbody (type for/group-lambda-type
                      (lambda (,var) ,body)))
       (for/group-fn ,from ,to %fgbody))))
