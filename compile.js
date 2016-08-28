'use strict';

var ELECTRON_WORKER = (typeof alert === 'undefined') && (typeof process !== 'undefined');
var PLATFORM_ELECTRON = typeof window !== 'undefined' && window.process && window.process.type === "renderer";
PLATFORM_ELECTRON |= ELECTRON_WORKER;

var STACK_DEBUG = false;

Error.stackTraceLimit=undefined;
/** @constructor */
function RequireLoopError(msg) {
  this.name = 'RequireLoopError';
  this.message = msg;
}

/** @constructor */
function AlreadyInformedError(msg) {
  this.name = 'AlreadyInformedError';
  this.message = msg;
}

function fail(thing, info) {
  if (typeof thing == 'object' && thing
    && 'fail' in thing && typeof thing.fail === 'function'
  ) thing.fail(info);
  if (typeof log != "undefined") log(info);
  throw "broken "+typeof thing+": "+info+" at "+new Error().stack;
}

function assert_src(thing, test) {
  if (!test) fail(thing, "assert failed");
}

var idcounter = 0;
function unique_id(name) {
  return name+(idcounter++);
}

function unique_id_for(thing, name) {
  if (!thing.hasOwnProperty("uniqid")) {
    thing.uniqid = unique_id(name);
  }
  return thing.uniqid;
}

function js_type_to_c(type) {
  if (type == "float") return "double";
  if (type == "bool") return "int";
  return type;
}

function filter_string(str) {
  var res = "";
  var reg = /[a-z0-9_]+/gi;
  var result;
  while (result = reg.exec(str)) res += result;
  return res;
}

// thanks https://github.com/joliss/js-string-escape/blob/master/index.js
function jsStringEscape(string) {
  return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
    // Escape all characters not included in SingleStringCharacters and
    // DoubleStringCharacters on
    // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
    switch (character) {
      case '"': case "'": case '\\': return '\\' + character
      // Four possible LineTerminator characters need to be escaped:
      case '\n': return '\\n'
      case '\r': return '\\r'
      case '\u2028': return '\\u2028'
      case '\u2029': return '\\u2029'
    }
  });
}

function js_tag_init(type, value) {
  if (type == "float") {
    if (typeof value == "number" && value == (value|0)) {
      return value+".0";
      // return "fround("+value+")";
    } else if (""+parseFloat(value) == value) {
      value = parseFloat(value).toFixed(20);
      return value;
      // if (value == "Infinity") return; // Double, not Float
      // return "fround("+value+")";
    }
  }
  if (type == "int") {
    if (typeof value == "number") return value;
  }
}

function suspect(text) {
  if (text.search("undefined") !== -1 || text.search("object Object") !== -1 || text.search("null") !== -1) {
    throw ("this seems suspicious. "+text);
  }
}

function list() {
  var value = [];
  for (var i = 0; i < arguments.length; ++i) {
    var arg = arguments[i];
    if (typeof arg == "string") value.push({
        kind: "atom",
        value: arg
      });
    else value.push(arg);
  }
  return {
    kind: "list",
    value: value
  };
}

function tagf_init(arg) { return js_tag_init("float", arg); }

function isFloat(arg) {
  if (""+parseFloat(arg) == arg ||
      ""+parseFloat(arg)+".0" == arg)
  {
    return true;
  }
  if (arg != arg) return true; // special: NaN
  return false;
}

function str_is_int(arg) {
  return ""+parseInt(arg, 10) == arg;
}

function coerce_int(arg) {
  if (typeof arg === "string" && arg.slice(0, 2) == "__") { /* replaced with integer later */
    return arg;
  }
  // like fround(1)
  if (typeof arg === "string" && arg.slice(0, 7) == "fround(" && arg.slice(-1) == ")" && isFloat(arg.slice(7, -1))) {
    arg = arg.slice(7, -1);
  }
  if (isFloat(arg)) {
    return ""+(~~(parseFloat(arg, 10)));
  }
  if (PLATFORM_ELECTRON) {
    return "(int)"+paren_maybe(arg);
  }
  return "~~"+paren_maybe(arg, "~");
}

function lit_float(thing) {
  if (thing.kind != "expr") return false;
  return typeof thing.value == "number";
}

function lit_int(thing) {
  if (!lit_float(thing)) return false;
  if (thing.type != "int") return false;
  if (thing.value != thing.value|0) throw "bad int";
  return true;
}

function lit_bool(thing) {
  if (thing.kind != "expr") return false;
  if (thing.type != "bool") return false;
  return thing.value == true || thing.value == false;
}

function coerce_double(thing) {
  return js_tag("double", js_tag(thing));
}

function paren_maybe(ex, op) {
  ex = ""+ex;
  suspect(ex);
  var is_simple_identifier = function(text) {
    return !!text.match(/^[a-zA-Z_][0-9a-zA-Z_]*$/);
  };
  var is_number = function(text) {
    if (str_is_int(text)) return true;
    if (""+parseFloat(text) == text) return true;
    if (parseFloat(text).toFixed(20) == text) return true;
    if (""+parseFloat(text)+".0" == text) return true; // forced double
    return false;
  };
  var is_basic = function(text) {
    return is_simple_identifier(text) || is_number(text);
  };
  if (is_basic(ex)) return ex;
  if (ex.slice(0, 6) == "fround") return ex;
  /*if ("+./*&|^~<=>=".indexOf(op) != -1) {
    if (ex.slice(0,1) == "+" && is_basic(ex.slice(1))) return " "+ex;
  }*/
  return "("+ex+")";
}

function js_tag(type, value) {
  if (typeof value == "undefined") {
    value = type;
    if (typeof value != "object") throw "what is "+typeof value+" "+value;
    
    if (value.kind == "frame") value = value.base;
    
    if (value.kind == "expr") {
      /*if (!lit_float(value)) {
        return value.value;
      }*/
      type = value.type;
      value = value.value;
    } else throw "how tag "+value.kind;
  }
  if (PLATFORM_ELECTRON) {
    if (type == "float") return "(double)"+paren_maybe(value);
    if (type == "double") return "(double)"+paren_maybe(value);
    if (type == "int") return "(int)"+paren_maybe(value);
    if (type == "bool") {
      if (typeof value == "boolean") {
        if (value) return "1";
        else return "0";
      }
      return "(int)"+paren_maybe(value);
    }
  }
  if (type == "float") return "+"+paren_maybe(value, "+");
  // if (type == "float") return "fround("+value+")";
  if (type == "double") return "+"+paren_maybe(value, "+");
  if (type == "int") return paren_maybe(value, "|")+"|0";
  if (type == "bool") {
    if (typeof value == "boolean") {
      if (value) return "1";
      else return "0";
    }
    return paren_maybe(value, "|")+"|0";
  }
  throw "how tag "+type;
  // return value;
}

function js_as_type(type, value) {
  if (lit_int(value)) return value.value;
  if (value.kind == "expr" && value.type == type) {
    return js_tag(value);
  }
  if (type == "float" && value.kind == "expr" && value.type == "int") {
    return js_tag("float", js_tag(value));
  }
  // return null;
  if (type == "int" && value.kind == "expr" && value.type == "float") return null;
  fail(value, "as_type? <"+type+"> "+JSON.stringify(value));
}

// for unification
function js_typelist(thing) {
  if (thing.kind == "expr") {
    if (thing.type == "int")
      return ["int", "float", "double"];
    if (thing.type == "float")
      return ["float", "double"];
    return [thing.type];
  } else throw "what is typelist of "+thing.kind;
}

function first_common(array1, array2) {
  for (var i = 0; i < array1.length; ++i) {
    var entry = array1[i];
    for (var k = 0; k < array2.length; ++k) {
      if (array2[k] == entry) return entry;
    }
  }
  return null;
}

function js_unify_vars(left, right) {
  var packtag = function(type, thing) {
    return {kind: "expr", type: type, value: js_as_type(type, thing)};
  };
  var ltypes = js_typelist(left), rtypes = js_typelist(right);
  var shared = first_common(ltypes, rtypes);
  if (shared) return {left: packtag(shared, left), right: packtag(shared, right)};
  
  fail(left, "unsure how to unify "+JSON.stringify(left)+", "+JSON.stringify(right)+", types "+JSON.stringify(ltypes)+", "+JSON.stringify(rtypes));
  return {left: left, right: right};
}

/** @constructor */
function ClosurePointer(type, base, offset) {
  var sign = flatten_type_array(["int"].concat(type.args)).signature;
  var fntype = closureTypeToFnType(type);
  return {
    kind: "closure-pointer",
    type: type,
    signature: sign,
    base: base,
    fnptr: {
      kind: "function-pointer",
      type: fntype,
      signature: sign,
      offset: offset,
      call: function(ctx, thing, args) { return js_call_fnptr(ctx.js, this, thing, args); }
    }
  };
}

function js_get_at(type, base, offs) {
  offs = offs || 0;
  
  if (type.kind == "vector") {
    var parts = [];
    var elemsize = js_type_size(type.base);
    for (var i = 0; i < type.size; ++i) {
      parts.push(js_get_at(type.base, base, offs + elemsize * i));
    }
    var res = mkVec_direct(type, parts);
    res.base = base;
    return res;
  }
  if (typeof type == "object") {
    if (type.kind == "pointer") {
      return {kind: "pointer", base: js_get_at("int", base, offs), type: type.type};
    }
    if (type.kind == "array-type") {
      return new RLArray(type, js_get_at("int", base, offs), js_get_at("int", base, offs + 4));
    }
    if (type.kind == "struct") {
      var value = {};
      for (var key in type.types) if (type.types.hasOwnProperty(key)) {
        var mtype = type.types[key];
        var moffset = type.offsets[key];
        value[key] = js_get_at(mtype, base, offs + moffset);
      }
      var offbase = {kind: "expr", type: "int", value: js_op(null, "+", js_tag(base), offs)};
      return {
        kind: "struct",
        type: type,
        base: offbase,
        value: value
      };
    }
    if (type.kind == "frame") {
      var res = flatclone(type);
      if (res.hasOwnProperty("base")) {
        res.base = js_get_at("int", base, offs + 0);
      }
      return res;
    }
    if (type.kind == "closure-poly") {
      var res = flatclone(type); // one of those tricksy "value = type" thingses
      res.base = flatclone(res.base);
      if (res.base.hasOwnProperty("base")) {
        res.base.base = js_get_at("int", base, offs + 0);
      }
      return res;
    }
    if (type.kind == "function-poly") {
      return type;
    }
    if (type.kind == "closure") {
      return new ClosurePointer(
        type,
        {kind: "frame", base: js_get_at("int", base, offs + 0)},
        js_get_at("int", base, offs + 4)
      );
    }
  }
  
  var target = null;
  if (PLATFORM_ELECTRON) {
    var c_type = type;
    if (type == "bool") c_type = "int";
    if (offs === 0) {
      target = "*("+c_type+"*) (memory + "+js_tag(base)+")";
    } else if (typeof offs == "number") {
      target = "*("+c_type+"*) (memory + "+paren_maybe(js_op(null, "+", js_tag(base), offs), "+")+")";
    } else {
      target = "*("+c_type+"*) (memory + "+paren_maybe(js_op(null, "+", js_tag(base), js_tag(offs)), "+")+")";
    }
  } else {
    var shift = null, stackvar = null;
    if (type == "float") {
      shift = 2;
      stackvar = "mem_f32";
    } else if (type == "int" || type == "bool") {
      shift = 2;
      stackvar = "mem_i32";
    } else fail(null, "unimplemented js_get_at(type="+JSON.stringify(type)+", base="+JSON.stringify(base)+", offs="+offs+")");
    
    if (offs === 0) {
      target = stackvar+"["+paren_maybe(js_tag(base), ">>")+" >> "+shift+"]";
    } else if (typeof offs == "number") {
      target = stackvar+"["+paren_maybe(js_op(null, "+", js_tag(base), offs), ">>")+" >> "+shift+"]";
    } else {
      target = stackvar+"["+paren_maybe(js_op(null, "+", js_tag(base), js_tag(offs)), ">>")+" >> "+shift+"]";
    }
  }
  
  suspect(target);
  
  return {
    kind: "expr",
    type: type,
    value: target
  };
};

function js_tag_cast(type, thing) {
  if (type == "float") {
    if (thing.kind == "expr" && thing.type == "float") {
      return js_tag(thing);
    }
  }
  return js_tag(type, js_tag(thing));
}

function js_op(type, op, a, b) {
  // int ops
  if (op == "<<" || op == ">>" || op == ">>>" || op == "&" || op == "|" || op == "^") {
    a = coerce_int(a);
    b = coerce_int(b);
  }
  a = paren_maybe(a, op);
  b = paren_maybe(b, op);
  if (op == "%") {
    // TODO mkVar?
    return js_op(type, "%%", js_op(type, "+", js_op(type, "%%", a, b), b), b);
  }
  if (op == "%%") {
    op = "%";
    if (type != "int") {
      a = "+("+a+")"; // coerce, if float
      b = "+("+b+")";
      type = "float"; // coerce back
    }
  }
  var res = null;
  if (op == ">>>" && PLATFORM_ELECTRON) {
    res = "(unsigned int)("+a+") >> "+b;
  } else if (type == "int" && op == "*" && !PLATFORM_ELECTRON) {
    res = "imul("+a+", "+b+")";
  } else {
    res = a+" "+op+" "+b;
  }
  if (!type) return res;
  return js_tag(type, res);
}

// turn a compound expression into an array of primitives
function flatten(base, thing) {
  if (thing == null)
    throw "flatten null?";
  if (typeof thing == "function-poly")
    return [thing]; // hopeless
  
  if (thing.kind == "struct") {
    fail(base, "cannot pass struct as parameter (must be pointer) - internal issue");
  }
  if (thing.kind == "pointer") {
    return [thing.base];
  }
  if (thing.kind == "frame") {
    if (!thing.hasOwnProperty("base")) {
      // this can happen if we pass an interpreted
      // stackframe to a compiled function
      // in this case, because we're passing the context as constants,
      // each frame must uniquely specialize the target function.
      return [];
    }
    return [thing.base];
  }
  if (thing.kind == "expr") {
    return [thing]; // all "variables" are primitive
  }
  if (thing.kind == "vector") {
    var vars = [];
    for (var i = 0; i < thing.type.size; ++i) {
      vars.push({kind: "expr", type: thing.type.base, value: thing.value[i]});
    }
    return vars;
  }
  if (thing.kind == "array") {
    return [thing.ptr, thing.size];
  }
  if (thing.kind == "closure-pointer") {
    return [thing.base.base, thing.fnptr.offset];
  }
  if (thing.kind == "closure-poly") {
    return flatten(base, thing.base);
  }
  if (thing.kind == "function-poly") {
    return [];
  }
  if (thing.kind == "closure") {
    if (!thing.hasOwnProperty("value")) {
      // see above - interpreted closure to compiled function
      return [];
    }
  }
  fail(base, "how to flatten "+typeof thing+" "+thing.kind);
}

function flatten_type(type) {
  // types provided in-repl
  if (typeof type == "object" && type.hasOwnProperty('kind') && type.kind == "atom") {
    type = type.value;
  }
  
  if (type == "float" || type == "int" || type == "bool") return [type];
  if (type.kind == "vector") {
    var types = [];
    for (var i = 0; i < type.size; ++i) types.push(type.base);
    return types;
  }
  if (type.kind == "array-type") {
    return ["int", "int"]; // ptr, size
  }
  if (type.kind == "closure-poly") {
    if (type.base.hasOwnProperty("base")) return ["int"]; // base pointer
    else return []; // baseless closure (interpreted frinstance)
  }
  if (type.kind == "function-poly") {
    return [];
  }
  // type of frame is just frame - frames are special snowflakes
  if (type.kind == "frame") {
    if (!type.hasOwnProperty("base")) { // see above
      return []; // already got a special signature in flatten(), don't need a special call table
    }
    return [type.base.type];
  }
  if (type.kind == "struct") {
    fail(null, "how to flatten struct - internal issue");
  }
  if (type.kind == "pointer") {
    return ["int"];
  }
  if (type.kind == "closure") { // type of value.kind="closure-pointer"
    return ["int", "int"];
  }
  fail(null, "how to flatten "+typeof type+" "+JSON.stringify(type));
}

function get_type_signature(thing) {
  if (thing == null) return "null";
  if (typeof thing == "string") return thing;
  if (thing.kind == "expr") return get_type_signature(thing.type);
  if (thing.kind == "vector" && 'type' in thing) return get_type_signature(thing.type);
  if (thing.kind == "vector") return "vector_"+thing.size+"_"+thing.base;
  if (thing.kind == "array") return get_type_signature(thing.type);
  if (thing.kind == "array-type") return "array_"+get_type_signature(thing.base);
  if (thing.kind == "pointer" && thing.type.kind == "struct") {
    return "p_" + get_type_signature(thing.type);
  }
  if (thing.kind == "struct") {
    if (thing.hasOwnProperty("type")) thing = thing.type;
    var types = thing.types;
    var parts = [];
    for (var key in types) if (types.hasOwnProperty(key)) {
      parts.push(get_type_signature(types[key]));
    }
    return "struct_" + parts.join("_") + "_";
  }
  if (thing.kind == "closure-poly") {
    return unique_id_for(thing, "closure_poly"); // each poly-closure is "unique"
  }
  if (thing.kind == "function-poly") {
    return unique_id_for(thing, "function_poly"); // each poly-function is "unique"
  }
  if (thing.kind == "closure") {
    var parts = [];
    for (var i = 0; i < thing.args.length; ++i) {
      parts.push(get_type_signature(thing.args[i]));
    }
    return "closure_ret_"+get_type_signature(thing.ret)+"_args_"+parts.join("_")+"_";
  }
  if (thing.kind == "closure-pointer") {
    return "closure_pointer_"+get_type_signature(thing.base.base)+"_"+get_type_signature(thing.fnptr.offset)+"_";
  }
  if (thing.kind == "frame") {
    if (!thing.hasOwnProperty("base")) {
      // just constants in the frame (interp passed to compiled lambda)
      // so specialize the function
      // (TODO do this better somehow?)
      return unique_id_for(thing, "frame_pointer");
    }
    return "frame_pointer"; // cause lambdas are already "unique", there's no need to specialize further
  }
  fail(thing, "unimplemented: type signature for "+JSON.stringify(thing));
}

function flatten_array(thing, args) {
  var array = [];
  var sigparts = [];
  var types = [];
  for (var i = 0; i < args.length; ++i) {
    var sub = flatten(thing, args[i]);
    var signature = get_type_signature(args[i]);
    var subtypes = flatten_type(js_type(args[i]));
    if (subtypes.length != sub.length)
      throw ("internal error - flatten and flatten_type mismatch for "+JSON.stringify(js_type(args[i]))+" of "+JSON.stringify(args[i]));
    sigparts.push(signature);
    for (var k = 0; k < sub.length; ++k) {
      array.push(sub[k]);
    }
    for (var k = 0; k < subtypes.length; ++k) {
      types.push(subtypes[k]);
    }
  }
  // alert("flatten_array("+JSON.stringify(args)+") => "+JSON.stringify(array));
  var signature = sigparts.join("_");
  return {signature: signature, array: array, types: types};
}

