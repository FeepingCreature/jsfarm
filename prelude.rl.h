; @file prelude
(def fov 0.75)
; (def fov 0.2)

(def true (= 1 1))
(def false (= 1 2))

(def qmap
  (lambda (list)
    (if (= (size list) 0)
      list
      (cons (quasicode (first list)) (qmap (rest list))))))

(def quasicode
  (lambda (arg)
    (if (not (list? arg)) (quote arg)
      (if (same (first arg) 'unquote)
        (first1 (rest arg))
        (cons 'list (qmap arg))))))

(def quasiquote
  (macro (arg)
    (quasicode arg)))

(def andfn
  (lambda (arg)
    (if (= (size arg) 0)
      true
      (if (= (size arg) 1)
        (first arg)
        (list 'if (first arg) (andfn (rest arg)) false)))))

(def and (macro (...) (andfn ...)))

(def orfn
  (lambda (arg)
    (if (= (size arg) 0)
      false
      (if (= (size arg) 1)
        (first arg)
        (list 'if (first arg) true (orfn (rest arg)))))))

(def or (macro (...) (orfn ...)))

(def quotelist
  (lambda (list)
    (if (= (size list) 0)
      list
      (cons (quote (first list)) (quotelist (rest list))))))

(def let_fun
  (lambda (args)
    ; TODO error cases for (= size 0)
    (if (= (size args) 1)
      (first1 args) ; plain body
      (list
       'let1
       (first args)
       (let_fun (rest args))))))

(def let
  (macro (...)
    (let_fun ...)))

(def alias_fun
  (lambda (args)
    ; TODO error cases for (= size 0)
    (if (= (size args) 1)
      (first1 args) ; plain body
      (list
       'alias1
       (first args)
       (alias_fun (rest args))))))

(def alias
  (macro (...)
    (alias_fun ...)))

(def require (macro (...) (cons '_require (quotelist ...))))
(def : (macro (base ...) (cons '_element (cons base (quotelist ...)))))

; non-recursive to avoid browser erroring out due to stack overflow
(def slice
  (lambda (from to args)
    (let
      (from' from) (to' to) (args' args)
      (res '())
      (seq
       (while (or (> from 0) (> to 0))
         (if (> from 0)
           (seq
            (set from (- from 1))
            (set to (- to 1))
            (set args (rest args)))
           (seq
            (set res (cons (first args) res))
            (set to (- to 1))
            (set args (rest args)))))
       res))))

(def for
  (macro (var from to body)
    `(seq
      (let (,var ,from)
        (while (< ,var ,to)
          (let
            (_for_res ,body)
            (seq
             (set ,var (+ ,var 1))
             _for_res)))))))

(def splitfun
  (lambda (base args)
    (if (= (size args) 1)
      (first args)
      (let
        (pivot (/ (size args) 2))
        (left (splitfun base (slice 0 pivot args)))
        (right (splitfun base (slice pivot (size args) args)))
        (list base left right)))))

; TODO vectors?
(def min2
  (macro (a b)
    `(let
      (%a ,a)
      (%b ,b)
      (if (< %a %b) %a %b))))

(def min
  (macro (...)
    (splitfun 'min2 ...)))

(def max2
  (macro (a b)
    `(let
      (%a ,a)
      (%b ,b)
      (if (> %a %b) %a %b))))

(def max
  (macro (...)
    (splitfun 'max2 ...)))

(def Vec3f (vector-type 'float 3))
(def Vec4f (vector-type 'float 4))

(def SumType (function-type (list Vec3f) 'float))
(def sum (type SumType (lambda (vec) (+ (: vec x) (: vec y) (: vec z)))))

(def DotType (function-type (list Vec3f Vec3f) 'float))
(def dot (type DotType (lambda (v1 v2) (sum (* v1 v2)))))

(def length (lambda (vec) (sqrt (dot vec vec))))
(def length-squared (lambda (vec) (sum (* vec vec))))

(def NormType (function-type (list Vec3f) Vec3f))
(def normalized (type NormType (lambda (vec) (* vec (/ 1 (length vec))))))

(def angle
  (lambda (a b)
    (acos (dot (normalized a) (normalized b)))))

(def cross
  (lambda (a b)
    (vec3f
     (- (* a:y b:z) (* a:z b:y))
     (- (* a:z b:x) (* a:x b:z))
     (- (* a:x b:y) (* a:y b:x)))))

(def X (vec3f 1 0 0))
(def Y (vec3f 0 1 0))
(def Z (vec3f 0 0 1))

(def +X (vec3f 1 0 0))
(def +Y (vec3f 0 1 0))
(def +Z (vec3f 0 0 1))

(def -X (vec3f -1  0  0))
(def -Y (vec3f  0 -1  0))
(def -Z (vec3f  0  0 -1))

(def blend
  (lambda (a b f)
    (+ a (* f (- b a)))))

(def black   (vec3f 0 0 0))
(def blue    (vec3f 0 0 1))
(def green   (vec3f 0 1 0))
(def cyan    (vec3f 0 1 1))
(def red     (vec3f 1 0 0))
(def magenta (vec3f 1 0 1))
(def yellow  (vec3f 1 1 0))
(def white   (vec3f 1 1 1))