function flatten_type_array(types) {
  var js_types = [];
  for (var i = 0; i < types.length; ++i) {
    var sub = flatten_type(types[i]);
    for (var k = 0; k < sub.length; ++k) {
      js_types.push(sub[k]);
    }
  }
  return {signature: js_types.join("_"), js_types: js_types};
}

function reconstruct_by_types(js, types, vars) {
  var take = function(i) {
    if (vars.length < i) throw "reconstruct failure: vars ran out";
    var res = vars.slice(0, i);
    vars = vars.slice(i);
    return res;
  };
  var array = [];
  for (var i = 0; i < types.length; ++i) {
    var type = types[i];
    // type provided in-repl
    if (typeof type == "object" && type.hasOwnProperty('kind') && type.kind == "atom") {
      type = type.value;
    }
    
    if (type == "int" || type == "float" || type == "bool") {
      array.push(take(1)[0]);
      continue;
    }
    if (type.kind == "frame") {
      array.push({kind: "frame", entries: type.entries, base: take(1)[0]});
      continue;
    }
    if (type.kind == "pointer") {
      array.push({kind: "pointer", base: take(1)[0], type: type.type});
      continue;
    }
    if (type.kind == "struct") {
      fail(null, "internal error - reconstruct struct");
      // array.push(js_get_at(type, take(1)[0], 0));
      continue;
    }
    if (type.kind == "vector") {
      var comps = take(type.size);
      var names = new Array(comps.length);
      for (var i = 0; i < comps.length; ++i) {
        var comp = comps[i];
        if (comp.kind != "expr") throw "todo";
        if (comp.type != type.base) throw ("invalid argument type for reconstructing "+type.base+": "+comp.type);
        names[i] = comp.value;
      }
      array.push({kind: "vector", type: type, value: names});
      continue;
    }
    if (type.kind == "array-type") {
      var comps = take(2);
      array.push(new RLArray(type, comps[0], comps[1]));
      continue;
    }
    fail(null, "unimplemented: reconstruct "+JSON.stringify(type));
  }
  if (vars.length) throw "reconstruct failure: vars left over!";
  return array;
}

function js_type(thing) {
  if (thing.kind == "expr" || thing.kind == "struct"
    || thing.kind == "vector" || thing.kind == "array"
    || thing.kind == "function" || thing.kind == "closure"
  ) return thing.type;
  if (thing.kind == "pointer") return {kind: "pointer", type: thing.type};
  if (thing.kind == "frame") return thing; // eesh
  if (thing.kind == "function-poly" || thing.kind == "closure-poly"
   || thing.kind == "function-pointer" || thing.kind == "closure-pointer") {
    if (thing.hasOwnProperty("type")) return thing.type;
    return thing; // Eeesh.
  }
  fail(thing, "what's its type?? "+JSON.stringify(thing));
}

function js_type_size(type) {
  if (type == "float" || type == "int" || type == "bool") return 4;
  if (typeof type == "object") {
    if (type.kind == "vector") {
      var res = js_type_size(type.base) * type.size;
      if (res == 12) res = 16; // vec3 are vec4-sized for 16-alignment reasons
      return res;
    }
    if (type.kind == "struct") return type.size;
    if (type.kind == "array-type") {
      return 8; // two pointers
    }
  }
  fail(type, "what's this type's size?? "+typeof type+" "+JSON.stringify(type));
}

function js_size(thing) {
  if (thing.kind == "expr" || thing.kind == "struct"
    || thing.kind == "vector" || thing.kind == "array"
    || thing.kind == "function" || thing.kind == "closure"
  ) return js_type_size(thing.type);
  if (thing.kind == "pointer") return 4;
  if (thing.kind == "closure-pointer") return 8; // function table offset, heap offset
  if (thing.kind == "function-poly") return 0; // poly function cannot be stored, so encode in type
  if (thing.kind == "closure-poly") {
    // (type closure ...)'d
    if (thing.hasOwnProperty("type") && thing.type.kind == "closure") return 8;
    return 4; // heap offset still
  }
  if (thing.kind == "frame" && thing.hasOwnProperty("base")) return 4;
  fail(thing, "what's its size?? "+typeof thing+" "+JSON.stringify(thing));
}

// turn an array of primitives into a structurally
// equivalent reconstruction of a compound expression
function reconstruct(js, thing, array) {
  if (thing.kind == "expr") {
    var type = thing.type;
    if (type == "float" || type == "int" || type == "bool") {
      if (array.length < 1) fail(thing, "reconstruct:1 internal error");
      if (array[0].kind != "expr" || array[0].type != type) throw ("can't reconstruct "+type+" from "+JSON.stringify(array[0]));
      return {
        value: array[0],
        rest: array.slice(1)};
    }
  }
  if (thing.kind == "vector") {
    if (array.length < thing.type.size) fail(thing, "reconstruct:2 internal error");
    var vars = array.slice(0, thing.type.size);
    for (var i = 0; i < vars.length; ++i) {
      var v = vars[i];
      if (v.kind != "expr" || v.type != thing.type.base) throw ("can't reconstruct vector from "+JSON.stringify(v));
    }
    return {
      value: mkVec_direct(thing.type, vars),
      rest: array.slice(thing.type.size)};
  }
  if (thing.kind == "array") {
    var res = new RLArray(thing.type, array[0], array[1]);
    return { value: res, rest: array.slice(2) };
  }
  if (thing.kind == "frame") {
    if (!thing.hasOwnProperty("base")) {
      // the interpreted-to-compiled case
      return {value: thing, rest: array};
    }
    var base = array[0];
    return {
      value: {
        kind: "frame",
        base: base,
        entries: thing.entries
      },
      rest: array.slice(1)
    };
  }
  if (thing.kind == "closure") {
    if (!thing.hasOwnProperty("value")) {
      // interpreted-to-compiled
      return {value: thing, rest: array};
    }
    fail(thing, "unimplemented: runtime closure");
  }
  if (thing.kind == "closure-pointer") {
    var res = flatclone(thing);
    res.fnptr = flatclone(res.fnptr);
    
    res.base = {kind: "frame", base: array[0]};
    res.fnptr.offset = array[1];
    if (!res.fnptr.offset) throw "what";
    return {value: res, rest: array.slice(2)};
  }
  if (thing.kind == "function-poly") {
    var res = flatclone(thing);
    return {value: res, rest: array};
  }
  if (thing.kind == "closure-poly") {
    var res = flatclone(thing);
    res.base = flatclone(thing.base);
    if (res.base.hasOwnProperty("base")) {
      res.base.base = array[0];
      return {value: res, rest: array.slice(1)};
    } else {
      return {value: res, rest: array};
    }
  }
  if (thing.kind == "struct") {
    fail(thing, "internal issue - cannot pass struct as parameter");
  }
  if (thing.kind == "pointer" && thing.type.kind == "struct") {
    var base = array[0], rest = array.slice(1);
    var type = thing.type;
    
    if (base == null) throw "internal error";
    var value = {kind: "pointer", base: base, type: type};
    return { rest: rest, value: value };
  }
  
  fail(thing, "unimplemented: reconstruct "+thing.kind);
}

function reconstruct_array(js, args, array) {
  // log("reconstruct_array("+JSON.stringify(args)+", array "+JSON.stringify(array)+")");
  var inside = [];
  for (var i = 0; i < args.length; ++i) {
    var ret = reconstruct(js, args[i], array);
    inside.push(ret.value);
    array = ret.rest;
  }
  if (array.length > 0) fail(args[0], "internal logic error");
  return inside;
}

/** @constructor */
function Parser(text, fulltext_or_rowbase) {
  var rowbase = 0;
  var fulltext = null;
  if (typeof fulltext_or_rowbase == "number") rowbase = fulltext_or_rowbase;
  else fulltext = fulltext_or_rowbase;
  
  if (!fulltext) fulltext = text;
  this.text = text;
  this.fulltext = fulltext;
  this.rowbase = rowbase;
  
  this.fulltext_lines = this.fulltext.split("\n");
  
  this.clean = function() {
    // eat leading space or comments
    this.text = this.text.replace(/^(\s+|;[^\n]*\n)+/g, '');
  };
  this.getLocation = function(text) {
    var left_lines = text.split("\n");  // TODO figure out a way to make faster??
    var line = this.fulltext_lines.length - left_lines.length;
    var full_line = this.fulltext_lines[line];
    var column = full_line.length - left_lines[0].length;
    return {row: line + this.rowbase, column: column};
  };
  this.getLineBefore = function(text) {
    var loc = this.getLocation(text);
    return this.fulltext_lines[loc.row - this.rowbase].slice(0, loc.column);
  };
  this.fail = function(info) {
    var where = this.getLocation(this.text);
    log((where.row+1)+":"+where.column+": "+info);
    throw info;
  };
  this.accept = function(str) {
    this.clean();
    if (this.text.substr(0, Math.min(this.text.length, str.length)) == str) {
      this.text = this.text.substr(str.length);
      return true;
    }
    return false;
  };
  this.expect = function(str) {
    if (!this.accept(str)) {
      this.fail("Expected '"+str+"'");
    }
  };
  this.gotIdentifier = function() {
    this.clean();
    var hit = this.text.match(/^([^()\s]+)(\s|[)])/);
    if (!hit) return false;
    this.text = this.text.substr(hit[1].length);
    return hit[1];
  };
  this.gotNumber = function(only_int) {
    this.clean();
    var hit = this.text.match(/^([+-]?(0x[0-9a-fA-F]+|[0-9]+|[0-9]*\.[0-9]*))(\s|[)])/);
    if (!hit) return false;
    var match = hit[1];
    var removed = 0;
    if (match.slice(0,1) == "+") {
      match = match.slice(1);
      removed += 1;
    }
    if (match.slice(0,2) == "0x") {
      // hex literal
      this.text = this.text.substr(match.length + removed);
      return parseInt(match.slice(2), 16);
    }
    if (only_int) {
      var res = parseInt(match, 10);
      if (""+res == match) {
        this.text = this.text.substr(match.length + removed);
        return res;
      }
      return false;
    }
    this.text = this.text.substr(match.length + removed);
    return parseFloat(match, 10);
  };
  this.gotInt = function() { return this.gotNumber(true); };
  this.eof = function() {
    this.clean();
    return this.text.length === 0;
  };
}

/** @constructor */
function IndentChecker() {
  this.depth = 0;
  this.leads = {};
  this.checkOpen = function(text_at, parser, failHere) {
    var linehead = parser.getLineBefore(text_at);
    if (/^\s*$/.test(linehead)) {
      if (this.leads.hasOwnProperty(this.depth)) {
        var lead = this.leads[this.depth];
        if (lead.length != linehead.length) {
          failHere("Wrong indentation: At col "+linehead.length+" but previous col was "+lead.length+"! Did you forget to close a bracket?");
        }
      } else {
        this.leads[this.depth] = linehead;
      }
    }
  };
  this.open = function() { this.depth++; };
  this.close = function() { delete this.leads[this.depth]; this.depth--; };
}

function sexpr_parse(context, parser, indentchecker) {
  if (typeof indentchecker == "undefined") indentchecker = new IndentChecker;
  
  var thing = {};
  
  parser.clean(); // remove detritus for text_at
  var text_at = parser.text;
  var text_post = text_at;
  var failHere = function(info) {
    var loc1 = parser.getLocation(text_at);
    var loc2 = parser.getLocation(text_post);
    log((loc1.row+1)+":"+loc1.column+": "+info);
    
    window.setErrorAt(loc1, loc2, info);
    
    throw new AlreadyInformedError(info);
  };
  thing.fail = failHere;
  
  var quoted = false;
  if (parser.accept("'")) quoted = true;
  
  var quasiquoted = false;
  if (parser.accept("`")) quasiquoted = true;
  
  var unquoted = false;
  if (parser.accept(",")) unquoted = true;
  
  if (quoted + quasiquoted + unquoted > 1) {
    parser.fail("what are you even doing here man");
  }
  
  var makething = function(args) {
    for (var key in args) if (args.hasOwnProperty(key)) {
      thing[key] = args[key];
    }
    if (quoted) {
      thing = {kind: "quote", value: thing, fail: thing.fail};
    }
    if (quasiquoted) {
      thing = {kind: "list", fail: thing.fail, value: [
        {kind: "atom", fail: thing.fail, value: "quasiquote"},
        thing
      ]};
    }
    if (unquoted) {
      thing = {kind: "list", fail: thing.fail, value: [
        {kind: "atom", fail: thing.fail, value: "unquote"},
        thing
      ]};
    }
    return thing;
  };
  
  if (parser.accept("(")) {
    text_post = parser.text;
    indentchecker.checkOpen(text_at, parser, failHere);
    indentchecker.open();
    var sexpr = [];
    while (true) {
      if (parser.accept(")")) break;
      sexpr.push(sexpr_parse(context, parser, indentchecker));
    }
    indentchecker.close();
    text_post = parser.text;
    return makething({kind: "list", value: sexpr});
  }
  var num = parser.gotInt();
  if (num !== false) {
    text_post = parser.text;
    return makething({kind: "expr", type: "int", value: num});
  }
  var number = parser.gotNumber();
  if (number !== false) {
    text_post = parser.text;
    return makething({kind: "expr", type: "float", value: number});
  }
  var ident = parser.gotIdentifier();
  if (ident !== false) {
    text_post = parser.text;
    // syntax shortcut: a:b is (: a b)  (property access is very, very common)
    if (ident.indexOf(":") != -1 && ident != ":") {
      var parts = ident.split(":");
      var atoms = [];
      atoms.push({kind: "atom", value: ":", fail: failHere});
      for (var i = 0; i < parts.length; ++i) {
        // TODO more specific fail function
        atoms.push({kind: "atom", value: parts[i], fail: failHere});
      }
      return makething({kind: "list", value: atoms});
    }
    return makething({kind: "atom", value: ident});
  }
  text_post = parser.text.slice(1);
  failHere("unexpected input");
}

function match_op(thing, ident) {
  if (thing.kind != "list") return false;
  var list = thing.value;
  if (list.length == 0) return false;
  if (list[0].kind != "atom") return false;
  var name = list[0].value;
  if (name != ident) return false;
  return true;
}

/** @constructor */
function LambdaProps(arglist, argnames, body, thing, scope) {
  this.arglist = arglist;
  this.argnames = argnames;
  this.body = body;
  this.thing = thing;
  this.scope = scope;
  this.rewriteWith = function(nbody) {
    var list = [];
    list.push({kind: "atom", value: (this.scope == "stack")?"local-lambda":"lambda"});
    list.push(this.arglist);
    list.push(nbody);
    return {
      kind: "list",
      fail: this.thing.fail,
      value: list
    };
  };
}

function match_lambda(thing) {
  var scope = "heap";
  if (match_op(thing, "local-lambda")) scope = "stack";
  else if (!match_op(thing, "lambda")) return null;
  var args = thing.value.slice(1);
  
  if (args.length != 2) fail(thing, "'lambda' expected 2 args");
  if (args[0].kind != "list") fail(args[0], "'lambda' expected list of parameter names "+JSON.stringify(thing));
  
  var argnames = [];
  for (var i = 0; i < args[0].value.length; ++i) {
    var argn = args[0].value[i];
    if (argn.kind != "atom") fail(argn, "'lambda' expected atom as parameter name");
    argnames.push(argn.value);
  }
  
  var body = args[1];
  return new LambdaProps(args[0], argnames, body, thing, scope);
}

/**
 * Convert nested lambdas into explicit closures using %make-closure.
 * In the process, nested lambdas are moved into the global namespace
 * and references to captured variables are replaced with indirect accesses
 * via a frame pointer.
 **/
function convert_closures(context, thing) {
  var base_recurse = function(thing, fn) {
    var makestruct_props = match_makestruct(thing);
    if (makestruct_props) {
      return makestruct_props.rewriteWith(function(name, value) {
        return fn(value);
      });
    }
    
    if (thing.kind == "list") {
      var res = [];
      for (var i = 0; i < thing.value.length; ++i) {
        var replace = fn(thing.value[i]);
        // unwrap arrays, used to expand (self ...) to (self %parentframe ...)
        if (Array.isArray(replace)) {
          for (var k = 0; k < replace.length; ++k) {
            res.push(replace[k]);
          }
        } else {
          res.push(replace);
        }
      }
      return {
        kind: "list",
        fail: thing.fail,
        value: res
      };
    }
    return thing;
  };
  
  var var_wrap = function(body, entry, value) {
    var varname = {kind: "quote", value: {
      kind: "atom",
      value: entry.rname
    }};
    return list("%seq2_3",
      list("%set-framevar", "%stackframe", varname, value),
      body,
      list("%unset-framevar", "%stackframe", varname));
  };
  
  var converted_lambdas = [];
  
  var convert_lambda = function(lambda) {
    // log("==CONVERT_LAMBDA==");
    // log("== "+sexpr_dump(lambda.thing));
    var vars = [];
    var vars_scope = "stack";
    for (var i = 0; i < lambda.argnames.length; ++i) {
      var name = lambda.argnames[i];
      vars.push({
        name: name,
        rname: unique_id("arg")+"_"+filter_string(name),
        accessed_from_sub: false,
        thing: lambda.thing
      });
    }
    
    // since convert walks the lambda body in the same order
    // as check_vars does, we can just increment vars_rewrite_index
    // whenever we hit a variable
    var vars_rewrite_index = lambda.argnames.length;
    
    var convert = function(lambda) {
      // log("==CONVERT==");
      // log("== "+sexpr_dump(lambda.thing));
      var rec_var = function(thing, in_nested, lookup) {
        if (thing.kind == "atom") {
          return lookup(thing.value, "%stackframe") || thing;
        }
        
        var let1_props = match_let1(thing);
        if (let1_props) {
          var name = let1_props.name;
          // log("debug: ", name, "in", sexpr_dump(thing));
          var nvalue = rec_var(let1_props.value, in_nested, lookup);
          var varinfo = null;
          if (!in_nested) {
            varinfo = vars[vars_rewrite_index++];
            if (!varinfo) {
              throw "tried to access "+(vars_rewrite_index-1)+" of "+vars.length+" ("+name+")";
            }
            if (varinfo.name != name) throw "internal error";
          }
          
          if (!varinfo || !varinfo.accessed_from_sub) {
            var nbody = rec_var(let1_props.body, in_nested, function(n, base) {
              if (n == let1_props.name) return null; // mask
              return lookup(n, base);
            });
            return let1_props.rewriteWith(nvalue, nbody);
          }
          
          var nbody = rec_var(let1_props.body, in_nested, function(n, base) {
            if (n == let1_props.name) {
              // log("rewrite nested access to", n, "via", base);
              var access = list(":", base, varinfo.rname);
              access.value[2].fail = varinfo.thing.fail;
              return unroll_macros(context, access);
            }
            return lookup(n, base);
          });
          
          return var_wrap(nbody, varinfo, nvalue);
        }
        
        var lambda_props = match_lambda(thing);
        if (lambda_props) {
          var nbody = rec_var(lambda_props.body, true, function(n, track) {
            for (var i = 0; i < lambda_props.argnames.length; i++) {
              if (lambda_props.argnames[i] == n) return null; // mask
            }
            // access over lambda border, use parameter instead of variable
            var res = lookup(n, "%parentframe");
            // log("convert", n, "to", sexpr_dump(res));
            return res;
          });
          
          return lambda_props.rewriteWith(nbody);
        }
        
        return base_recurse(thing, function(thing) { return rec_var(thing, in_nested, lookup); });
      };
      
      var rec_lift = function(thing) {
        var lambda_props = match_lambda(thing);
        if (lambda_props) {
          var lambda_name = unique_id("%lambda");
          
          var nargs = ["%parentframe"].concat(lambda_props.argnames);
          
          var nthing = list("lambda",
            list.apply(this, nargs),
            lambda_props.body
          );
          nthing.fail = thing.fail;
          
          var nlambdaprop = match_lambda(nthing);
          if (!nlambdaprop) throw "internal error";
          
          var ndef = list("def", lambda_name, convert_lambda(nlambdaprop));
          
          converted_lambdas.push(ndef);
          
          var res = list("%make-closure", lambda_name, "%stackframe");
          res.fail = thing.fail;
          return res;
        }
        
        return base_recurse(thing, rec_lift);
      };
      
      // setup for parameters that belong in the frame
      var nbody = rec_lift(rec_var(lambda.body, false, function(n, base) {
        for (var i = 0; i < lambda.argnames.length; ++i) {
          var name = lambda.argnames[i];
          var varentry = vars[i];
          if (varentry.name != name) throw "internal error";
          if (name == n) {
            if (varentry.accessed_from_sub) {
              var access = list(":", base, varentry.rname);
              access.value[2].fail = varentry.thing.fail;
              return unroll_macros(context, access);
            }
          }
        }
      }));
      for (var i = lambda.argnames.length - 1; i >= 0; --i) {
        var name = lambda.argnames[i];
        var varentry = vars[i];
        if (varentry.name != name) throw "internal error";
        if (varentry.accessed_from_sub) {
          nbody = var_wrap(nbody, varentry, name);
        }
      }
      var frame_fun = (vars_scope == "stack")?"%make-frame-stack":"%make-frame";
      return lambda.rewriteWith(
        list("let1",
          list("%stackframe", list(frame_fun)),
          nbody
        )
      );
    };
    
    var check_vars = function() {
      var rec = function(thing, in_nested, lookup) {
        if (thing.kind == "atom") {
          lookup(thing.value); // touch
          return;
        }
        
        var let1_props = match_let1(thing);
        if (let1_props) {
          rec(let1_props.value, in_nested, lookup);
          var name = let1_props.name;
          var varinfo = null;
          if (!in_nested) {
            varinfo = {
              name: name,
              rname: unique_id("var")+"_"+filter_string(name),
              accessed_from_sub: false,
              num_accesses: 0,
              thing: let1_props.thing
            }
            vars.push(varinfo);
          }
          rec(let1_props.body, in_nested, function(n, track, scope) {
            if (varinfo && n == let1_props.name) {
              if (track) {
                varinfo.accessed_from_sub = true;
                // at least one access from a heap-allocated lambda
                if (scope == "heap") vars_scope = "heap";
              }
              varinfo.num_accesses ++;
              return null;
            }
            return lookup(n, track, scope);
          });
          return;
        }
        
        var lambda_props = match_lambda(thing);
        if (lambda_props) {
          rec(lambda_props.body, true, function(n, track, scope) {
            for (var i = 0; i < lambda_props.argnames.length; i++) {
              if (lambda_props.argnames[i] == n) return null; // mask
            }
            // access over lambda border, activate tracking
            return lookup(n, true, lambda_props.scope);
          });
          return;
        }
        
        base_recurse(thing, function(thing) { rec(thing, in_nested, lookup); return thing; });
      };
      rec(lambda.body, false, function(n, track, scope) {
        for (var i = 0; i < lambda.argnames.length; ++i) {
          var name = lambda.argnames[i];
          if (name == n) {
            if (track) {
              vars[i].accessed_from_sub = true;
              if (scope == "heap") vars_scope = "heap";
            }
            return null;
          }
        }
      });
    };
    
    check_vars();
    
    // log("vars:");
    var anyAccessedFromSub = false;
    for (var i = 0; i < vars.length; ++i) {
      if (vars[i].accessed_from_sub) anyAccessedFromSub = true;
      // log("  ", vars[i].name, " ", vars[i].accessed_from_sub);
    }
    
    if (false && !anyAccessedFromSub) {
      return lambda.thing; // original
    }
    
    return convert(lambda);
  }
  
  var rec_find_top_lambdas = function(thing, lookup) {
    var lambdaprop = match_lambda(thing);
    if (lambdaprop) {
      return convert_lambda(lambdaprop);
    }
    
    return base_recurse(thing, function(thing) { return rec_find_top_lambdas(thing, lookup); });
  };
  
  // log("X: ", sexpr_dump(thing));
  var nthing = rec_find_top_lambdas(thing, function(n) { return context.lookup(n); });
  
  var array = converted_lambdas.concat([nthing]);
  
  // log("Y: ", sexpr_dump(array));
  return array;
}

/** @constructor */
function Let1Props(name, value, bind, body, thing, ident) {
  this.name = name;
  this.value = value;
  this.bind = bind;
  this.body = body;
  this.thing = thing;
  this.ident = ident;
  this.rewriteWith = function(nvalue, nbody) {
    return {
      kind: "list",
      fail: this.thing.fail,
      value: [
	{kind: "atom", value: this.ident},
	{
	  kind: "list",
	  fail: this.thing.value[1].fail,
	  value: [
	    {kind: "atom", value: this.name, fail: this.bind.value[0].fail},
	    nvalue
	  ]
	},
	nbody
      ]
    };
  };
}

function match_let1(thing, as_alias) {
  var myident = as_alias?"alias1":"let1";
  
  if (!match_op(thing, myident)) return null;
  
  var args = thing.value.slice(1);
  if (args.length != 2) fail(thing, "'"+myident+"' expects two arguments");
  
  var bind = args[0];
  if (bind.kind != "list"
   || bind.value.length != 2
   || bind.value[0].kind != "atom"
  )
    fail(bind, "'"+myident+"' expects (name value) pair, not "+sexpr_dump(thing));
  
  return new Let1Props(bind.value[0].value, bind.value[1], bind, args[1], thing, myident);
}

function unroll_macros(context, thing) {
  var rec = function(thing, lookup) {
    if (thing.kind == "list" && thing.value.length > 0 && thing.value[0].kind == "atom") {
      var let1 = match_let1(thing);
      if (let1) {
        var name = let1.name;
        var value = let1.value;
        var nvalue = rec(value, lookup);
        var nbody = rec(let1.body, function(n) {
          if (n == name) return null; // mask
          return lookup(n);
        });
        return let1.rewriteWith(nvalue, nbody);
      }
      
      var lambda = match_lambda(thing);
      if (lambda) {
        var argnames = lambda.argnames;
        var body = lambda.body;
        var nbody = rec(body, function(n) {
          for (var i = 0; i < argnames.length; ++i)
            if (n == argnames[i]) return null; // mask
          return lookup(n);
        });
        return lambda.rewriteWith(nbody);
      }
      
      var name = thing.value[0].value;
      var op = lookup(name);
      // log(sexpr_dump(thing));
      // log(name, " - ", typeof op, " ", JSON.stringify(op));
      if (op && op.kind == "macro") {
        thing = op.evalMacro(context, thing);
        // log("> unwrap to ", sexpr_dump(thing));
        // log("");
        return thing;
      }
    }
    // do regular argument rewrite
    if (thing.kind == "list") {
      var res = [];
      for (var i = 0; i < thing.value.length; ++i) {
        res.push(rec(thing.value[i], lookup));
      }
      return {
        kind: "list",
        fail: thing.fail,
        value: res
      };
    }
    return thing;
  };
  var res = rec(thing, function(n) { return context.lookup(n); });
  // log("1: ", sexpr_dump(thing));
  // log("2: ", sexpr_dump(res));
  return res;
}

function sexpr_dump(thing) {
  if (thing == null) return "nil";
  
  if (thing.kind == "atom") return thing.value;
  else if (thing.kind == "quote") return "'"+sexpr_dump(thing.value);
  else if (thing.kind == "list") {
    var dlist = [];
    for (var i = 0; i < thing.value.length; ++i) {
      dlist.push(sexpr_dump(thing.value[i]));
    }
    return "("+dlist.join(" ")+")";
  }
  /*else if (thing.hasOwnProperty('fail')) {
    thing.fail("what is even "+thing.kind);
  }*/
  else if (thing.kind == "expr") {
    return "<"+thing.type+" "+thing.value+">";
  }
  else if (typeof thing == "function") {
    return "<function>";
  }
  else if (Array.isArray(thing)) { // not quite proper, but I'll allow it
    var res = [];
    for (var i = 0; i < thing.length; ++i) {
      res.push(sexpr_dump(thing[i]));
    }
    return "[ "+res.join(" , ")+" ]";
  }
  else return "magical unicorn "+JSON.stringify(thing);
}

function mkVec_direct(type, array) {
  var values = new Array(array.length);
  for (var i = 0; i < type.size; ++i) {
    if (JSON.stringify(type.base) != JSON.stringify(array[i].type)) {
      var converted = js_as_type(type.base, array[i]);
      if (converted === null) {
        fail(array[i], "vector must be made of '"+type.base+"', not '"+array[i].type+"'");
      }
      values[i] = converted;
    } else {
      values[i] = array[i].value;
    }
    if (values[i] == null) throw "what what what";
  }
  return {kind: "vector", type: type, value: values};
}

function mkVec(js, type, vars) {
  var nvars = [];
  for (var i = 0; i < vars.length; ++i) {
    nvars.push(js.mkVar(vars[i], type.base, "v"+i));
  }
  return mkVec_direct(type, nvars);
}

function copy(js, thing) {
  if (thing === null) return null;
  if (thing.kind == "function") return thing; // hopeless
  if (thing.kind == "expr") {
    return js.mkVar(thing.value, thing.type, "copy");
  }
  if (thing.kind == "vector") {
    js.nop();
    return mkVec(js, thing.type, thing.value);
  }
  if (thing.kind == "closure-poly") {
    var res = flatclone(thing);
    res.base = flatclone(res.base);
    res.base.base = copy(js, res.base.base);
    return res;
  }
  if (thing.kind == "closure-pointer") {
    var res = flatclone(thing);
    res.base = flatclone(res.base);
    res.fnptr = flatclone(res.fnptr);
    res.base.base = copy(js, res.base.base);
    res.fnptr.offset = copy(js, res.fnptr.offset);
    return res;
  }
  if (thing.kind == "pointer" && thing.hasOwnProperty("base")) {
    return {kind: "pointer", base: copy(js, thing.base), type: thing.type};
  }
  if (thing.kind == "struct" && thing.hasOwnProperty("base")) {
    return js_get_at(thing.type, copy(js, thing.base), 0);
  }
  if (thing.kind == "array") {
    return new RLArray(thing.type, copy(js, thing.ptr), copy(js, thing.size));
  }
  if (thing.kind == "frame" && thing.hasOwnProperty("base")) {
    var res = flatclone(thing);
    res.base = copy(js, res.base);
    return res;
  }
  fail(thing, "how copy "+thing.kind+" "+JSON.stringify(thing));
}

// unbind lvalue semantics - translate: delete thing.set
function unbind_lv(thing) {
  if (!thing || !thing.hasOwnProperty("set")) return thing;
  thing = flatclone(thing);
  delete thing.set;
  return thing;
}

function let1_internal(context, thing, rest) {
  var let1_props = match_let1(thing);
  if (!let1_props) throw "internal error";
  
  var name = let1_props.name;
  var value = let1_props.value;
  
  var letctx = new Context(context);
  
  if (letctx.js) {
    value = copy(letctx.js, letctx.eval(value));
  } else {
    value = letctx.eval(value);
  }
  value = unbind_lv(value);
  
  // if (value == null) fail(let1_props.thing.value[1], "'let' value is null");
  // if (value == null) log("debug let1:", name, "=", sexpr_dump(value), " ("+((value == null)?"null":"defined")+") from ", sexpr_dump(let1_props.value));
  letctx.add(name, value);
  return letctx.eval(let1_props.body);
}

function alias1_internal(context, thing, rest) {
  var alias1_props = match_let1(thing, true);
  if (!alias1_props) throw "internal error";
  
  var name = alias1_props.name;
  var value = alias1_props.value;
  
  value = unbind_lv(context.eval(value));
  
  var aliasctx = new Context(context);
  aliasctx.add(name, value); // the difference - no copy()!
  return aliasctx.eval(alias1_props.body);
}

function def_internal(context, thing, rest) {
  if (rest.length != 2) fail(thing, "expect two arguments for 'def'");
  if (rest[0] == null) fail(thing, "invalid argument for 'def'");
  if (rest[0].kind != "atom") fail(rest[0], "expect name for 'def'");
  
  var name = rest[0].value;
  var valuepar = rest[1];
  
  var backup_namehint = context.namehint;
  context.namehint = name;
  
  var value = null;
  if (context.js) {
    value = copy(context.js, context.eval(valuepar));
  } else {
    value = context.eval(valuepar);
    if (value == null) fail(thing, "'def' value is null");
    value = unbind_lv(value);
  }
  context.namehint = backup_namehint;
  
  var toplevel = context;
  if (!toplevel.hasOwnProperty("toplevel")) fail(thing, "'def' only permitted at the top level."+context.info());
  toplevel.add(name, value);
  
  return value;
}

function js_set(js, thing, target, value) {
  if (target == null || value == null) fail(thing, "what");
  
  if (target.kind == "expr" && value.kind == "expr") {
    if (JSON.stringify(target.type) != JSON.stringify(value.type)) {
      var converted = js_as_type(target.type, value);
      if (converted === null) {
        fail(thing, "mismatch: assigning "+value.type+" to "+target.type);
      }
      value = {kind: "expr", type: target.type, value: converted};
    }
    js.set(target.type, target.value, value.value);
    return;
  }
  if (target.kind == "frame" && value.kind == "frame") {
    if (!target.hasOwnProperty("base") || !value.hasOwnProperty("base"))
      fail(thing, "frame-assignment only works if base is defined .. I think?");
    js_set(js, thing, target.base, value.base);
    delete target.entries; // Unsafe!!
    return;
  }
  if (target.kind == "pointer" && value.kind == "pointer") {
    if (JSON.stringify(target.type) != JSON.stringify(value.type)) {
      fail(thing, "struct type mismatch!");
    }
    js_set(js, thing, target.base, value.base);
    return;
  }
  if (target.kind == "struct" && value.kind == "struct") {
    var tv = target.value, vv = value.value;
    for (var key in tv)
      if (tv.hasOwnProperty(key) && !vv.hasOwnProperty(key))
        value.fail("mismatch: target property '"+key+"' not in value");
    for (var key in vv)
      if (vv.hasOwnProperty(key) && !tv.hasOwnProperty(key))
        target.fail("mismatch: value property '"+key+"' not in target");
    for (var key in tv) if (tv.hasOwnProperty(key)) {
      js_set(js, thing, target.value[key], value.value[key]);
    }
    return;
  }
  if (target.kind == "function-poly" && value.kind == "function-poly") {
    return; // encoded in signature, no value
  }
  if (target.kind == "closure-poly" && value.kind == "closure-poly") {
    if (JSON.stringify(target.base.entries) != JSON.stringify(value.base.entries))
      fail(thing, "incompatible/mismatched poly closures (from different lexical locations) - cannot assign. maybe typehint?");
    js.set("int", target.base.base.value, value.base.base.value);
    return;
  }
  if (target.kind == "closure-pointer") {
    if (value.kind == "closure-poly") {
      value = value.withFixedType(js, target.type);
    }
    if (value.kind != "closure-pointer") fail(thing, "cannot assign: type mismatch, target is closure-pointer, value is "+value.kind);
    if (JSON.stringify(value.type) != JSON.stringify(target.type))
      fail(thing, "cannot assign: function type mismatch, "+JSON.stringify(target.type)+" != "+JSON.stringify(value.type));
    if (value.signature != target.signature) fail(thing, "internal bug: signature mismatch ('"+value.signature+"' != '"+target.signature+"')");
    js_set(js, thing, target.base.base, value.base.base);
    js_set(js, thing, target.fnptr.offset, value.fnptr.offset);
    return;
  }
  if (target.kind == "vector" && value.kind == "vector") {
    if (JSON.stringify(target.type) != JSON.stringify(value.type)) {
      fail(thing, "cannot assign: vector type mismatch, "+JSON.stringify(target.type)+" != "+JSON.stringify(value.type));
    }
    for (var i = 0; i < target.type.size; ++i) {
      js.set(target.type.base, target.value[i], value.value[i]);
    }
    return;
  }
  if (target.kind == "array" && value.kind == "array") {
    if (JSON.stringify(target.type) != JSON.stringify(value.type)) {
      fail(thing, "cannot assign: array type mismatch, "+JSON.stringify(target.type)+" != "+JSON.stringify(value.type));
    }
    js_set(js, thing, target.ptr, value.ptr);
    js_set(js, thing, target.size, value.size);
    return;
  }
  fail(thing, "unimplemented: "+sexpr_dump(thing)+" -- "+JSON.stringify(target)+" = "+JSON.stringify(value));
}


function set_internal(context, thing, rest) {
  if (rest.length != 2) fail(thing, "'set' expected two arguments, target and value");
  var target = rest[0];
  var value = rest[1];
  
  target = context.eval(target);
  value = context.eval(value);
  
  var js = context.js;
  if (js) {
    if (target.kind == "pointer") {
      var base = js.mkVar(js_tag(target.base), "int", "targetp");
      target = js_get_at(target.type, base, 0);
    }
    if (value.kind == "pointer") {
      var base = js.mkVar(js_tag(value.base), "int", "valuep");
      value = js_get_at(value.type, base, 0);
    }
    js_set(js, thing, target, value);
    // return value;
    return null;
  }
  
  if (target.hasOwnProperty("set")) { // lvalue semantics
    if (target.kind == "struct" && value.kind == "struct") {
      // copy into target to imitate runtime semantics
      for (var key in value.value) if (value.value.hasOwnProperty(key)) {
        // TODO: deeper copy necessary?
        target.value[key] = value.value[key];
      }
    } else {
      target.set(value);
    }
    // return value;
    return null;
  }
  
  fail(target, "'set' requires a target with lvalue semantics as the lhs!");
}

function generic_return(js, thing) {
  if (thing == null) {
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return;");
    return "void";
  }
  else if (thing.kind == "vector") {
    var rplaces = ["_rvec_x", "_rvec_y", "_rvec_z", "_rvec_w"];
    if (thing.type.size > 4 || thing.type.base != "float") {
      fail(thing, "todo return vector of size > 4 or type != float");
    }
    for (var i = 0; i < thing.type.size; ++i) {
      js.set(thing.type.base, rplaces[i], thing.value[i]);
    }
    
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return;");
    return thing.type;
  }
  else if (thing.kind == "array") {
    js.set("int", "_r_arr_ptr", thing.ptr.value);
    js.set("int", "_r_arr_sz", thing.size.value);
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return;");
    return thing.type;
  }
  else if (thing.kind == "expr" && (thing.type == "float" || thing.type == "bool" || thing.type == "int")) {
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return "+js_tag(thing)+";");
    return thing.type;
  }
  else if (thing.kind == "struct") {
    fail(thing, "It is not a good thing to try and return a struct by value!");
    js.set("int", "SP", "BP");
    // js.addLine("return "+js_tag(thing.base)+";");
    // return thing.type;
  }
  else if (thing.kind == "pointer") {
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return "+js_tag(thing.base)+";");
    return {kind: "pointer", type: thing.type};
  }
  else if (thing.kind == "closure-poly") {
    js.set("int", "_cp_base", thing.base.base.value);
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return;");
    return thing;
  }
  else if (thing.kind == "closure-pointer") {
    js.set("int", "_cp_base", thing.base.base.value);
    js.set("int", "_cp_offset", thing.fnptr.offset.value);
    js.set("int", "SP", "BP");
    if (STACK_DEBUG) js.addLine("check_end();");
    js.addLine("return;");
    return thing.type;
  }
  else {
    fail(null, "4 how return "+JSON.stringify(thing));
  }
}

function build_js_call(thing, js, fname, ret_type, flat_args) {
  var arglist = [];
  for (var i = 0; i < flat_args.length; ++i) {
    arglist.push(js_tag(flat_args[i]));
  }
  
  var ret_value = null;
  
  var call = fname+" ("+arglist.join(",")+")";
  
  if (ret_type == "float" || ret_type == "bool" || ret_type == "int") {
    ret_value = js.mkVar(call, ret_type, "retval");
  }
  else if (ret_type == null || ret_type == "void") {
    js.addLine(call+";");
  }
  else if (ret_type.kind == "vector") {
    js.addLine(call+";");
    if (ret_type.base != "float" || ret_type.size > 4) {
      fail(thing, "todo return vector of size > 4 or type != float");
    }
    var array = [];
    var names = ["_rvec_x", "_rvec_y", "_rvec_z", "_rvec_w"];
    for (var i = 0; i < ret_type.size; ++i) {
      array.push(names[i]);
    }
    // immediately copy the return vals elsewhere
    ret_value = copy(js, {
      kind: "vector",
      type: ret_type,
      value: array
    });
  }
  else if (ret_type.kind == "struct") {
    fail(thing, "It is not a good thing to try and return a struct by value!");
    // ret_value = js_get_at(ret_type, ret_base, 0);
  }
  else if (ret_type.kind == "pointer") {
    var ret_base = js.mkVar(call, "int", "ret_base");
    ret_value = {kind: "pointer", base: ret_base, type: ret_type.type};
  }
  else if (ret_type.kind == "closure-poly") {
    js.addLine(call+";");
    ret_value = flatclone(ret_type);
    ret_value.base = flatclone(ret_value.base);
    ret_value.base.base = copy(js, {kind: "expr", type: "int", value: "_cp_base"});
  }
  else if (ret_type.kind == "closure") {
    js.addLine(call+";");
    ret_value = copy(js, new ClosurePointer(
      ret_type,
      {kind: "frame", base: {kind: "expr", type: "int", value: "_cp_base"}},
      {kind: "expr", type: "int", value: "_cp_offset"}
    ));
  }
  else if (ret_type.kind == "array-type") {
    js.addLine(call+";");
    ret_value = copy(js, new RLArray(
      ret_type,
      {kind: "expr", type: "int", value: "_r_arr_ptr"},
      {kind: "expr", type: "int", value: "_r_arr_sz"}
    ));
  }
  else fail(thing, "2 how return "+JSON.stringify(ret_type));
  
  // log("for ", fname, ", ", ret_type, ": ", JSON.stringify(ret_value));
  
  return ret_value;
}

function lambda_internal(context, thing, rest) {
  var namehint = context.getNamehint();
    
  // var contextview = context.clone_frozen(); // limit lexical environment to before here
  var contextview = context;
  
  var lambda_props = match_lambda(thing);
  
  var argnames = lambda_props.argnames;
  var body = lambda_props.body;
  
  var numcalled = 0;
  var inlined_fn = null;
  
  var lambda_thing = {kind: "function-poly", internal: false, arity: argnames.length};
  
  if (thing.hasOwnProperty("fail")) lambda_thing.fail = thing.fail;
  
  var standard_call = function(callctx, callthing, argnames, args) {
    // log("standard call");
    
    var callframe = new Context(contextview, callctx.js);
    
    callframe.namehint = namehint+"_call";
    
    // callframe.add("self", lambda_thing);
    for (var i = 0; i < args.length; ++i) {
      var arg = unbind_lv(args[i]);
      // log("debug call:", argnames[i], "=", sexpr_dump(arg));
      callframe.add(argnames[i], arg);
    }
    
    var res = callframe.eval(body);
    // log("debug return:", namehint, "->", sexpr_dump(res), "from", sexpr_dump(body));
    return res;
  };
  
  var lambda_cache = [];
  var compiling_depth = 0;
  
  // create a version of the lambda adapted for the types of 'args'
  var instantiate_and_call = function(callctx, callthing, args, self) {
    if (args.length != argnames.length) callthing.fail("internal logic error");
    // list all the types of all the individual parameters
    // (decomposing structs and vectors)
    
    var js = callctx.js;
    // log("debug call", namehint);
    if (!js) return standard_call(callctx, callthing, argnames, args);
    
    if (lambda_thing.hasOwnProperty("type")) {
      var type = lambda_thing.type;
      if (type.kind != "function") {
        fail(thing, "function, but not typed as function? (but '"+type.kind+"')");
      }
      if (type.args.length != args.length) {
        fail(callthing, "wrong arity: function typed as expecting "+type.args.length+" args");
      }
      for (var i = 0; i < args.length; ++i) {
        var decltype = type.args[i];
        var argtype = js_type(args[i]);
        if (decltype.kind == "atom") decltype = decltype.value;
        if (JSON.stringify(decltype) != JSON.stringify(argtype)) {
          fail(callthing, "wrong type: function typed as expecting "+JSON.stringify(decltype)+" but called with "+JSON.stringify(argtype)+"!");
        }
      }
    }
    
    var flattened = flatten_array(callthing, args);
    var signature = flattened.signature;
    var flat_args = flattened.array;
    var partypes = flattened.types;
    
    var fn = null;
    var ret_type = null;
    
    // log("sig = "+signature);
    
    if (lambda_cache.hasOwnProperty(signature)) {
      var cached = lambda_cache[signature];
      fn = cached.fn;
      ret_type = cached.ret_type;
    } else {
      fn = js.allocName("f", namehint);
      
      var early_type = null;
      
      if (self.hasOwnProperty("type")) {
        early_type = self.type.ret;
        lambda_cache[signature] = {fn: fn, ret_type: early_type};
      }
      
      var callframe = new Context(contextview, callctx.js);
      
      var parnames = [];
      for (var i = 0; i < partypes.length; ++i) parnames.push("par"+i);
      // for inserting in the "functions" section of the module
      js.openSection("function", "functions");
      js.addLine("// signature: "+signature);
      
      var ret_c_marker = null;
      if (PLATFORM_ELECTRON) {
        ret_c_marker = "__TODO_"+unique_id("type")+"_";
        var parpairs = [];
        for (var i = 0; i < partypes.length; i++) parpairs.push(js_type_to_c(partypes[i])+" "+parnames[i]);
        js.addLine("decls", "static "+js_type_to_c(ret_c_marker)+" "+fn+"("+parpairs.join(", ")+");");
        js.addLine("static "+js_type_to_c(ret_c_marker)+" "+fn+"("+parpairs.join(", ")+") {");
      } else {
        js.addLine("function "+fn+"("+parnames.join(", ")+") {");
      }
      js.indent();
      if (STACK_DEBUG) js.addLine("check_start();");
      
      // declare argument types for asm.js
      for (var i = 0; i < partypes.length; ++i) {
        js.set(partypes[i], parnames[i], parnames[i]);
      }
      
      if (partypes.length) {
        js.addLine("");
      }
      
      js.openSection("variables");
      
      js.openSection("body");
      js.defineVar("BP", "int", "SP", "variables"); // stack base pointer
      
      var abort = function() {
        // discard
        js.popSection("body");
        js.popSection("variables");
        js.popSection("function");
      };
      
      // reform our decomposed parameters back into 'args'
      var inside_flat_arglist = [];
      for (var i = 0; i < partypes.length; ++i) {
        inside_flat_arglist.push({kind: "expr", type: partypes[i], value: parnames[i]});
      }
      
      var inside_args = reconstruct_array(js, args, inside_flat_arglist);
      // log("outside args=", JSON.stringify(args), "for", namehint);
      // log("inside_args=", JSON.stringify(inside_args), "for", namehint);
      
      for (var i = 0; i < argnames.length; ++i) {
        var arg = unbind_lv(inside_args[i]);
        callframe.add(argnames[i], arg);
      }
      
      compiling_depth ++;
      if (compiling_depth > 10) {
        fail(thing, "Function compiled in infinite? (or >10) self-recursion. Are you trying to compile a function that does not have a type?");
      }
      
      var res = callframe.eval(body);
      
      compiling_depth --;
      
      ret_type = generic_return(js, res);
      
      if (early_type && JSON.stringify(early_type) != JSON.stringify(ret_type)) {
        fail(thing, "function return type does not match declared return type: "+JSON.stringify(early_type)+" and "+JSON.stringify(ret_type));
      }
      
      js.closeSection("body");
      js.closeSection("variables");
      
      js.unindent();
      js.addLine("}");
      
      if (PLATFORM_ELECTRON) {
        js.replace(ret_c_marker, js_type_to_c(js_return_type(ret_type)));
      }
      
      var fun = js.popSection("function");
      js.add("functions", fun);
      
      // log("late cache "+fn+": "+signature+": "+ret_type);
      lambda_cache[signature] = {namehint: namehint, fn: fn, ret_type: ret_type};
    }
    
    if (flat_args.length != partypes.length) callthing.fail("internal logic error");
    
    // js.addLine('alert_("call '+namehint+'");');
    return build_js_call(callthing, js, fn, ret_type, flat_args);
  };
  
  lambda_thing.namehint = namehint;
  lambda_thing.withFixedType = function(js, type) {
    var flattened = flatten_type_array(type.args);
    var sign = flattened.signature;
    var partypes = flattened.js_types;
    
    // log("emit body for withFixedType(js, "+JSON.stringify(type)+")");
    
    var parnames = [];
    for (var i = 0; i < partypes.length; ++i) parnames.push("par"+i);
    
    var fn = js.allocName("f", namehint);
    
    // for inserting in the "functions" section of the module
    js.openSection("function", "functions");
    var ret_c_marker = null;
    if (PLATFORM_ELECTRON) {
      ret_c_marker = "__TODO_"+unique_id("type")+"_";
      var parpairs = [];
      for (var i = 0; i < partypes.length; i++) parpairs.push(js_type_to_c(partypes[i])+" "+parnames[i]);
      js.addLine("decls", "static "+js_type_to_c(ret_c_marker)+" "+fn+"("+parpairs.join(", ")+");");
      js.addLine("static "+js_type_to_c(ret_c_marker)+" "+fn+"("+parpairs.join(", ")+") {");
    } else {
      js.addLine("function "+fn+"("+parnames.join(", ")+") {");
    }
    js.indent();
    if (STACK_DEBUG) js.addLine("check_start();");
    
    // declare argument types for asm.js
    for (var i = 0; i < partypes.length; ++i) {
      js.set(partypes[i], parnames[i], parnames[i]);
    }
    
    if (partypes.length) {
      js.addLine("");
    }
    
    js.openSection("variables");
    
    js.openSection("body");
    js.defineVar("BP", "int", "SP", "variables"); // stack base pointer
    
    // reform our decomposed parameters back into 'type.args'
    var inside_flat_arglist = [];
    for (var i = 0; i < partypes.length; ++i) {
      inside_flat_arglist.push({kind: "expr", type: partypes[i], value: parnames[i]});
    }
    
    var inside_args = reconstruct_by_types(js, type.args, inside_flat_arglist);
    
    var callframe = new Context(contextview, js);
    
    for (var i = 0; i < argnames.length; ++i) {
      callframe.add(argnames[i], inside_args[i]);
    }
    
    var res = callframe.eval(body);
    
    var ret_type = generic_return(js, res);
    
    if (JSON.stringify(ret_type) != JSON.stringify(type.ret)) {
      fail(thing, "declared return type does not match actual return type - "+JSON.stringify(ret_type)+" != "+JSON.stringify(type.ret));
    }
    
    js.closeSection("body");
    js.closeSection("variables");
    
    js.unindent();
    js.addLine("}");
    
    if (PLATFORM_ELECTRON) {
      js.replace(ret_c_marker, js_type_to_c(js_return_type(ret_type)));
    }
    
    var fun = js.popSection("function");
    js.add("functions", fun);
    
    return {
      kind: "function",
      signature: sign,
      ret: ret_type,
      args: structs_to_pointers(type.args),
      fname: fn
    };
  };
  lambda_thing.call = function(callctx, callthing, args) {
    if (argnames.length != args.length) {
      fail(callthing, "lambda call expected "+argnames.length+" arguments, but called with "+args.length);
    }
    
    return instantiate_and_call(callctx, callthing, args, this);
  };
  
  return lambda_thing;
}

function macro_internal(context, thing, rest) {
  if (rest.length != 2) thing.fail("expect two arguments for 'macro'");
  if (rest[0].kind != "list") rest[0].fail("expect parameter list for 'macro'");
  var argnames = [];
  for (var i = 0; i < rest[0].value.length; ++i) {
    var argname = rest[0].value[i];
    if (argname.kind != "atom")
      argname.fail("expect name for parameter");
    argnames.push(argname.value);
  }
  return {
    kind: "macro",
    evalMacro: function(callctx, callthing) {
      var args = callthing.value.slice(1);
      var variadic = false;
      if (argnames.length && argnames[argnames.length-1] == "...") {
        // variadic mode
        variadic = true;
        if (args.length < argnames.length - 1) {
          fail(callthing, "macro call expected at least "+(argnames.length-1)+" arguments");
        }
      } else {
        if (argnames.length != args.length) {
          fail(callthing, "macro call expected "+argnames.length+" arguments");
        }
      }
      var callframe = new Context(context);
      if (variadic) {
        for (var i = 0; i < argnames.length - 1; ++i) {
          var arg = unbind_lv(args[i]);
          callframe.add(argnames[i], arg);
        }
        callframe.add("...", {
          kind: "list",
          fail: callthing.fail,
          value: args.slice(argnames.length - 1)
        });
      } else {
        for (var i = 0; i < args.length; ++i) {
          // log("for macro:", argnames[i], " = ", sexpr_dump(args[i]));
          var arg = unbind_lv(args[i]);
          callframe.add(argnames[i], arg); // add unevaluated
        }
      }
      var res = callframe.eval(rest[1]);
      // log("A: ", sexpr_dump(res));
      res = unroll_macros(callctx, res);
      // log("B: ", sexpr_dump(res));
      return res;
    }
  };
}

function match_if(thing) {
  if (!match_op(thing, "if")) return null;
  
  var args = thing.value.slice(1);
  if (args.length != 2 && args.length != 3) {
    fail(thing, "'if' expected either two or three arguments");
  }
  
  var test = args[0];
  var branch_true = args[1];
  var branch_false = null;
  if (args.length == 3) branch_false = args[2];
  return {
    test: test,
    branch_true: branch_true,
    branch_false: branch_false
  };
}

function if_internal(context, thing, rest) {
  var if_prop = match_if(thing);
  var test = context.eval(if_prop.test);
  // log("test is "+JSON.stringify(test));
  if (lit_bool(test)) {
    if (test.value == true) {
      return context.eval(if_prop.branch_true);
    } else if (if_prop.branch_false) {
      return context.eval(if_prop.branch_false);
    } else return null;
  }
  var js = context.js;
  if (!js) fail(thing, "could not evaluate test condition at compile time; was "+JSON.stringify(test));
  if (test.kind == "expr" && test.type == "bool") {
    var case1_js = null, case2_js = null;
    var phi = null;
    js.indent();
    
    js.openSection("case1");
    var case1 = context.eval(if_prop.branch_true);
    case1_js = js.popSection("case1");
    if (if_prop.branch_false) {
      js.openSection("case2");
      var case2 = context.eval(if_prop.branch_false);
      case2_js = js.popSection("case2");
      if (case1 && !case2 || case2 && !case1) {
        thing.fail("eval mismatch between if branches");
      }
      if (!case1 && !case2) { } // phi is null, and that is fine
      else {
        var merge_amend = function(after1, after2) {
          js.indent();
          js.openSection("case1");
          js.add(case1_js);
          
          after1();
          
          case1_js = js.popSection("case1");
          js.openSection("case2");
          js.add(case2_js);
          
          after2();
          case2_js = js.popSection("case2");
        };
        
        if (case1.kind == "expr" && case2.kind == "expr") {
          var unify = js_unify_vars(case1, case2);
          case1 = unify.left;
          case2 = unify.right;
          js.unindent();
          phi = js.mkVar(null, case1.type, "phi");
          merge_amend(
            function() { js.set(case1.type, phi.value, case1.value); },
            function() { js.set(case1.type, phi.value, case2.value); });
        } else if (case1.kind == "vector" && case2.kind == "vector") {
          if (JSON.stringify(case1.type) != JSON.stringify(case2.type)) {
            fail(thing, "type mismatch between structs in if branches: "+JSON.stringify(case1.type)+" and "+JSON.stringify(case2.type));
          }
          js.unindent();
          var nulls = [];
          for (var i = 0; i < case1.type.size; ++i) {
            nulls.push({kind: "expr", type: "float", value: 0});
          }
          phi = mkVec(js, case1.type, nulls);
          merge_amend(
            function() {
              js_set(js, thing, phi, case1);
            },
            function() {
              js_set(js, thing, phi, case2);
            });
        } else if (case1.kind == "pointer" && case2.kind == "pointer") {
          if (JSON.stringify(case1.type) != JSON.stringify(case2.type)) {
            fail(thing, "type mismatch between pointers in if branches: "+JSON.stringify(case1.type)+" and "+JSON.stringify(case2.type));
          }
          js.unindent();
          var phivar = js.mkVar(null, "int", "phiptr");
          phi = {kind: "pointer", base: phivar, type: case1.type};
          merge_amend(
            function() { js.set("int", phivar.value, case1.base.value); },
            function() { js.set("int", phivar.value, case2.base.value); });
        } else if (case1.kind == "struct" && case2.kind == "struct") {
          if (JSON.stringify(case1.type) != JSON.stringify(case2.type)) {
            fail(thing, "type mismatch between structs in if branches: "+JSON.stringify(case1.type)+" and "+JSON.stringify(case2.type));
          }
          js.unindent();
          var basevar = js.mkVar(null, "int", "phibase");
          phi = js_get_at(case1.type, basevar, 0);
          merge_amend(
            function() { js.set("int", basevar.value, case1.base.value); },
            function() { js.set("int", basevar.value, case2.base.value); });
        } else {
          fail(thing, "merge unimplemented: "+JSON.stringify(case1)+" and "+JSON.stringify(case2));
        }
      }
    }
    else if (case1 == null) { } // no issues
    else {
      thing.fail("unimplemented: single if "+JSON.stringify(case1));
    }
    
    js.unindent();
    
    js.addLine("if ("+js_tag(test)+") {");
    js.add(case1_js);
    if (if_prop.branch_false) {
      js.addLine("} else {");
      js.add(case2_js);
    }
    js.addLine("}");
    return phi;
  }
  thing.fail("if unimplemented: "+JSON.stringify(test));
}

function match_while(thing) {
  if (!match_op(thing, "while")) return null;
  
  var args = thing.value.slice(1);
  if (args.length != 2)
    fail(thing, "'while' expected two arguments");
  
  return {
    test: args[0],
    body: args[1]
  };
}

function while_internal(context, thing, rest) {
  var js = context.js;
  var res = null;
  var while_props = match_while(thing);
  if (js) {
    // the test may need to do work, so do while (true) if (!test) break;
    js.addLine("while (1) {");
    js.indent();
    var test = context.eval(while_props.test);
    if (test.kind == "expr" && test.type == "bool") {
      var value = test.value;
      if (value === true) value = "1";
      else if (value === false) value = "0";
      if (paren_maybe(value, "!").indexOf("true") != -1) debugger;
      js.addLine("if (!"+paren_maybe(value, "!")+") break;");
    }
    else thing.fail("unimplemented: while test that's "+JSON.stringify(test));
    res = context.eval(while_props.body);
    js.unindent();
    js.addLine("}");
    // the last loop pass will naturally be the one whose variables are "final"
  } else {
    while (true) {
      var test = context.eval(while_props.test);
      if (!lit_bool(test)) fail(while_props.test, "test did not evaluate to a boolean");
      if (!test.value) break;
      res = context.eval(while_props.body);
    }
  }
  return res;
}

/** @constructor */
function MakeStructProps(names_arr, values_arr, location) {
  this.names = names_arr;
  this.values = values_arr;
  this.location = location;
  this.rewriteWith = function(fn) {
    var pairlist = [];
    if (this.location == "stack") pairlist.push("make-struct");
    else if (this.location == "heap") pairlist.push("alloc-struct");
    else throw "internal error";
    for (var i = 0; i < this.names.length; ++i) {
      pairlist.push(list(this.names[i], fn(this.names[i], this.values[i])));
    }
    var res = list.apply(this, pairlist);
    // log("debug: A: ", sexpr_dump(thing));
    // log("debug: B: ", sexpr_dump(res));
    return res;
  };
}

function match_makestruct(thing, location) {
  if (thing.kind != "list") return null;
  var array = thing.value;
  if (array.length == 0) return null;
  if (array[0].kind != "atom") return null;
  var name = array[0].value;
  if (location == "stack") {
    if (name != "make-struct") return null;
  } else if (location == "heap") {
    if (name != "alloc-struct") return null;
  } else if (location == null) {
    if (name == "make-struct") location = "stack";
    else if (name == "alloc-struct") location = "heap";
    else return null;
  } else throw ("internal error - what is "+location);
  var args = array.slice(1);
  
  var names_arr = [], values_arr = [];
  for (var i = 0; i < args.length; ++i) {
    var pair = args[i];
    if (pair.kind != "list") fail(pair, "expected name-value pair for make-struct; this is not a list");
    if (pair.value.length != 2) fail(pair, "expected name-value pair for make-struct; this is not a pair");
    if (pair.value[0].kind != "atom") fail(pair, "expected name-value pair for make-struct; this is not a name");
    
    var name = pair.value[0].value;
    var value = pair.value[1];
    
    names_arr.push(name);
    values_arr.push(value);
  }
  return new MakeStructProps(names_arr, values_arr, location);
}

function match_makearray(thing, location) {
  if (thing.kind != "list") return null;
  var array = thing.value;
  if (array.length == 0) return null;
  if (array[0].kind != "atom") return null;
  var name = array[0].value;
  if (location == "stack") {
    if (name != "make-array") return null;
  } else if (location == "heap") {
    if (name != "alloc-array") return null;
  } else if (location == null) {
    if (name == "make-array") location = "stack";
    else if (name == "alloc-array") location = "heap";
    else return null;
  } else throw ("internal error - what is "+location);
  var args = array.slice(1);
  if (args.length != 2) fail(thing, "expected two parameters: type and size");
  var type = args[0];
  var size = args[1];
  
  return {
    type: type,
    size: size,
    location: location
  };
}

function make_struct(context, thing, names, values) {
  var values_obj = {};
  for (var i = 0; i < names.length; ++i) {
    values_obj[names[i]] = values[i];
  }
  
  var res = {
    kind: "struct",
    value: values_obj,
    type: {
      kind: "struct",
      size: 0,
      types: {},
      offsets: {}
    }
  };
  
  for (var i = 0; i < values.length; ++i) {
    var name = names[i];
    var value = values[i];
    var offset = res.type.size;
    
    var type = js_type(value);
    var size = js_size(value);
    // log(name, ": size", size, "for", JSON.stringify(value));
    
    res.type.types[name] = type;
    res.type.offsets[name] = offset;
    res.type.size += size;
  }
  
  return res;
}

function alloc_struct_at(struct, context, thing, names, values, base) {
  if (base) {
    struct.base = base;

    for (var i = 0; i < values.length; ++i) {
      var name = names[i];
      var value = values[i];
      
      var type = struct.type.types[name];
      
      var struct_member = js_get_at(type, base, struct.type.offsets[name]);
      
      struct.value[name] = struct_member;
      
      js_set(context.js, thing, struct_member, value);
    }
  }
}

function make_struct_on(location, context, thing, names, values) {
  var res = make_struct(context, thing, names, values);
  var base = null;
  if (location == "stack") {
    if (context.js) {
      // stack grows down
      context.js.set("int", "SP", js_op("int", "-", "SP", res.type.size));
      base = context.js.mkVar("SP", "int", "struct_base");
    }
  } else if (location == "heap") {
    if (context.js) {
      // heap grows up
      var malloc = PLATFORM_ELECTRON?"my_malloc":"malloc";
      base = context.js.mkVar(malloc+"("+res.type.size+")", "int", "struct_base");
      // base = context.js.mkVar("HP", "int", "struct_base");
      // context.js.set("int", "HP", js_op("int", "+", "HP", res.type.size));
    }
  } else throw ("internal error "+location);
  
  alloc_struct_at(res, context, thing, names, values, base); 
  
  if (location == "heap") {
    if (context.js) {
      return {kind: "pointer", base: base, type: res.type};
    } else {
      // interpreted pointer emulation
      return {kind: "pointer", value: res, type: res.type};
    }
  }
  
  return res;
}

function makestruct_internal(context, thing, rest, location) {
  if (!rest.length) fail(thing, "make-struct expected list");
  
  var makestruct_props = match_makestruct(thing, location);
  
  var names_arr = makestruct_props.names;
  var values_arr = makestruct_props.values;
  
  for (var i = 0; i < values_arr.length; ++i) {
    var value = context.eval(values_arr[i]);
    if (value && value.kind == "pointer" && value.type.kind == "struct") {
      // flatten out
      if (value.hasOwnProperty("base")) {
        value = js_get_at(value.type, value.base, 0);
      } else {
        // interpreted pointer emulation
        value = value.value;
      }
    }
    values_arr[i] = value;
  }
  
  return make_struct_on(location, context, thing, names_arr, values_arr);
}

/** @constructor */
function RLArrayType(base) {
  this.kind = "array-type";
  this.base = base;
}

/** @constructor */
function RLArray(type, ptr, size) {
  if (type.kind != "array-type") throw "bad type for array";
  if (ptr.type != "int") throw "bad ptr for array";
  if (size.type != "int") throw "bad size for array";
  this.kind = "array";
  this.type = type;
  this.ptr = ptr;
  this.size = size;
}

function makearray_internal(context, thing, rest, location) {
  if (!rest.length) fail(thing, "make-struct expected list");
  
  var makearray_props = match_makearray(thing, location);
  
  var type = context.eval(makearray_props.type);
  var typesize = js_type_size(type);
  var size = context.eval(makearray_props.size);
  
  if (size.type != "int") fail(thing, "invalid size for array: "+JSON.stringify(size.type));
  
  var arrtype = new RLArrayType(type);
  
  if (!context.js) fail("TODO make-array at compiletime");
  
  var total_len = context.js.mkVar(js_op("int", "*", js_tag(size), typesize), "int", "total_len");
  
  var arr_ptr = null;
  if (location == "stack") {
    context.js.set("int", "SP", js_op("int", "-", "SP", js_tag(total_len)));
    arr_ptr = context.js.mkVar("SP", "int", "array_base");
  } else if (location == "heap") {
    var malloc = PLATFORM_ELECTRON?"my_malloc":"malloc";
    arr_ptr = context.js.mkVar(malloc+"("+js_tag(total_len)+")", "int", "array_base");
  } else throw ("internal error "+location);
  
  return new RLArray(arrtype, arr_ptr, size);
}

function can_call(thing) {
  return thing.kind == "function-poly" || thing.kind == "closure-poly" || thing.kind == "closure-pointer";
}

function makestruct_internal_stack(context, thing, rest) { return makestruct_internal(context, thing, rest, "stack"); }
function makestruct_internal_heap (context, thing, rest) { return makestruct_internal(context, thing, rest, "heap" ); }
function makearray_internal_stack (context, thing, rest) { return makearray_internal (context, thing, rest, "stack"); }
function makearray_internal_heap  (context, thing, rest) { return makearray_internal (context, thing, rest, "heap" ); }

EvalPrimitives_templ = {
  'let1': let1_internal,
  'alias1': alias1_internal,
  'def': def_internal,
  'set': set_internal,
  'lambda': lambda_internal,
  'local-lambda': lambda_internal,
  'macro': macro_internal,
  'if': if_internal,
  'while': while_internal,
  'make-struct': makestruct_internal_stack,
  'alloc-struct': makestruct_internal_heap,
  'make-array': makearray_internal_stack,
  'alloc-array': makearray_internal_heap
};

EvalPrimitives = Object.create(null);
for (var key in EvalPrimitives_templ) if (EvalPrimitives_templ.hasOwnProperty(key)) {
  EvalPrimitives[key] = EvalPrimitives_templ[key];
}

function eval_builtin(context, thing) {
  if (thing.kind !== "list") throw "internal error";
  var list = thing.value;
  if (!list.length || list[0].kind !== "atom") throw "internal error";
  var name = list[0].value;
  var rest = list.slice(1);
  
  if (name in EvalPrimitives) return EvalPrimitives[name](context, thing, rest);
}

// dirty microoptimizations
var reserved_identifiers = Object.create(null);
var reserved_identifiers_templ = {
  let1: 1, def: 1, set: 1,
  alias1: 1,
  lambda: 1, macro: 1,
  'if': 1, 'while': 1,
  "alloc-struct": 1, "make-struct": 1,/* "require": 1,*/
  "alloc-array": 1, "make-array": 1
};

for (var key in reserved_identifiers_templ) if (reserved_identifiers_templ.hasOwnProperty(key)) {
  reserved_identifiers[key] = 1;
}

/** @constructor */
function Context(sup, js) {
  if (sup && !js && sup.js) js = sup.js;
  
  this.sup = sup || null;
  if (sup && sup.hasOwnProperty("types")) this.types = sup.types;
  this.js = js;
  this.namehint = "";
  this.table = Object.create(null);
  this.requires = [];
  this.lookup = function(name, local) {
    // log("lookup("+name+", "+(local?"true":"false")+") in "+this.info());
    local = local || false;
    
    var context = this;
    
    while (true) {
      if (typeof context.table[name] !== "undefined") return context.table[name];
      
      if (!local) {
        for (var i = 0; i < context.requires.length; ++i) {
          // requires are not transitive
          var res = context.requires[i].lookup(name, true);
          if (res) return res;
        }
      }
      
      if (context.sup !== null) context = context.sup;
      else return;
    }
  };
  
  this.add = function(name, value) {
    var self = this;
    
    if (typeof name != "string") {
      log("what is a "+name);
      throw "fuck";
    }
    // Why is this consistently the fastest on http://andrew.hedges.name/experiments/in/ :-(
    if ('undefined' !== typeof reserved_identifiers[name]) {
      throw ("Cannot define variable named '"+name+"': reserved identifier!");
    }
    if (value) {
      if ('undefined' !== typeof value['set']) {
        throw "internal issue: adding value that already has 'set' property (??)";
      }
      value.set = function(newval) {
        newval = unbind_lv(newval);
        newval.set = value.set; // propagate
        self.table[name] = newval;
      };
    }
    self.table[name] = value;
  };
  this.addRequire = function(context) {
    this.requires.push(context);
  };
  this.getNamehint = function() {
    if (this.namehint != "") return this.namehint;
    if (!this.sup) return "lambda";
    return sup.getNamehint();
  };
  this.info = function() {
    var info = "";
    var cur = this;
    while (cur != null) {
      info += " :[";
      var list = [];
      for (var key in cur.table) list.push(key);
      info += list.join(",");
      info += "]";
      if (this.requires.length) {
        var reqlist = [];
        for (var i = 0; i < this.requires.length; ++i) {
          reqlist.push(this.requires[i].info());
        }
        info += " requires ("+reqlist.join(",")+")";
      }
      cur = cur.sup;
    }
    return info;
  };
  this.eval = function(thing) {
    if (thing.kind === "expr") {
      return thing;
    }
    if (thing.kind === "atom") {
      var res = this.lookup(thing.value);
      
      if (typeof res !== "undefined") return res;
      
      // fail(thing, "Symbol '"+thing.value+"' not found."+this.info());
      fail(thing, "Symbol '"+thing.value+"' not found.");
    }
    if (thing.kind === "quote") {
      return thing.value;
    }
    if (thing.kind === "list") {
      var list = thing.value;
      if (!list.length) thing.fail("Cannot evaluate empty list!");
      if (list[0].kind === "atom") {
        var res = eval_builtin(this, thing);
        if (typeof res !== "undefined") return res;
      }
      var op = this.eval(list[0]);
      if (op === null) {
        fail(list[0], "operator not found: "+sexpr_dump(list[0])+" at "+this.info());
      }
      if (can_call(op)) {
        var args = [];
        
        if (op.kind === "closure-poly") {
          // log("closure-poly, push", JSON.stringify(op.base));
          args.push(op.base);
          op = op.fn;
        }
        if (op.kind === "closure-pointer") {
          // log("closure-pointer, push", JSON.stringify(op.base.base), "call", JSON.stringify(op.fnptr));
          args.push(op.base.base);
          op = op.fnptr;
        }
        
        for (var i = 1; i < list.length; ++i) {
          var arg = this.eval(list[i]);
          // structs are passed as pointers! (but only to user functions)
          if (op.internal !== true && arg && arg.kind === "struct" && arg.hasOwnProperty('base')) {
            if (arg.base == null) throw "internal error";
            arg = {kind: "pointer", base: arg.base, type: arg.type};
          }
          // log("Xdebug:", i, sexpr_dump(arg), /*"<-", sexpr_dump(list[i]), */"at", this.info());
          args.push(arg);
        }
        
        var res = op.call(this, thing, args);
        if (typeof res === "undefined") res = null;
        // log("| "+sexpr_dump(thing)+" => "+sexpr_dump(res));
        return res;
      }
      fail(thing, "cannot call "+typeof op+" "+JSON.stringify(op)+" "+sexpr_dump(list[0]));
    }
    fail(thing, "helplessly lost trying to eval "+typeof thing+" "+JSON.stringify(thing));
  };
  /*
  this.clone_frozen = function() {
    var res = new Context(this.sup, this.js);
    res.requires = this.requires.slice(0);
    for (var key in this.table) {
      res.table[key] = this.table[key];
    }
    // make the clone our parent, move our stuff in there
    // clones are frozen in time, so any rewriting update will have to
    // touch the clone, and we avoid two diverging views of the state
    this.requires = [];
    this.table = Object.create(null);
    this.sup = res;
    
    return res;
  };
  */
}

function js_return_type(type) {
  if (type == "int" || type == "float" || type == "bool" || type == "void") return type;
  if (type.kind == "closure" || type.kind == "vector" || type.kind == "array" || type.kind == "closure-poly") {
    return "void"; // passed in globals
  }
  if (type.kind == "pointer") {
    return "int";
  }
  if (type.kind == "struct") {
    fail(null, "bad return type (struct)");
  }
  fail(null, "unimplemented: js_return_type("+JSON.stringify(type)+")");
}

function emitStubFunction(js, type) {
  var flattened = flatten_type_array(type.args);
  var sign = flattened.signature;
  var partypes = flattened.js_types;
  
  var parnames = [];
  for (var i = 0; i < partypes.length; ++i) parnames.push("par"+i);
  
  var fn = js.allocName("f", "stub");
  
  js.openSection("function", "functions");
  if (PLATFORM_ELECTRON) {
    var parpairs = [];
    for (var i = 0; i < partypes.length; i++) parpairs.push(js_type_to_c(partypes[i])+" "+parnames[i]);
    js.addLine("static "+js_type_to_c(js_return_type(type.ret))+" "+fn+"("+parpairs.join(", ")+") {");
  } else {
    js.addLine("function "+fn+"("+parnames.join(", ")+") {");
  }
  js.indent();
  
  for (var i = 0; i < partypes.length; ++i) {
    js.set(partypes[i], parnames[i], parnames[i]);
  }
  
  if (PLATFORM_ELECTRON) {
    js.addLine("abort();");
  } else {
    js.addLine("error(0);");
  }
  
  var js_type = js_return_type(type.ret);
  
  if (js_type == "void") { js.addLine("return;"); }
  else if (js_type == "int") { js.addLine("return 0;"); }
  else if (js_type == "float") { js.addLine("return 0.0;"); }
  else fail(null, "unimplemented: stub return type "+JSON.stringify(type.ret));
  
  js.unindent();
  js.addLine("}");
  
  js.add("functions", js.popSection("function"));
  
  return fn;
}

/** @constructor */
function FnTable() {
  // signature to array by name
  this.by_signs = {};
  this.getIdBySignature = function(type, fname) {
    if (type.kind != "function") throw "internal error";
    var sign = this.typeToSignature(type);
    var table = this.by_signs;
    
    if (!table.hasOwnProperty(sign)) {
      table[sign] = [];
      table[sign].type = type;
    }
    
    for (var i = 0; i < table[sign].length; ++i) {
      var entry = table[sign][i];
      if (entry == fname) return i;
    }
    var index = table[sign].length;
    table[sign].push(fname);
    return index;
  };
  this.typeToSignature = function(type) {
    if (type.kind != "function") throw "internal error";
    return flatten_type_array(type.args).signature+"_ret_"+js_return_type(type.ret);
  }
  this.getTblNameForType = function(type) {
    return "table_"+this.typeToSignature(type); // lol
  };
  this.getMaskId = function(tblname) {
    return "__TBL_MASK_"+tblname+"__";
  };
  this.emitInto = function(js) {
    for (var sign in this.by_signs) if (this.by_signs.hasOwnProperty(sign)) {
      var list = this.by_signs[sign];
      var type = list.type;
      var name = this.getTblNameForType(type);
      var maskid = this.getMaskId(name);
      
      if (!list.length) throw "internal error";
      
      var is_pot = function(i) { return i > 0 && ((i & (i - 1)) == 0); };
      
      var stubname = null;
      if (!is_pot(list.length)) {
        stubname = emitStubFunction(js, type);
      }
      while (!is_pot(list.length)) {
        list.push(stubname);
      }
      
      var mask = list.length - 1;
      if (PLATFORM_ELECTRON) {
        var c_arg_types = [];
        var js_types = flatten_type_array(type.args).js_types;
        for (var i = 0; i < js_types.length; i++) {
          c_arg_types.push(js_type_to_c(js_types[i]));
        }
        var c_type = js_type_to_c(js_return_type(type.ret))+"(*"+name+"["+list.length+"])("
          + c_arg_types.join(", ")
          + ")";
        js.addLine("decls", "static "+c_type+";");
        js.addLine("tables", "static "+c_type+" = {"+list.join(", ")+"};");
      } else {
        js.addLine("tables", "var "+name+" = ["+list.join(", ")+"];");
      }
      js.replace(maskid, ""+mask);
    }
  };
}

/** @constructor */
function JsFile() {
  this.sections = [];
  this.counter = 0;
  this.namehint = "";
  this.fntable = new FnTable; // function pointer table (by signature)
  this.nop = function() { };
  this.openSection = function(name, parent) {
    var indentDepth = 0;
    if (this.sections.length > 0) {
      indentDepth = this.findSection(parent).indentDepth;
    }
    
    this.sections.push({name: name, indentDepth: indentDepth, source: "", finalizers: []});
  };
  this.popSection = function(name) {
    var last = this.sections.pop();
    if (last.name != name)
      throw("mismatch: tried to close '"+name+"' but we were at '"+last.name+"'");
    
    var res = last.source;
    for (var i = 0; i < last.finalizers.length; ++i) {
      res = last.finalizers[i](res);
    }
    return res;
  };
  this.onSectionFinalize = function(name, fn) {
    var section = this.findSection(name);
    section.finalizers.push(fn);
  };
  this.closeSection = function(name) {
    this.add(this.popSection(name)); // append to previous section
  };
  this.all_length = function() {
    var res = 0;
    for (var i = 0; i < this.sections.length; ++i) {
      res += this.sections[i].source.length;
    }
    return res;
  };
  this.all_source = function() {
    var res = "";
    for (var i = 0; i < this.sections.length; ++i) {
      res += this.sections[i].source;
    }
    return res;
  };
  
  this.findSection = function(name) {
    if (!this.sections.length) {
      throw "please open a section!";
    }
    
    var section = null;
    if (name != null) {
      for (var i = this.sections.length - 1; i >= 0; --i) {
        var s = this.sections[i];
        if (s.name == name) {
          section = s;
          break;
        }
      }
      
      if (section == null) {
        throw ("undefined section '"+name+"'");
      }
    } else {
      section = this.sections[this.sections.length - 1];
    }
    return section;
  };
  
  this.add = function(name, text) {
    
    if (text == null) {
      text = name;
      name = null;
    }
    
    var section = this.findSection(name);
    
    section.source += text;
    if (this.all_length() > 5000000) {
      log("barf!<br>" +
        this.all_source().
          replace(/\n/g, "<br>").
          replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"));
      throw "js file length is excessive";
    }
  };
  this.replace = function(what, withwhat) {
    for (var i = 0; i < this.sections.length; ++i) {
      var section = this.sections[i];
      // replace only replaces ONE
      section.source = section.source.split(what).join(withwhat);
    }
  };
  this.addLine = function(name, text) {
    if (text == null) {
      text = name;
      name = null;
    }
    
    var section = this.findSection(name);
    
    suspect(text);
    
    for (var i = 0; i < section.indentDepth; ++i) {
      this.add(name, "\t");
    }
    this.add(name, text);
    this.add(name, "\n");
  };
  this.indent = function(section) { this.findSection(section).indentDepth ++; };
  this.unindent = function(section) { this.findSection(section).indentDepth --; };
  this.allocName = function(kind, hint) {
    var name = kind + this.counter++;
    if (hint) {
      name += "_";
      name += filter_string(hint);
    }
    return name;
  };
  this.defineVar = function(name, type, value, location) {
    if (location == null) location = "variables";
    
    var sample = null;
    if (type == "float") sample = tagf_init("0");
    else if (type == "double") sample = "0.0";
    else if (type == "int") sample = "0";
    else if (type == "bool") sample = "0";
    else throw ("how init "+type+"?");
    
    if (PLATFORM_ELECTRON) {
      this.addLine(location, js_type_to_c(type)+" "+name+";");
    } else {
      this.addLine(location, "var "+name+" = "+sample+";");
    }
    
    if (value != null) {
      this.set(type, name, value);
    }
    // C
    /*if (init == "null") {
      this.addLine(type+" "+name+";");
    } else {
      this.addLine(type+" "+name+" = "+init+";");
    }*/
    return name;
  };
  this.mkVar = function(value, type, hint, location) {
    if (!type) {
      if (typeof value == "number" || typeof value == "boolean") throw "excuse me what are you doing??";
      else if (typeof value == "object") {
        if (value.kind == "expr") {
          type = value.type;
        }
      }
    }
    if (!type) throw (
      "cannot make var: what is type of " +
      JSON.stringify(value) +
      "?");
    var name = this.allocName("v", hint);
    if (value === null) {
      return {
        kind: "expr",
        type: type,
        value: this.defineVar(name, type, null, location)
      };
    }
    if (typeof value == "number" || typeof value == "string" || typeof value == "boolean") {
      return {
        kind: "expr",
        type: type,
        value: this.defineVar(name, type, value, location)
      };
    }
    if (typeof value == "object") {
      if (value.kind == "expr") {
        var converted = js_as_type(type, value);
        if (converted === null) throw ("cannot convert to "+type+": "+JSON.stringify(value));
        return {
          kind: "expr",
          type: type,
          value: this.defineVar(name, type, converted, location)
        };
      }
    }
    log("how var of "+(typeof value)+" "+JSON.stringify(value));
    throw ("cannot form var of "+JSON.stringify(value));
  };
  this.set = function(type, target, value) {
    this.addLine(target+" = "+js_tag(type, value)+";");
  };
  this.emitFunctionTables = function() {
    this.fntable.emitInto(this);
  };
}

function eq(v1, v2) {
  if (typeof v1 !== typeof v2) return false;
  if (Array.isArray(v1) && Array.isArray(v2)) {
    if (v1.length != v2.length) return false;
    for (var i = 0; i < v1.length; ++i) {
      if (!eq(v1[i], v2[i])) return false;
    }
    return true;
  }
  return v1 == v2;
}

function defun(context, name, arity, fun) {
  if (typeof arity == "function") {
    fun = arity; arity = null;
  }
  var obj = {
    kind: "function-poly",
    namehint: name,
    internal: true,
    call: function(context, thing, args) {
      if (arity != null && args.length != arity)
        fail(thing, "expect "+arity+" arguments for '"+name+"'");
      if (arity == null) {
        try {
          return fun.call(this, context, thing, args);
        } catch (error) {
          if (error instanceof AlreadyInformedError) throw error;
          else fail(thing, error.toString());
        }
      } else {
        var args2 = [];
        args2.push(context);
        args2.push(thing);
        for (var i = 0; i < args.length; ++i) args2.push(args[i]);
        return fun.apply(this, args2);
      }
    }
  };
  context.add(name, obj);
}

function flatclone(obj) {
  var res = {};
  for (var key in obj) if (obj.hasOwnProperty(key)) res[key] = obj[key];
  return res;
}

function closureTypeToFnType(type, base) {
  var nargs = [];
  nargs.push(base || "int"); // base type
  for (var i = 0; i < type.args.length; ++i) {
    nargs.push(type.args[i]);
  }
  
  return {
    kind: "function",
    ret: type.ret,
    args: nargs
  };
}

function structs_to_pointers(args) {
  var res = [];
  for (var i = 0; i < args.length; ++i) {
    var arg = args[i];
    if (arg.kind == "struct") {
      res.push({kind: "pointer", type: arg});
    } else {
      res.push(arg);
    }
  }
  return res;
}

function js_call_fnptr(js, fnptr, thing, args) {
  var tblname = js.fntable.getTblNameForType(fnptr.type);
  var tbl_expr = tblname+"["+js_op(null, "&", js_tag(fnptr.offset), js.fntable.getMaskId(tblname))+"]";
  
  var flattened = flatten_array(thing, args);
  var signature = flattened.signature;
  var flat_args = flattened.array;
  
  return build_js_call(thing, js, tbl_expr, fnptr.type.ret, flat_args);
}

function setupSysctx() {
  var sysctx = new Context();
  
  defun(sysctx, "seq", function(context, thing, array) {
    if (!array.length) return null;
    return array[array.length-1];
  });
  sysctx.add("dump", {
    kind: "macro",
    evalMacro: function(context, thing) {
      var rest = thing.value.slice(1);
      
      if (rest.length != 1) thing.fail("'dump' expects one argument");
      // if (!js) thing.fail("TODO dump in interpreted mode (how??)");
      var info = sexpr_dump(rest[0]);
      // alert(info+": "+JSON.stringify(rest[0]));
      return list("_dump", {kind: "quote", value: {kind: "atom", value: info}}, rest[0]);
    }
  });
  defun(sysctx, "_dump", 2, function(context, thing, info, value) {
    // js.addLine("alert(par1);");
    // if (value == null) throw "value is null";
    var fmt = function(value) {
      if (value == null) return "'null'";
      if (value.kind == "vector") {
        var parts = [];
        if (value.hasOwnProperty('base')) {
          parts.push("'@'+("+js_tag(value.base)+")");
        }
        for (var i = 0; i < value.type.size; ++i) {
          parts.push("("+fmt({kind: "expr", type: value.type.base, value: value.value[i]})+")");
        }
        if (parts.length == 0) return "'vector()'";
        return "'vector('+"+parts.join("+', '+")+"+')'";
      }
      if (value.kind == "atom") {
        return "'"+jsStringEscape(value.value)+"'";
      }
      if (value.kind == "expr") {
        return "'<'+"+value.value+"+'>'";
      }
      if (value.kind == "list") {
        var list = [];
        for (var i = 0; i < value.value.length; ++i) {
          list.push(fmt(value.value[i]));
        }
        if (!list.length) return "'()'";
        return "'('+"+list.join("+' '+")+"+')'";
      }
      if (value.kind == "pointer") {
        var base = js.mkVar(js_tag(value.base), "int", "pointer");
        return "'&'+"+fmt(js_get_at(value.type, base, 0));
      }
      if (value.kind == "struct") {
        var list = [];
        for (var key in value.value) if (value.value.hasOwnProperty(key)) {
          list.push("'"+key+": '+"+fmt(value.value[key]));
        }
        if (!list.length) return "'{}'";
        return "'{'+"+list.join("+', '+")+"+'}'";
      }
      if (value.kind == "closure-poly") {
        return "'<closure(poly) to "+value.fn.namehint+", base at '+"+fmt(value.base.base)+"+'>'";
      }
      if (value.kind == "closure-pointer") {
        return "'<closure of "+get_type_signature(value)+", fn at '+"+fmt(value.fnptr.offset)+"+', base at '+"+fmt(value.base.base)+"+'>'";
      }
      if (value.kind == "quote") {
        return "\"'\"+"+fmt(value.value);
      }
      return "'unimplemented: dump "+(JSON.stringify(value))+"'";
      // thing.fail("unimplemented: dump "+JSON.stringify(value));
    };
    var js = context.js;
    if (!js) {
      // alert(fmt(value));
      alert(info.value+" = "+eval(fmt(value)));
    } else js.addLine("alert_('"+jsStringEscape(info.value)+" = '+"+fmt(value)+");");
  });
  defun(sysctx, "quote", 1, function(context, thing, value) {
    if (!value) fail(thing, "quote: value is null");
    return {kind: "quote", value: value, fail: thing.fail};
  });
  defun(sysctx, "size", 1, function(context, thing, value) {
    if (value.kind != "list" && value.kind != "array") {
      fail(thing, "'size' expected list or array as parameter, not '"+sexpr_dump(value)+"'");
    }
    if (value.kind == "list") {
      return {kind: "expr", type: "int", value: value.value.length};
    }
    if (value.kind == "array") {
      return value.size;
    }
  });
  defun(sysctx, "first", "1", function(context, thing, value) {
    if (!value) fail(thing, "argument is null");
    if (value.kind == "list") {
      return value.value[0];
    }
    fail(thing, "first? "+JSON.stringify(value));
  });
  defun(sysctx, "list?", "1", function(context, thing, value) {
    return {kind: "expr", type: "bool", value: value.kind == "list"};
  });
  defun(sysctx, "vector?", "1", function(context, thing, value) {
    return {kind: "expr", type: "bool", value: value.kind == "vector"};
  });
  defun(sysctx, "array?", "1", function(context, thing, value) {
    return {kind: "expr", type: "bool", value: value.kind == "array"};
  });
  defun(sysctx, "struct?", "1", function(context, thing, value) {
    return {
      kind: "expr",
      type: "bool",
      value: value.kind == "struct"
          || value.kind == "pointer" && value.type.kind == "struct"
    };
  });
  defun(sysctx, "callable?", "1", function(context, thing, value) {
    return {kind: "expr", type: "bool", value: can_call(value)};
  });
  // first of list of size 1
  defun(sysctx, "first1", "1", function(context, thing, value) {
    if (value.kind == "list") {
      if (!value.value.length) fail(thing, "first1 of empty list");
      if (value.value.length > 1) fail(thing, "first1 of list of length "+value.value.length);
      return value.value[0];
    }
    fail(thing, "first1? "+JSON.stringify(value));
  });
  defun(sysctx, "rest", "1", function(context, thing, value) {
    if (value.kind == "list") {
      if (!value.value.length) fail(thing, "rest of empty list");
      var rest = value.value.slice(1);
      return {kind: "list", fail: value.fail || thing.fail, value: rest};
    }
    fail(thing, "rest? "+JSON.stringify(value));
  });
  defun(sysctx, "same", "2", function(context, thing, a, b) {
    if (a.kind == "atom" && b.kind == "atom") {
      return {kind: "expr", type: "bool", value: a.value === b.value};
    }
    if (a.kind != b.kind) return {kind: "expr", type: "bool", value: false};
    fail(thing, "same? "+JSON.stringify(a)+" and "+JSON.stringify(b));
  });
  defun(sysctx, "cons", 2, function(context, thing, a, b) {
    if (b.kind != "list") {
      fail(thing, "expected list as second argument to 'cons'");
    }
    var nlist = [];
    nlist.push(a);
    for (var i = 0; i < b.value.length; ++i)
      nlist.push(b.value[i]);
    return {kind: "list", fail: a.fail || b.fail || thing.fail, value: nlist};
  });
  
  defun(sysctx, "%make-frame-stack", 0, function(context, thing) {
    var js = context.js;
    if (!js) {
      return {kind: "frame", entries: {}};
    }
    js.set("int", "SP", js_op("int", "-", "SP", "__FRAME_SIZE__"));
    var base = js.mkVar("SP", "int", "frame_base");
    var frame_obj = {
      kind: "frame",
      base: base,
      offset: {value: 0}, // by-reference, keep when copied
      entries: {}
    };
    js.onSectionFinalize("body", function(text) {
      // log("frame size fix to "+frame_obj.offset.value);
      return text.replace("__FRAME_SIZE__", frame_obj.offset.value);
    });
    return frame_obj;
  });
  
  defun(sysctx, "%make-frame", 0, function(context, thing) {
    var js = context.js;
    if (!js) {
      return {kind: "frame", entries: {}};
    }
    var malloc = PLATFORM_ELECTRON?"my_malloc":"malloc";
    var base = js.mkVar(malloc+"(__FRAME_SIZE__)", "int", "frame_base");
    // var base = js.mkVar("HP", "int", "frame_base");
    // js.set("int", "HP", js_op("int", "+", "HP", "__FRAME_SIZE__"));
    var frame_obj = {
      kind: "frame",
      base: base,
      offset: {value: 0}, // by-reference, keep when copied
      entries: {}
    };
    js.onSectionFinalize("body", function(text) {
      // log("frame size fix to "+frame_obj.offset.value);
      return text.replace("__FRAME_SIZE__", frame_obj.offset.value);
    });
    return frame_obj;
  });
  
  defun(sysctx, "%set-framevar", 3, function(context, thing, frame, name, value) {
    if (name.kind != "atom") fail(name, "name is supposed to be an atom - internal error");
    name = name.value;
    
    if (frame.kind != "frame") fail(frame, "frame is not a frame - internal error");
    if (frame.entries.hasOwnProperty(name)) fail(frame, "names are supposed to be unique - internal error");
    
    var js = context.js;
    if (!js) {
      frame.entries[name] = {value: value};
      return;
    }
    if (frame.base.kind != "expr" || frame.base.type != "int") {
      fail(thing, "?? "+JSON.stringify(frame.base));
    }
    // offset from frame base = current depth - base depth
    var type = js_type(value);
    var size = js_size(value);
    var offset = frame.offset.value;
    
    // log("debug: set at", offset, size, "to", sexpr_dump(value));
    try {
      var target = js_get_at(type, frame.base, offset);
      js_set(context.js, thing, target, value);
      
      frame.entries[name] = {type: type, offset: offset};
      frame.offset.value += size;
    } catch (error) {
      if (error instanceof AlreadyInformedError) throw error;
      else fail(thing, error.toString());
    }
  });
  defun(sysctx, "%unset-framevar", 2, function(context, thing, frame, name) {
    if (name.kind != "atom") fail(name, "name is supposed to be an atom - internal error");
    name = name.value;
    
    if (frame.kind != "frame") fail(thing, "frame is not a frame - internal error");
    if (!frame.entries.hasOwnProperty(name)) fail(thing, "name not defined in frame - internal error");
    
    delete frame.entries[name];
  });
  
  defun(sysctx, "%make-closure", 2, function(context, thing, fn, fp) {
    fp = flatclone(fp);
    fp.entries = flatclone(fp.entries);
    
    return {
      kind: "closure-poly",
      fail: thing.fail,
      fn: fn, // function
      base: fp, // frame pointer
      withFixedType: function(js, type) {
        if (type.kind == "function") fail(thing, "closure incorrectly typed as a function");
        if (type.kind != "closure") fail(thing, "closure must be typed as such");
        
        var fntype = closureTypeToFnType(type, this.base);
        var fnptr = fn.withFixedType(js, fntype);
        var id = js.fntable.getIdBySignature(fntype, fnptr.fname);
        
        return new ClosurePointer(type, this.base, {kind: "expr", type: "int", value: id});
      }
    };
  });
  
  defun(sysctx, "%seq2_3", 3, function(context, thing, a, b, c) { return b; });
  
  var mkNum = function(i) {
    return {kind: "expr", type: "int", value: i};
  };
  
  // a vector is a bundle of n variables
  defun(sysctx, "vec3f", function(context, thing, array) {
    var type = {kind: "vector", base: "float", size: 3};
    var fun = function(x, y, z) {
      return mkVec(js, type, [x, y, z]);
    };
    var js = context.js;
    if (!js) {
      fun = function(x, y, z) {
        return mkVec_direct(type, [x, y, z]);
      };
    }
    if (array.length == 3) {
      return fun(array[0], array[1], array[2]);
    } else if (array.length == 1) {
      return fun(array[0], array[0], array[0]);
    } else {
      thing.fail("expect 1 or 3 arguments for 'vec3f'");
    }
  });
  // TODO generalize
  defun(sysctx, "vec4f", function(context, thing, array) {
    var type = {kind: "vector", base: "float", size: 4};
    var fun = function(x, y, z, w) {
      return mkVec(js, type, [x, y, z, w]);
    };
    var js = context.js;
    if (!js) {
      fun = function(x, y, z, w) {
        return mkVec_direct(type, [x, y, z, w]);
      };
    }
    if (array.length == 4) {
      return fun(array[0], array[1], array[2], array[3]);
    } else if (array.length == 1) {
      return fun(array[0], array[0], array[0], array[0]);
    } else {
      thing.fail("expect 1 or 4 arguments for 'vec4f'");
    }
  });
  
  defun(sysctx, "_element", function(context, thing, array) {
    if (array.length < 2) fail(thing, "':' expected at least two arguments");
    var base = array[0];
    // log("debug _element:", sexpr_dump(thing));
    // log("debug _element::", JSON.stringify(array));
    if (base == null) fail(thing, "first value is null");
    if (base.kind == "list") throw "wtf";
    for (var i = 1; i < array.length; ++i) {
      if (base.kind == "pointer") {
        if (base.hasOwnProperty('base')) {
          base = js_get_at(base.type, base.base, 0);
        } else {
          base = base.value; // compiletime
        }
      }
      // log("debug _element "+i+":", sexpr_dump(base));
      var key = array[i];
      if (key.kind != "atom")
        fail(thing.value[i+1], "cannot access member with key of type "+key.kind);
      var name = key.value;
      
      if (base == null) fail(thing.value[i], "key not found");
      
      if (base.kind == "vector") {
        var type = base.type;
        if (type.size > 0 && name == "x")
          base = {kind: "expr", type: type.base, value: base.value[0]};
        else if (type.size > 1 && name == "y")
          base = {kind: "expr", type: type.base, value: base.value[1]};
        else if (type.size > 2 && name == "z")
          base = {kind: "expr", type: type.base, value: base.value[2]};
        else if (type.size > 3 && name == "w")
          base = {kind: "expr", type: type.base, value: base.value[3]};
        else fail(key, "undefined vector property '"+name+"'");
      } else if (base.kind == "struct") {
        if (!base.value.hasOwnProperty(name)) {
          fail(key, "undefined struct property '"+name+"' - "+sexpr_dump(thing));
        }
        var nbase = unbind_lv(base.value[name]);
        nbase.set = function(base) {
          return function(newval) {
            newval = unbind_lv(newval);
            newval.set = nbase.set;
            base.value[name] = newval; // this should work .. right??
          };
        }(base);
        base = nbase;
      } else if (base.kind == "frame") {
        if (base.hasOwnProperty("base")) { // js mode
          var basevar = base.base;
          var entry = base.entries[name];
          if (!entry.hasOwnProperty("type")) base = entry.value; // constant
          else {
            var type = entry.type;
            base = js_get_at(type, basevar, entry.offset);
          }
        } else {
          if (!base.entries.hasOwnProperty(name)) {
            fail(thing, "'"+name+"' not in stackframe ("+JSON.stringify(base)+")");
          }
          var nbase = unbind_lv(base.entries[name].value);
          nbase.set = function(base) {
            return function(newval) {
              newval = unbind_lv(newval);
              newval.set = nbase.set;
              base.entries[name].value = newval;
            };
          }(base);
          base = nbase;
        }
      } else {
        fail(key || thing.value[i+1], "cannot access property '"+name+"' of something that "+
          "is not a struct or vector, but a "+base.kind+" "+sexpr_dump(base));
      }
    }
    return base;
  });
  defun(sysctx, "index", 2, function(context, thing, array, index) {
    if (array.kind != "array") {
      fail(thing, "first parameter to 'index' must be an array, not a "+JSON.stringify(array));
    }
    if (index.kind != "expr" || index.type != "int") {
      fail(thing, "second parameter to 'index' must be a number, not a "+JSON.stringify(index));
    }
    var ptr = array.ptr;
    var base = array.type.base;
    var basesize = js_type_size(base);
    var offset_ptr = context.js.mkVar(
      js_op("int", "+", js_tag(ptr), js_op("int", "*", basesize, js_tag(index))),
      "int",
      "offset_ptr"
    );
    return js_get_at(base, offset_ptr, 0);
  });
  defun(sysctx, "list", function(context, thing, array) {
    var fail = null;
    if (array.length && array[0].hasOwnProperty('fail')) fail = fail || array[0].fail;
    fail = fail || thing.fail;
    return {kind: "list", fail: fail, value: array};
  });
  defun(sysctx, "sqrt", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.sqrt(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+sqrt("+coerce_double(value)+")", "float", "sqrt");
    }
    thing.fail("unimplemented: sqrt "+JSON.stringify(value));
  });
  defun(sysctx, "abs", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.abs(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+abs("+coerce_double(value)+")", "float", "abs");
    }
    thing.fail("unimplemented: abs "+JSON.stringify(value));
  });
  defun(sysctx, "pow", 2, function(context, thing, value, exp) {
    if (lit_float(value) && lit_float(exp)) {
      return {kind: "expr", type: "float", value: Math.pow(value.value, exp.value)};
    }
    
    if (value.kind == "expr" && value.type == "float"
       && exp.kind == "expr" &&   exp.type == "float") {
      return context.js.mkVar("+pow("+coerce_double(value)+", "+coerce_double(exp)+")", "float", "pow");
    }
    thing.fail("unimplemented: pow "+JSON.stringify(value)+", "+JSON.stringify(exp));
  });
  defun(sysctx, "sin", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.sin(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+sin("+coerce_double(value)+")", "float", "sin");
    }
    thing.fail("unimplemented: sin "+JSON.stringify(value));
  });
  defun(sysctx, "cos", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.cos(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+cos("+coerce_double(value)+")", "float", "cos");
    }
    thing.fail("unimplemented: cos "+JSON.stringify(value));
  });
  defun(sysctx, "tan", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.tan(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+tan("+coerce_double(value)+")", "float", "tan");
    }
    thing.fail("unimplemented: tan "+JSON.stringify(value));
  });
  defun(sysctx, "asin", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.asin(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+asin("+coerce_double(value)+")", "float", "asin");
    }
    thing.fail("unimplemented: asin "+JSON.stringify(value));
  });
  defun(sysctx, "acos", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.acos(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+acos("+coerce_double(value)+")", "float", "acos");
    }
    thing.fail("unimplemented: acos "+JSON.stringify(value));
  });
  defun(sysctx, "atan2", 2, function(context, thing, y, x) {
    if (y.kind == "expr" && y.type == "float" && x.kind == "expr" && x.type == "float") {
      return context.js.mkVar("+atan2("+coerce_double(y)+", "+coerce_double(x)+")", "float", "atan2");
    }
    thing.fail("unimplemented: atan "+JSON.stringify(y)+", "+JSON.stringify(x));
  });
  defun(sysctx, "floor", 1, function(context, thing, value) {
    if (lit_float(value)) return {kind: "expr", type: "float", value: Math.floor(value.value)};
    if (value.kind == "expr" && value.type == "float") {
      return context.js.mkVar("+floor("+coerce_double(value)+")", "float", "floor");
    }
    thing.fail("unimplemented: floor "+JSON.stringify(value));
  });
  var defCmp = function(opname, opfun) {
    defun(sysctx, opname, 2,
      function(context, thing, v1, v2) {
        var js = context.js;
        if (lit_float(v1) && lit_float(v2)) {
          return {kind: "expr", type: "bool", value: opfun(v1.value, v2.value)};
        }
        
        if (!js) thing.fail("invalid arguments to comparison in interpreted mode: "+JSON.stringify(v1)+" and "+JSON.stringify(v2));
        
        if (v1.kind == "vector" || v2.kind == "vector") fail(thing, "cannot compare vectors: "+JSON.stringify(v1.type)+" with "+JSON.stringify(v2.type));
        
        var jsop = opname;
        if (opname == "=") jsop = "==";
        
        var _ = js_unify_vars(v1, v2);
        v1 = _.left; v2 = _.right;
        
        return js.mkVar(js_op(null, jsop, js_tag(v1), js_tag(v2)), "bool", "cmp");
      }
    );
  };
  defCmp("<", function(a, b) { return a < b; });
  defCmp(">", function(a, b) { return a > b; });
  defCmp("<=", function(a, b) { return a <= b; });
  defCmp(">=", function(a, b) { return a >= b; });
  defCmp("=", function(a, b) { return a == b; });
  defCmp("!=", function(a, b) { return a != b; });
  defun(sysctx, "isfinite", 1, function(context, thing, value) {
    var js = context.js;
    if (!js) thing.fail("TODO js");
    if (value.kind == "expr" && value.type == "float") {
      return js.mkVar("isFinite(+("+value.value+"))|0", "bool", "isfinite");
    }
    thing.fail("unimplemented: isfinite of "+JSON.stringify(value));
  });
  defun(sysctx, "not", 1, function(context, thing, bool) {
    var js = context.js;
    if (lit_bool(bool)) {
      return {kind: "expr", type: "bool", value: !bool.value};
    }
    if (!js) thing.fail("TODO js");
    if (bool.kind == "expr" && bool.type == "bool") {
      return js.mkVar("!"+paren_maybe(js_tag(bool), "!"), "bool", "not");
    }
    thing.fail("unimplemented: 'not' of "+JSON.stringify(bool));
  });
  var defOp = function(opname, opfun) {
    defun(sysctx, opname, function(context, thing, array) {
      var js = context.js;
      if (array.length == 0)
        thing.fail("'"+opname+"' expects more than one argument");
      var res = null;
      for (var i = 1; i < thing.value.length; ++i) {
        if (array[i-1] == null) {
          fail(thing.value[i], "cannot '"+opname+"' undefined value");
        }
      }
      
      var vecIsNumbers = function(obj) {
        if (obj.kind == "vector") {
          for (var i = 0; i < obj.type.size; ++i) {
            if (!isFloat(obj.value[i])) return false;
          }
          return true;
        }
        throw ("obj is not vec: "+typeof obj);
      };
      
      var allNumbers = false, allInts = false, anyVecs = false;
      if (lit_float(array[0])) {
        allNumbers = true;
        res = array[0].value;
        allInts = array[0].type == "int";
      }
      else if (array[0].kind == "vector") {
        anyVecs = true;
        if (vecIsNumbers(array[0])) {
          allNumbers = true;
          res = array[0].value.slice(); // clone vector
        } else res = new Array(array[0].type.size);
      }
      for (var i = 1; i < array.length; ++i) {
        var oper = array[i];
        if (oper.kind == "vector") {
          // promote to vector
          if (!anyVecs) {
            var nres = [];
            // res is permitted to be null!
            for (var k = 0; k < oper.type.size; ++k) nres.push(res);
            res = nres;
          } else if (oper.type.size != res.length) {
            fail(thing, "mismatched vector size: "+res.length+" and "+oper.type.size);
          }
          
          anyVecs = true;
          if (!vecIsNumbers(oper)) {
            allNumbers = false;
          }
        }
        else if (!lit_float(oper)) allNumbers = false;
        else if (oper.type != "int") allInts = false;
        
        if (allNumbers) {
          if (!anyVecs) {
            res = opfun(res, oper.value);
            if (allInts) res = res | 0;
          } else {
            if (oper.kind == "vector") {
              for (var k = 0; k < res.length; ++k) 
                res[k] = opfun(res[k], oper.value[k]);
            } else {
              for (var k = 0; k < res.length; ++k) 
                res[k] = opfun(res[k], oper.value);
            }
          }
        }
      }
      
      if (allNumbers) {
        if (!anyVecs) return { kind: "expr", type: allInts?"int":"float", value: res };
        else {
          for (var k = 0; k < res.length; ++k) {
            if (res[k] == null) throw "what what what";
          }
          return { kind: "vector", type: {kind: "vector", base: "float", size: res.length}, value: res };
        }
      }
      
      if (!js) fail(thing, "unimplemented: interpreted '"+opname+"' "+JSON.stringify(array));
      
      if (anyVecs) {
        // split operation over vector
        if (res.length == 0) throw "internal error";
        var rv = new Array(res.length);
        if (array[0].kind == "vector") {
          var vec = array[0].value;
          for (var i = 0; i < res.length; ++i) 
            rv[i] = js_tag(array[0].type.base, vec[i]);
        } else {
          var fv = js_tag("float", js_tag(copy(js, array[0])));
          for (var i = 0; i < rv.length; ++i)
            rv[i] = fv;
        }
        for (var i = 1; i < array.length; ++i) {
          var oper = array[i];
          if (oper.kind == "vector") {
            for (var k = 0; k < rv.length; ++k) {
              rv[k] = js_op("float", opname, rv[k], js_tag(oper.type.base, oper.value[k]));
            }
          } else if (oper.kind == "expr" && (oper.type == "float" || oper.type == "int")) {
            var opn = js_tag_cast("float", copy(js, oper));
            for (var k = 0; k < rv.length; ++k) {
              rv[k] = js_op("float", opname, rv[k], opn);
            }
          } else {
            thing.fail("unimplemented: vop "+JSON.stringify(oper));
          }
        }
        for (var k = 0; k < rv.length; ++k) {
          if (rv[k] == null) throw "what what what";
        }
        res = {kind: "vector", type: {kind: "vector", base: "float", size: rv.length}, value: rv};
      } else {
        var combined_op = null;
        var combined_type = null;
        var op_forces_int = opname == "|" || opname == "&" || opname == "^";
        for (var i = 0; i < array.length; ++i) {
          var oper = array[i];
          
          if (oper.kind == "expr" && (oper.type == "float" || oper.type == "int")) {
            if (!combined_op) {
              combined_type = js_type(oper);
              combined_op = js_tag(oper);
              if (op_forces_int && combined_type != "int") {
                combined_type = "int";
                combined_op = coerce_int(combined_op);
              }
            } else {
              var type2 = js_type(oper);
              if (combined_type == "int" && (type2 == "float" || type2 == "double") && !op_forces_int) {
                combined_op = js_tag(type2, combined_op);
                combined_type = type2;
              }
              var js_oper = js_tag(oper);
              if ((combined_type == "float" || combined_type == "double") && type2 == "int") {
                js_oper = js_tag(combined_type, js_oper);
              }
              combined_op = js_op(combined_type, opname, combined_op, js_oper);
            }
          } else {
            thing.fail("unimplemented: op "+JSON.stringify(oper));
          }
        }
        res = {kind: "expr", type: combined_type, value: combined_op};
      }
      return res;
    });
  };
  defOp("+", function(a, b) { return a+b; });
  defOp("-", function(a, b) { return a-b; });
  defOp("*", function(a, b) { return a*b; });
  defOp("/", function(a, b) { return a/b; });
  
  defOp("%", function(a, b) { return ((a%b)+b)%b; });
  
  defOp("&", function(a, b) { return a&b; });
  defOp("|", function(a, b) { return a|b; });
  defOp("^", function(a, b) { return a^b; });
  
  defun(sysctx, "<<", 2, function(context, thing, a, b) {
    if (lit_float(a) && lit_float(b)) {
      return {kind: "expr", type: "int", value: a.value << b.value};
    }
    return context.js.mkVar(js_op("int", "<<", js_tag(a), js_tag(b)), "int", "lsh");
  });
  defun(sysctx, ">>", 2, function(context, thing, a, b) {
    if (lit_float(a) && lit_float(b)) {
      return {kind: "expr", type: "int", value: a.value >> b.value};
    }
    return context.js.mkVar(js_op("int", ">>", js_tag(a), js_tag(b)), "int", "rsh");
  });
  defun(sysctx, ">>>", 2, function(context, thing, a, b) {
    if (lit_float(a) && lit_float(b)) {
      return {kind: "expr", type: "int", value: a.value >>> b.value};
    }
    return context.js.mkVar(js_op("int", ">>>", js_tag(a), js_tag(b)), "int", "ursh");
  });
  
  defun(sysctx, "float", 1, function(context, thing, x) {
    if (x.kind == "expr" && x.type == "int") {
      if (lit_int(x)) return {kind: "expr", type: "float", value: x.value};
      return {kind: "expr", type: "float", value: js_tag("float", js_tag(x))};
    }
    fail(thing, "unimplemented: (float "+JSON.stringify(x)+")");
  });
  
  defun(sysctx, "unsigned-to-float", 1, function(context, thing, x) {
    if (lit_float(x)) {
      return {kind: "expr", type: "float", value: +(x.value >>> 0)};
    }
    return context.js.mkVar(js_op("float", ">>>", js_tag(x), "0"), "float", "u2f");
  });
  
  defun(sysctx, "typeof", 1, function(context, thing, value) {
    if (value.kind == "struct" || value.kind == "vector" || value.kind == "array") {
      return value.type;
    }
    if (value.kind == "pointer") return {kind: "pointer", type: value.type};
    fail(thing, "unimplemented: typeof "+JSON.stringify(value));
  });
  
  defun(sysctx, "vector-type", 2, function(context, thing, base, size) {
    if (base.kind != "atom") fail(thing, "vector base type must be primitive type");
    if (!lit_int(size)) fail(thing, "vector size must be number");
    return {kind: "vector", base: base.value, size: size.value|0};
  });
  
  defun(sysctx, "function-type", 2, function(context, thing, argtypes, ret) {
    if (argtypes.kind != "list") fail(thing, "first parameter must be list of argument types");
    if (ret.kind == "atom") ret = ret.value;
    return {
      kind: "function",
      ret: ret,
      args: structs_to_pointers(argtypes.value),
      fail: thing.fail
    };
  });
  
  defun(sysctx, "closure-type", 2, function(context, thing, argtypes, ret) {
    if (argtypes.kind != "list") fail(thing, "first parameter must be list of argument types");
    if (ret.kind == "atom") ret = ret.value;
    return {
      kind: "closure",
      ret: ret,
      args: structs_to_pointers(argtypes.value),
      fail: thing.fail
    };
  });
  
  defun(sysctx, "type", 2, function(context, thing, type, value) {
    if (typeof value == "object" && value) {
      if (value.kind == "function-poly") {
        if (context.js) {
          return value.withFixedType(context.js, type);
        } else {
          value.type = type;
          return value;
        }
      }
      if (value.kind == "closure-poly") {
        if (context.js) {
          return value.withFixedType(context.js, type);
        } else {
          value.type = type;
          return value;
        }
      }
      if (value.kind == "closure-pointer") {
        var t1 = JSON.stringify(value.type);
        var t2 = JSON.stringify(type);
        if (t1 != t2) fail(thing, "different type already assigned: "+t1+" and "+t2);
        return value;
      }
    }
    log("type = ", sexpr_dump(type));
    log("value = ", JSON.stringify(value));
    fail(thing, "unimplemented!");
  });
  
  sysctx.add("Infinity", {kind: "expr", type: "float", value: "Infinity"});
  sysctx.add("-Infinity", {kind: "expr", type: "float", value: "-Infinity"});
  sysctx.add("dw", {kind: "expr", type: "int", value: "dw"});
  sysctx.add("dh", {kind: "expr", type: "int", value: "dh"});
  sysctx.add("di", {kind: "expr", type: "int", value: "di"});
  sysctx.add("projscale", {kind: "expr", type: "int", value: 1});
  return sysctx;
}

function compile(files) {
  "use strict";
  
  var get_file = function(fn) {
    for (var i = 0; i < files.length; ++i) {
      if (files[i].name == fn) return files[i];
    }
    return null;
  };
  
  var jsfile = new JsFile();
  
  jsfile.openSection("module");
  
  if (PLATFORM_ELECTRON) {
    jsfile.add(
      "#include <math.h>\n"+
      "#include <stdio.h>\n"+
      "#include <stdlib.h>\n"+
      "\n"+
      "#define Infinity INFINITY\n"+
      "#define isFinite finite\n"+
      "\n"
    );
    
    jsfile.openSection("globals");
    
    jsfile.add(
      "#define _memory_limit 32*1024*1024\n"+
      "\n"+
      "static unsigned char memory[_memory_limit];\n"+
      "\n"+
      // scratch space for vector return
      "static double _rvec_x;\n"+
      "static double _rvec_y;\n"+
      "static double _rvec_z;\n"+
      "static double _rvec_w;\n"+
      "\n"+
      // scratch space for closure pointer return
      "static int _cp_base;\n"+
      "static int _cp_offset;\n"+
      // scratch space for array return
      "static int _r_arr_ptr;\n"+
      "static int _r_arr_sz;\n"
    );
    
    jsfile.openSection("variables");
    
    // backup
    jsfile.addLine("#define stackborder (512*1024)");
    // stack pointer
    jsfile.addLine("static int SP = stackborder;"); // grows down, underflow bounded
    // heap pointer
    jsfile.addLine("static int HP = stackborder;"); // grows up, overflow bounded

    jsfile.openSection("decls");
    
    jsfile.openSection("functions");
    
    jsfile.addLine("static int my_malloc(int size) {");
    jsfile.indent();
    jsfile.addLine("int res = HP;");
    jsfile.addLine("HP += size;");
    jsfile.addLine("if (HP > _memory_limit) {");
    jsfile.indent();
    jsfile.addLine("abort();");
    jsfile.unindent();
    jsfile.addLine("}");
    jsfile.addLine("return res;");
    jsfile.unindent();
    jsfile.addLine("}");
  } else {
    jsfile.addLine("\"use asm\";");
    
    jsfile.openSection("globals");
    
    jsfile.add(
      "var sqrt = stdlib.Math.sqrt;\n"+
      "var abs = stdlib.Math.abs;\n"+
      "var pow = stdlib.Math.pow;\n"+
      "var sin = stdlib.Math.sin;\n"+
      "var cos = stdlib.Math.cos;\n"+
      "var tan = stdlib.Math.tan;\n"+
      "var asin = stdlib.Math.asin;\n"+
      "var acos = stdlib.Math.acos;\n"+
      "var atan2 = stdlib.Math.atan2;\n"+
      "var imul = stdlib.Math.imul;\n"+
      "var floor = stdlib.Math.floor;\n"+
      "var fround = stdlib.Math.fround;\n"+
      "\n"+
      "var Infinity = stdlib.Infinity;\n"+
      "var Int32Array = stdlib.Int32Array;\n"+
      "var Float32Array = stdlib.Float32Array;\n"+
      "var Float64Array = stdlib.Float64Array;\n"+
      "\n"+
      "var alert_ = foreign.alert_;\n"+
      "var error = foreign.error;\n"+
      "var isFinite = foreign.isFinite;\n"+
      "var hit = foreign.hit;\n"+
      "var dw = foreign.dw|0;\n"+
      "var dh = foreign.dh|0;\n"+
      "var di = foreign.di|0;\n"+
      "var _memory_limit = foreign.memory_limit|0;\n"+
      "\n"+
      "var mem_i32 = new Int32Array(heap);\n"+
      "var mem_f32 = new Float32Array(heap);\n"+
      "\n"+
      // scratch space for vector return
      "var _rvec_x = "+tagf_init(0)+";\n"+
      "var _rvec_y = "+tagf_init(0)+";\n"+
      "var _rvec_z = "+tagf_init(0)+";\n"+
      "var _rvec_w = "+tagf_init(0)+";\n"+
      "\n"+
      // scratch space for closure pointer return
      "var _cp_base = 0;\n"+
      "var _cp_offset = 0;\n"+
      // scratch space for array return
      "var _r_arr_ptr = 0;\n"+
      "var _r_arr_sz = 0;\n");
    
    jsfile.openSection("variables");
    
    // stack pointer
    jsfile.addLine("var SP = foreign.stackborder|0;"); // grows down, underflow bounded
    // heap pointer
    jsfile.addLine("var HP = foreign.stackborder|0;"); // grows up, overflow bounded
    // backup
    jsfile.addLine("var stackborder = foreign.stackborder|0;");
    
    if (STACK_DEBUG) {
      jsfile.addLine("var stackdepth = 0;");
      jsfile.addLine("var check_start = function() {"
        +"if (stackdepth > 100) debugger;"
        +"stackdepth ++;"
      +"};");
      jsfile.addLine("var check_end = function() {"
        +"stackdepth --;"
      +"};");
    }
    
    jsfile.openSection("functions");
    
    jsfile.addLine("function malloc(size) {");
    jsfile.indent();
    jsfile.addLine("size = size | 0;");
    jsfile.addLine("");
    jsfile.addLine("var res = 0;");
    jsfile.addLine("");
    jsfile.addLine("res = HP | 0;");
    jsfile.addLine("HP = ((HP|0) + (size|0))|0;");
    jsfile.addLine("if ((HP|0) > (_memory_limit|0)) {");
    jsfile.indent();
    jsfile.addLine("error(1);");
    jsfile.unindent();
    jsfile.addLine("}");
    jsfile.addLine("return res|0;");
    jsfile.unindent();
    jsfile.addLine("}");
    
    jsfile.addLine("function nancheck(f) {");
    jsfile.indent();
    jsfile.addLine("f = +f;");
    jsfile.addLine("");
    jsfile.addLine("if ((+f) != (+f)) {");
    jsfile.indent();
    jsfile.addLine("error(2);");
    jsfile.unindent();
    jsfile.addLine("}");
    jsfile.addLine("return +f;");
    jsfile.unindent();
    jsfile.addLine("}");
  }
  
  var get_context_and_eval_for_file = null;
  
  var sysctx = setupSysctx();
  
  defun(sysctx, "_require", function(context, thing, args) {
    for (var i = 0; i < args.length; ++i) {
      var arg = args[i];
      var subthing = thing.value[i+1];
      if (arg.kind != "atom") fail(subthing, "expect quoted atoms as argument for '_require'");
      var filename = arg.value;
      try {
        var subfile = get_context_and_eval_for_file(filename, subthing);
        if (!subfile) fail(subthing, "no such module found");
        
        var toplevel = context;
        if (!toplevel.hasOwnProperty("toplevel")) fail(subthing, "'require' only permitted at the top level."+context.info());
        toplevel.addRequire(subfile.context);
      } catch (error) {
        if (error instanceof RequireLoopError) {
          fail(subthing, error.message);
        } else throw error;
      }
    }
  });
  
  var context_list = [];
  var already_parsing = {};
  get_context_and_eval_for_file = function(fn, thing) {
    if (already_parsing.hasOwnProperty(fn)) throw new RequireLoopError('require loop: "'+fn+'"');
    
    for (var i = 0; i < context_list.length; ++i) {
      if (context_list[i].name == fn) return context_list[i];
    }
    
    var file_context = new Context(sysctx);
    file_context.toplevel = true;
    if (fn != "prelude") {
      var prelude = get_context_and_eval_for_file("prelude", thing);
      if (!prelude) fail(thing, "prelude module not found");
      file_context.addRequire(prelude.context);
    }
    
    var file = get_file(fn);
    if (file == null) return null;
    
    already_parsing[fn] = true;
    
    var parser = new Parser(file.src, file.rowbase);
    var obj = null;
    while (!parser.eof()) {
      var thing = sexpr_parse(file_context, parser);
      var thing2 = unroll_macros(file_context, thing);
      // log("B: ", sexpr_dump(thing));
      var list = convert_closures(file_context, thing2);
      // log("C: ", sexpr_dump(list));
      for (var i = 0; i < list.length; ++i) {
        obj = file_context.eval(list[i]);
      }
    }
    
    var res = {name: fn, obj: obj, context: file_context};
    context_list.push(res);
    delete already_parsing[fn];
    
    return res;
  };
  
  var main = get_context_and_eval_for_file(null);
  
  // log("bake");
  
  var record_fns = [], restore_fns = [];
  
  jsfile.openSection("function");
  
  if (PLATFORM_ELECTRON) {
    jsfile.addLine("static void resetGlobals() {");
  } else {
    jsfile.addLine("function resetGlobals() {");
  }
  
  jsfile.indent();
  jsfile.addLine("HP = stackborder|0;");
  
  for (var i = 0; i < context_list.length; ++i) {
    var context = context_list[i].context;
    while (context) { // bake for entire list of frozen clones
      for (var key in context.table) {
        var value = context.table[key];
        if (typeof value == "object" && lit_float(value)) {
          // bake in
          var jsname = jsfile.allocName("g", key);
          // log("baking "+jsname);
          var initializer = null, type = null;
          if (lit_int(value)) {
            initializer = js_tag_init("int", value.value);
            type = "int";
          } else {
            initializer = js_tag_init("float", value.value);
            type = "float";
          }
          
          if (PLATFORM_ELECTRON) {
            jsfile.addLine("variables", "static "+js_type_to_c(type)+" "+jsname+" = "+initializer+";");
            jsfile.addLine("variables", "static "+js_type_to_c(type)+" "+jsname+"_backup;");
          } else {
            jsfile.addLine("variables", "var "+jsname+" = "+initializer+";");
            jsfile.addLine("variables", "var "+jsname+"_backup = "+initializer+";");
          }
          jsfile.set(type, jsname, initializer);
          record_fns.push(function(jsname, jsfile, type) {
            return function() {
              jsfile.set(type, jsname+"_backup", jsname);
            };
          }(jsname, jsfile, type));
          restore_fns.push(function(jsname, jsfile, type) {
            return function() {
              jsfile.set(type, jsname, jsname+"_backup");
            };
          }(jsname, jsfile, type));
          
          context.table[key] = {kind: "expr", type: type, value: jsname};
        }
      }
      context = context.sup;
    }
  }
  
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  jsfile.openSection("function");
  if (PLATFORM_ELECTRON) {
    jsfile.addLine("static void recordGlobals() {");
  } else {
    jsfile.addLine("function recordGlobals() {");
  }
  jsfile.indent();
  for (var i = 0; i < record_fns.length; i++) record_fns[i]();
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  jsfile.openSection("function");
  if (PLATFORM_ELECTRON) {
    jsfile.addLine("static void restoreGlobals() {");
  } else {
    jsfile.addLine("function restoreGlobals() {");
  }
  jsfile.indent();
  for (var i = 0; i < restore_fns.length; i++) restore_fns[i]();
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  // last lambda is compiled, not interpreted
  var callctx = new Context(main.context, jsfile);
  
  var main_fn = main.obj;
  
  if (PLATFORM_ELECTRON) {
    jsfile.add(
      "static int X_from, Y_from, I_from, T_from, X_to, Y_to, I_to, T_to;\n"+
      "static float *Data_ptr;\n"+
      // ignore i since it's additive
      "static void hit(int x, int y, int i, int t, double r, double g, double b) {\n"+
      "  int Dw = X_to - X_from, Dh = Y_to - Y_from, Dt = T_to - T_from;\n"+
      "  int base = (x - X_from) + ((y - Y_from) * Dw) + ((t - T_from) * Dw * Dh);\n"+
      "  if (base < 0 || base >= Dw * Dh * Dt) abort(); /* wat */\n"+
      "  Data_ptr[base*3+0] += r;\n"+
      "  Data_ptr[base*3+1] += g;\n"+
      "  Data_ptr[base*3+2] += b;\n"+
      "}\n"
    );
  }
  
  jsfile.openSection("function");
  
  if (PLATFORM_ELECTRON) {
    jsfile.addLine("void setupScene() __attribute__ ((externally_visible));");
    jsfile.addLine("void setupScene() {");
  } else {
    jsfile.addLine("function setupScene() {");
  }
  jsfile.indent();
  jsfile.addLine("resetGlobals();");
  
  // unroll any number of nested argument-less lambdas (only need one, but why not)
  while (main_fn.arity == 0) {
    main_fn = callctx.eval(list({kind: "quote", value: main_fn}));
  }
  
  jsfile.addLine("recordGlobals();");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  jsfile.openSection("function");
  if (PLATFORM_ELECTRON) {
    jsfile.addLine("void executeRange(int x_from, int y_from, int i_from, int t_from, int x_to, int y_to, int i_to, int t_to, float *data_ptr) __attribute__ ((externally_visible));");
    jsfile.addLine("void executeRange(int x_from, int y_from, int i_from, int t_from, int x_to, int y_to, int i_to, int t_to, float *data_ptr) {");
    jsfile.indent();
    jsfile.addLine("X_from = x_from; Y_from = y_from; I_from = i_from; T_from = t_from;");
    jsfile.addLine("X_to = x_to; Y_to = y_to; I_to = i_to; T_to = t_to;");
    jsfile.addLine("Data_ptr = data_ptr;");
    jsfile.addLine("");
    jsfile.addLine("int x = 0;");
    jsfile.addLine("int y = 0;");
    jsfile.addLine("int i = 0;");
    jsfile.addLine("int t = 0;");
    jsfile.addLine("int HP_snapshot;");
  } else {
    jsfile.addLine("function executeRange(x_from, y_from, i_from, t_from, x_to, y_to, i_to, t_to) {");
    jsfile.indent();
    jsfile.addLine("x_from = x_from|0;");
    jsfile.addLine("y_from = y_from|0;");
    jsfile.addLine("i_from = i_from|0;");
    jsfile.addLine("t_from = t_from|0;");
    jsfile.addLine("x_to = x_to|0;");
    jsfile.addLine("y_to = y_to|0;");
    jsfile.addLine("i_to = i_to|0;");
    jsfile.addLine("t_to = t_to|0;");
    
    jsfile.addLine("var x = 0;");
    jsfile.addLine("var y = 0;");
    jsfile.addLine("var i = 0;");
    jsfile.addLine("var t = 0;");
    jsfile.addLine("var HP_snapshot = 0;");
  }
  
  jsfile.addLine("restoreGlobals();");
  
  // record start hp (not stackborder, because setupScene ran first)
  jsfile.addLine("HP_snapshot = HP|0;");
  
  jsfile.addLine("t = t_from|0;");
  jsfile.addLine("while ((t|0) < (t_to|0)) {");
  jsfile.indent();
  jsfile.addLine("y = y_from|0;");
  jsfile.addLine("while ((y|0) < (y_to|0)) {");
  jsfile.indent();
  jsfile.addLine("x = x_from|0;");
  jsfile.addLine("while ((x|0) < (x_to|0)) {");
  jsfile.indent();
  jsfile.addLine("i = i_from|0;");
  jsfile.addLine("while ((i|0) < (i_to|0)) {");
  jsfile.indent();
  jsfile.addLine("HP = HP_snapshot|0;"); // reset
  
  // pass lambda-to-call to trace
  var trace_args = [
    {kind: "expr", type: "int", value: "x"},
    {kind: "expr", type: "int", value: "y"},
    {kind: "expr", type: "int", value: "i"},
    {kind: "expr", type: "int", value: "t"},
    main_fn
  ];
  var flattened = flatten_array(null, trace_args);
  
  build_js_call(null, jsfile, "trace", "void", flattened.array)
  
  jsfile.addLine("i = (i + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.addLine("x = (x + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.addLine("y = (y + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.addLine("t = (t + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  jsfile.openSection("function");
  
  var parnames = [];
  var inside_flatargs = [];
  for (var i = 0; i < flattened.types.length; ++i) {
    parnames.push("par"+i);
    inside_flatargs.push({kind: "expr", type: flattened.types[i], value: parnames[i]});
  }
  if (PLATFORM_ELECTRON) {
    var parpairs = [];
    for (var i = 0; i < flattened.types.length; i++) parpairs.push(js_type_to_c(flattened.types[i])+" "+parnames[i]);
    jsfile.addLine("decls", "static void trace("+parpairs.join(", ")+");");
    jsfile.addLine("static void trace("+parpairs.join(", ")+") {");
  } else {
    jsfile.addLine("function trace("+parnames.join(", ")+") {");
  }
  jsfile.indent();
  
  for (var i = 0; i < flattened.types.length; ++i) {
    jsfile.set(flattened.types[i], parnames[i], parnames[i]);
  }
  
  jsfile.openSection("variables");
  
  var inside_args = reconstruct_array(jsfile, trace_args, inside_flatargs);
  
  jsfile.openSection("body");
  jsfile.defineVar("BP", "int", "SP", "variables"); // stack base pointer
  
  // call innermost lambda: vec = (fn x y i)
  // TODO check for (fn x y i t)
  var vec = callctx.eval(list(
    {kind: "quote", value: inside_args[4]},
    {kind: "quote", value: inside_args[0]},
    {kind: "quote", value: inside_args[1]},
    {kind: "quote", value: inside_args[2]}
  ));
  
  var xvar = js_tag(inside_args[0]), yvar = js_tag(inside_args[1]),
      ivar = js_tag(inside_args[2]), tvar = js_tag(inside_args[3]);
  var rvar = js_tag("double", vec.value[0]), gvar = js_tag("double", vec.value[1]), bvar = js_tag("double", vec.value[2]);
  
  jsfile.addLine("hit("+xvar+", "+yvar+", "+ivar+", "+tvar+", "+rvar+", "+gvar+", "+bvar+");");
  
  jsfile.set("int", "SP", "BP");
  
  jsfile.unindent();
  jsfile.addLine("}");
  
  jsfile.closeSection("body");
  jsfile.closeSection("variables");
  jsfile.closeSection("function");
  
  jsfile.openSection("tables");
  
  jsfile.emitFunctionTables();
  
  if (!PLATFORM_ELECTRON) {
    jsfile.addLine("return {setupScene: setupScene, executeRange: executeRange};");
  }
  
  var malloc = PLATFORM_ELECTRON?"my_malloc":"malloc";
  jsfile.replace(malloc+"(0)", "HP"); // peephole
  
  return jsfile.all_source();
}
