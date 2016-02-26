Error.stackTraceLimit=undefined;
/** @Constructor */
function RequireLoopError(msg) {
  this.name = 'RequireLoopError';
  this.message = msg;
}

function fail(thing, info) {
  if (typeof thing == 'object' && thing && 'fail' in thing) thing.fail(info);
  if (typeof log != "undefined") log(info);
  throw new Error("broken "+typeof thing).stack;
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
    if (str_is_int(value)) {
      return value+".0";
      // return "fround("+value+")";
    } else if (""+parseFloat(value) == value) {
      value = parseFloat(value).toFixed(20);
      return value;
      // return "fround("+value+")";
    }
  }
}

function suspect(text) {
  if (text.search("undefined") !== -1 || text.search("object Object") !== -1) {
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
  return false;
}

function str_is_int(arg) {
  return ""+parseInt(arg, 10) == arg;
}

function coerce_int(arg) {
  if (typeof arg == "string" && arg.slice(0, 2) == "__") { /* replaced with integer later */
    return arg;
  }
  if (isFloat(arg)) {
    return ""+(~~(parseFloat(arg, 10)));
  }
  return "~~"+paren_maybe(arg, "~");
}

function paren_maybe(ex, op) {
  ex = ""+ex;
  var is_simple_identifier = function(text) {
    return !!text.match(/^[a-zA-Z_][0-9a-zA-Z_]*$/);
  };
  var is_number = function(text) {
    if (str_is_int(text)) return true;
    if (""+parseFloat(text) == text) return true;
    if (""+parseFloat(text)+".0" == text) return true; // forced double
    return false;
  };
  var is_basic = function(text) {
    return is_simple_identifier(text) || is_number(text);
  };
  if (is_basic(ex)) return ex;
  if ("+.*/&|^~<=>=".indexOf(op) != -1) {
    if (ex.slice(0,1) == "+" && is_basic(ex.slice(1))) return " "+ex;
  }
  return "("+ex+")";
}

function js_tag(type, value) {
  if (typeof value == "undefined") {
    value = type;
    if (typeof value != "object") throw "what is "+typeof value+" "+value;
    
    if (value.kind == "frame") value = value.base;
    
    if (value.kind == "variable") {
      type = value.type;
      value = value.value;
    } else if (value.kind == "number") {
      var res = tagf_init(value.value);
      if (res != null) return res;
      throw "what why can't I tag init '"+value.value+"'";
    } else if (value.kind == "bool") {
      value = value.value;
      type = "int";
    } else throw "how tag "+value.kind;
  }
  if (type == "float") return "+"+paren_maybe(value, "+");
  // if (type == "float") return "fround("+value+")";
  if (type == "double") return "+"+paren_maybe(value, "+");
  if (type == "int") return paren_maybe(value, "|")+"|0";
  if (type == "bool") return paren_maybe(value, "|")+"|0";
  throw "how tag "+type;
  // return value;
}

function js_as_type(type, value) {
  if (value.kind == "variable" && value.type == type) {
    return js_tag(value);
  }
  if (value.kind == "number") {
    if (type == "float") return js_tag_init("float", value.value);
    if (type == "int" && str_is_int(value.value)) {
      return ""+parseInt(value.value);
    }
  }
  fail(value, "as_type? <"+type+"> "+JSON.stringify(value));
}

// for unification
function js_typelist(thing) {
  if (thing.kind == "variable") {
    return [thing.type];
  } else if (thing.kind == "number") {
    if (str_is_int(thing.value)) {
      return ["int", "float", "double"];
    } else {
      return ["float", "double"];
    }
  } else if (thing.kind == "bool") {
    return ["int"];
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
    return {kind: "variable", type: type, value: js_as_type(type, thing)};
  };
  var ltypes = js_typelist(left), rtypes = js_typelist(right);
  var shared = first_common(ltypes, rtypes);
  if (shared) return {left: packtag(shared, left), right: packtag(shared, right)};
  
  fail(left, "unsure how to unify "+JSON.stringify(left)+", "+JSON.stringify(right)+", types "+JSON.stringify(ltypes)+", "+JSON.stringify(rtypes));
  return {left: left, right: right};
}

function js_set_at(context, type, base, offs, value) {
  var target = js_get_at(type, base, offs);
  var js = context.js;
  
  var vt = js_type(value);
  if (JSON.stringify(vt) != JSON.stringify(type)) {
    throw ("types not equal in js_set_at - "+JSON.stringify(type)+" vs. "+JSON.stringify(vt));
  }
  
  if (type == "vec3f") {
    js.set("float", target.value.x, value.value.x);
    js.set("float", target.value.y, value.value.y);
    js.set("float", target.value.z, value.value.z);
    return;
  }
  
  if (typeof type == "object") {
    if (type.kind == "frame") {
      js.set("int", target.base.value, value.base.value);
      return;
    }
    if (type.kind == "closure-poly") {
      js.set("int", target.base.base.value, value.base.base.value);
      return;
    }
    if (type.kind == "closure") {
      js.set("int", target.base.base.value, value.base.base.value);
      js.set("int", target.fnptr.offset.value, value.fnptr.offset.value);
      return;
    }
    if (type.kind == "struct") {
      for (var key in target.value) if (target.value.hasOwnProperty(key)) {
        var type = target.type.types[key];
        var offset = target.type.offsets[key];
        js_set_at(context, type, base, offs + offset,
          js_get_at(type, base, offs + offset));
      }
      return;
    }
  }
  
  js.set(type, target.value, js_tag(value));
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
  
  if (type == "vec3f") {
    return mkVec3f_direct(
      js_get_at("float", base, offs+0),
      js_get_at("float", base, offs+4),
      js_get_at("float", base, offs+8));
  }
  if (typeof type == "object") {
    if (type.kind == "struct") {
      var value = {};
      for (var key in type.types) if (type.types.hasOwnProperty(key)) {
        var mtype = type.types[key];
        var moffset = type.offsets[key];
        value[key] = js_get_at(mtype, base, offs + moffset);
      }
      return {
        kind: "struct",
        type: type,
        base: base,
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
    if (type.kind == "closure") {
      return new ClosurePointer(
        type,
        {kind: "frame", base: js_get_at("int", base, offs + 0)},
        js_get_at("int", base, offs + 4)
      );
    }
  }
  
  var shift = null, stackvar = null;
  if (type == "float") {
    shift = 2;
    stackvar = "mem_f32";
  } else if (type == "int" || type == "bool") {
    shift = 2;
    stackvar = "mem_i32";
  } else fail(null, "unimplemented js_get_at(type="+JSON.stringify(type)+", base="+JSON.stringify(base)+", offs="+offs+")");
  
  var target = null;
  if (offs === 0) {
    target = stackvar+"["+paren_maybe(js_tag(base), ">>")+" >> "+shift+"]";
  } else if (typeof offs == "number") {
    target = stackvar+"["+paren_maybe(js_op("+", js_tag(base), offs), ">>")+" >> "+shift+"]";
  } else {
    target = stackvar+"["+paren_maybe(js_op("+", js_tag(base), js_tag(offs)), ">>")+" >> "+shift+"]";
  }
  
  suspect(target);
  
  return {
    kind: "variable",
    type: type,
    value: target
  };
};

function js_tag_cast(type, thing) {
  if (type == "float") {
    if (thing.kind == "number" ||
        thing.kind == "variable" && thing.type == "float")
    {
      return js_tag(thing);
    }
  }
  return js_tag(type, js_tag(thing));
}

function js_op(op, a, b) {
  // int ops
  if (op == "<<" || op == ">>" || op == ">>>" || op == "&" || op == "|" || op == "^") {
    a = coerce_int(a);
    b = coerce_int(b);
  }
  return paren_maybe(a, op)+" "+op+" "+paren_maybe(b, op);
}

// turn a compound expression into an array of primitives
function flatten(base, thing) {
  if (thing == null)
    throw "flatten null?";
  if (typeof thing == "function-poly")
    return [thing]; // hopeless
  
  if (thing.kind == "number") {
    return [thing]; // primitive
  }
  if (thing.kind == "bool") {
    return [thing]; // primitive
  }
  if (thing.kind == "struct") {
    if (!thing.hasOwnProperty("base")) fail(base, "bad struct for runtime call");
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
  if (thing.kind == "variable") {
    return [thing]; // all "variables" are primitive
  }
  if (thing.kind == "vec3f") {
    return [
      {kind: "variable", type: "float", value: thing.value.x},
      {kind: "variable", type: "float", value: thing.value.y},
      {kind: "variable", type: "float", value: thing.value.z}];
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
  if (type == "float" || type == "int" || type == "bool") return [type];
  if (type == "vec3f") {
    return ["float", "float", "float"];
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
  if (thing.kind == "variable") return get_type_signature(thing.type);
  if (thing.kind == "number") return "float";
  if (thing.kind == "bool") return "bool";
  if (thing.kind == "vec3f") return "vec3f";
  if (thing.kind == "struct") {
    var values = thing.value;
    var parts = [];
    for (var key in values) if (values.hasOwnProperty(key)) {
      parts.push(get_type_signature(values[key]));
    }
    return "struct_" + parts.join("_") + "_";
  }
  if (thing.kind == "closure-poly") {
    return unique_id_for(thing, "closure_poly"); // each poly-closure is "unique"
  }
  if (thing.kind == "function-poly") {
    return unique_id_for(thing, "function_poly"); // each poly-function is "unique"
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
  function take(i) {
    if (vars.length < i) throw "reconstruct failure: vars ran out";
    var res = vars.slice(0, i);
    vars = vars.slice(i);
    return res;
  }
  var array = [];
  for (var i = 0; i < types.length; ++i) {
    var type = types[i];
    if (type == "int" || type == "float" || type == "bool") {
      array.push(take(1)[0]);
      continue;
    }
    if (type.kind == "frame") {
      array.push({kind: "frame", entries: type.entries, base: take(1)[0]});
      continue;
    }
    if (type.kind == "struct") {
      array.push(js_get_at(type, take(1)[0], 0));
      continue;
    }
    fail(null, "unimplemented: reconstruct "+JSON.stringify(type));
  }
  if (vars.length) throw "reconstruct failure: vars left over!";
  return array;
}

function js_type(thing) {
  if (thing.kind == "number") return "float";
  if (thing.kind == "bool") return "int";
  if (thing.kind == "variable") return thing.type;
  if (thing.kind == "struct") return thing.type;
  if (thing.kind == "vec3f") return "vec3f";
  if (thing.kind == "function" || thing.kind == "closure") {
    return thing.type;
  }
  if (thing.kind == "frame") return thing; // eesh
  if (thing.kind == "function-poly" || thing.kind == "closure-poly"
   || thing.kind == "function-pointer" || thing.kind == "closure-pointer") {
    if (thing.hasOwnProperty("type")) return thing.type;
    return thing; // Eeesh.
  }
  fail(thing, "what's its type?? "+JSON.stringify(thing));
}

function js_size(thing) {
  if (thing.kind == "number") return 4;
  if (thing.kind == "bool") return 4;
  if (thing.kind == "variable") {
    var type = thing.type;
    if (type == "float" || type == "int" || type == "bool") return 4;
  }
  if (thing.kind == "struct") return thing.type.size;
  if (thing.kind == "vec3f") return 16;
  // if (thing.kind == "function") return 4; // function table offset
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
  var type = null;
  if (thing.kind == "vec3f") type = "vec3f";
  else if (thing.kind == "number") type = "float";
  else if (thing.kind == "bool") type = "int";
  else if (thing.kind == "variable") type = thing.type;
  else if (thing.kind == "struct") type = "struct";
  else if (thing.kind == "frame") type = "frame";
  else if (thing.kind == "closure") type = "closure";
  else if (thing.kind == "closure-poly") type = "closure-poly";
  else if (thing.kind == "closure-pointer") type = "closure-pointer";
  else if (thing.kind == "function-poly") type = "function-poly";
  else fail(thing, "how to reconstruct "+typeof thing+" "+thing.kind);
  
  if (thing.kind == "bool") {
    if (array.length < 1) fail(thing, "reconstruct:0 internal error");
    if (array[0].kind != "variable" || array[0].type != "int") throw ("can't reconstruct bool from "+JSON.stringify(array[0]));
    return {
      value: js.mkVar(js_tag(array[0])+" != 0", "bool", "bool"),
      rest: array.slice(1)};
  }
  
  if (type == "float" || type == "int") {
    if (array.length < 1) fail(thing, "reconstruct:1 internal error");
    if (array[0].kind != "variable" || array[0].type != type) throw ("can't reconstruct "+type+" from "+JSON.stringify(array[0]));
    return {
      value: array[0],
      rest: array.slice(1)};
  }
  if (type == "vec3f") {
    if (array.length < 3) fail(thing, "reconstruct:2 internal error");
    var x = array[0], y = array[1], z = array[2];
    if (x.kind != "variable" && x.type != "float") throw ("can't reconstruct vector from "+JSON.stringify(x));
    if (y.kind != "variable" && y.type != "float") throw ("can't reconstruct vector from "+JSON.stringify(y));
    if (z.kind != "variable" && z.type != "float") throw ("can't reconstruct vector from "+JSON.stringify(z));
    return {
      value: {kind: "vec3f", value: {x: x.value, y: y.value, z: z.value}},
      rest: array.slice(3)};
  }
  if (type == "frame") {
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
  if (type == "closure") {
    if (!thing.hasOwnProperty("value")) {
      // interpreted-to-compiled
      return {value: thing, rest: array};
    }
    fail(thing, "unimplemented: runtime closure");
  }
  if (type == "closure-pointer") {
    var res = flatclone(thing);
    res.fnptr = flatclone(res.fnptr);
    
    res.base = {kind: "frame", base: array[0]};
    res.fnptr.offset = array[1];
    if (!res.fnptr.offset) throw "what";
    return {value: res, rest: array.slice(2)};
  }
  if (type == "function-poly") {
    var res = flatclone(thing);
    return {value: res, rest: array};
  }
  if (type == "closure-poly") {
    var res = flatclone(thing);
    res.base = flatclone(thing.base);
    if (res.base.hasOwnProperty("base")) {
      res.base.base = array[0];
      return {value: res, rest: array.slice(1)};
    } else {
      return {value: res, rest: array};
    }
  }
  if (type == "struct") {
    var base = array[0], rest = array.slice(1);
    var type = thing.type;
    
    var value = js_get_at(type, base, 0);
    return { rest: rest, value: value };
  }
  
  fail(thing, "unimplemented: reconstruct "+type);
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
  this.clean = function() {
    // eat leading space or comments
    this.text = this.text.replace(/^(\s+|;[^\n]*\n)+/g, '');
  };
  this.getLocation = function(text) {
    var fulltext_lines = this.fulltext.split("\n");
    var left_lines = text.split("\n");
    var line = fulltext_lines.length - left_lines.length;
    var full_line = fulltext_lines[line];
    var column = full_line.length - left_lines[0].length;
    return {row: line + this.rowbase, column: column};
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
  this.gotNumber = function() {
    this.clean();
    var hit = this.text.match(/^(-?(0x[0-9a-fA-F]+|[0-9]+|[0-9]*\.[0-9]+))(\s|[)])/);
    if (!hit) return false;
    this.text = this.text.substr(hit[1].length);
    if (hit[1].slice(0,2) == "0x") {
      // hex literal
      return parseInt(hit[1].slice(2), 16);
    }
    return parseFloat(hit[1], 10);
  };
  this.eof = function() {
    this.clean();
    return this.text.length === 0;
  };
}

function sexpr_parse(context, parser) {
  var thing = {};
  var text_at = parser.text;
  var text_post = null;
  function failHere(info) {
    var loc1 = parser.getLocation(text_at);
    var loc2 = parser.getLocation(text_post);
    log((loc1.row+1)+":"+loc1.column+": "+info);
    
    window.setErrorAt(loc1, loc2, info);
    
    throw info;
  }
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
  
  function makething(args) {
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
  }
  
  if (parser.accept("(")) {
    var sexpr = [];
    while (true) {
      if (parser.accept(")")) break;
      sexpr.push(sexpr_parse(context, parser));
    }
    text_post = parser.text;
    return makething({kind: "list", value: sexpr});
  }
  var number = parser.gotNumber();
  if (number !== false) {
    text_post = parser.text;
    return makething({kind: "number", value: number});
  }
  var ident = parser.gotIdentifier();
  if (ident !== false) {
    text_post = parser.text;
    return makething({kind: "atom", value: ident});
  }
  parser.fail("unexpected input");
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

function match_lambda(thing) {
  if (!match_op(thing, "lambda")) return null;
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
  return {
    arglist: args[0],
    argnames: argnames,
    body: body,
    thing: thing,
    rewriteWith: function(nbody) {
      var list = [];
      list.push({kind: "atom", value: "lambda"});
      list.push(this.arglist);
      list.push(nbody);
      return {
        kind: "list",
        fail: this.thing.fail,
        value: list
      };
    }
  };
}

/**
 * Convert nested lambdas into explicit closures using %make-closure.
 * In the process, nested lambdas are moved into the global namespace
 * and references to captured variables are replaced with indirect accesses
 * via a frame pointer.
 **/
function convert_closures(context, thing) {
  function base_recurse(thing, fn) {
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
  }
  
  function var_wrap(body, entry, value) {
    var varname = {kind: "quote", value: {
      kind: "atom",
      value: entry.rname,
    }};
    return list("%seq2_3",
      list("%set-framevar", "%stackframe", varname, value),
      body,
      list("%unset-framevar", "%stackframe", varname));
  }
  
  var converted_lambdas = [];
  
  function convert_lambda(lambda) {
    // log("==CONVERT_LAMBDA==");
    // log("== "+sexpr_dump(lambda.thing));
    var vars = [];
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
    
    function convert(lambda) {
      // log("==CONVERT==");
      // log("== "+sexpr_dump(lambda.thing));
      function rec_var(thing, lookup) {
        if (thing.kind == "atom") {
          return lookup(thing.value, "%stackframe") || thing;
        }
        
        var let1_props = match_let1(thing);
        if (let1_props) {
          var name = let1_props.name;
          // log("debug: ", name, "in", sexpr_dump(thing));
          var nvalue = rec_var(let1_props.value, lookup);
          var varinfo = vars[vars_rewrite_index++];
          if (!varinfo) {
            throw "tried to access "+(vars_rewrite_index-1)+" of "+vars.length+" ("+name+")";
          }
          if (varinfo.name != name) throw "internal error";
          
          if (!varinfo.accessed_from_sub) {
            var nbody = rec_var(let1_props.body, function(n, base) {
              if (n == let1_props.name) return null; // mask
              return lookup(n, base);
            });
            return let1_props.rewriteWith(nvalue, nbody);
          }
          
          var nbody = rec_var(let1_props.body, function(n, base) {
            if (n == let1_props.name) {
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
          var nbody = rec_var(lambda_props.body, function(n, track) {
            for (var i = 0; i < lambda_props.argnames.length; i++) {
              if (lambda_props.argnames[i] == n) return null; // mask
            }
            // access over lambda border, use parameter instead of variable
            return lookup(n, "%parentframe");
          });
          
          return lambda_props.rewriteWith(nbody);
        }
          
        return base_recurse(thing, function(thing) { return rec_var(thing, lookup); });
      }
      
      function rec_lift(thing) {
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
      }
      
      // setup for parameters that belong in the frame
      var nbody = rec_lift(rec_var(lambda.body, function(n, base) {
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
      return lambda.rewriteWith(
        list("let1",
          list("%stackframe", list("%make-frame")),
          nbody
        )
      );
    }
    
    function check_vars() {
      function rec(thing, lookup) {
        if (thing.kind == "atom") {
          lookup(thing.value); // touch
          return;
        }
        
        var let1_props = match_let1(thing);
        if (let1_props) {
          rec(let1_props.value, lookup);
          var name = let1_props.name;
          var varinfo = {
            name: name,
            rname: unique_id("var")+"_"+filter_string(name),
            accessed_from_sub: false,
            thing: let1_props.thing
          }
          vars.push(varinfo);
          rec(let1_props.body, function(n, track) {
            if (n == let1_props.name) {
              if (track) varinfo.accessed_from_sub = true;
              return null;
            }
            return lookup(n, track);
          });
          return;
        }
        
        var lambda_props = match_lambda(thing);
        if (lambda_props) {
          rec(lambda_props.body, function(n, track) {
            for (var i = 0; i < lambda_props.argnames.length; i++) {
              if (lambda_props.argnames[i] == n) return null; // mask
            }
            // access over lambda border, activate tracking
            return lookup(n, true);
          });
          return;
        }
        
        base_recurse(thing, function(thing) { rec(thing, lookup); return thing; });
      }
      rec(lambda.body, function(n, track) {
        for (var i = 0; i < lambda.argnames.length; ++i) {
          var name = lambda.argnames[i];
          if (name == n) {
            if (track) vars[i].accessed_from_sub = true;
            return null;
          }
        }
      });
    }
    
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
  
  function rec_find_top_lambdas(thing, lookup) {
    var lambdaprop = match_lambda(thing);
    if (lambdaprop) {
      return convert_lambda(lambdaprop);
    }
    
    return base_recurse(thing, function(thing) { return rec_find_top_lambdas(thing, lookup); });
  }
  
  // log("X: ", sexpr_dump(thing));
  var nthing = rec_find_top_lambdas(thing, function(n) { return context.lookup(n); });
  
  var array = converted_lambdas.concat([nthing]);
  
  // log("Y: ", sexpr_dump(array));
  return array;
}

function match_let1(thing) {
  if (!match_op(thing, "let1")) return null;
  
  var args = thing.value.slice(1);
  if (args.length != 2) fail(thing, "'let1' expects two arguments");
  
  var bind = args[0];
  if (bind.kind != "list"
   || bind.value.length != 2
   || bind.value[0].kind != "atom"
  )
    fail(bind, "'let1' expects (name value) pair!");
  
  return {
    name: bind.value[0].value,
    value: bind.value[1],
    bind: bind,
    body: args[1],
    thing: thing,
    rewriteWith: function(nvalue, nbody) {
      return {
        kind: "list",
        fail: this.thing.fail,
        value: [
          {kind: "atom", value: "let1"},
          {
            kind: "list",
            fail: this.thing.value[1].fail,
            value: [
              {kind: "atom", value: this.name},
              nvalue
            ]
          },
          nbody
        ]
      };
    }
  };
}

function unroll_macros(context, thing) {
  function rec(thing, lookup) {
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
  }
  var res = rec(thing, function(n) { return context.lookup(n); });
  // log("1: ", sexpr_dump(thing));
  // log("2: ", sexpr_dump(res));
  return res;
}

function sexpr_dump(thing) {
  if (thing == null) return "nil";
  
  if (thing.kind == "atom") return thing.value;
  else if (thing.kind == "quote") return "'"+sexpr_dump(thing.value);
  else if (thing.kind == "number") return thing.value;
  else if (thing.kind == "bool") return thing.value;
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
  else if (thing.kind == "variable") {
    return "&lt;"+thing.type+" "+thing.value+"&gt;";
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

function mkVec3f_direct(x, y, z) {
  if (x.type != "float")
    throw ("vector must be made of float, not "+x.type);
  if (y.type != "float")
    throw ("vector must be made of float, not "+y.type);
  if (z.type != "float")
    throw ("vector must be made of float, not "+z.type);
  
  return {kind: "vec3f", value: {x: x.value, y: y.value, z: z.value}};
}

function mkVec3f(js, x, y, z) {
  var vx = js.mkVar(x, "float", "x");
  var vy = js.mkVar(y, "float", "y");
  var vz = js.mkVar(z, "float", "z");
  return mkVec3f_direct(vx, vy, vz);
}

function copy(js, thing) {
  if (thing === null) return null;
  if (thing.kind == "function") return thing; // hopeless
  if (thing.kind == "variable") {
    return js.mkVar(thing.value, thing.type, "copy");
  }
  if (thing.kind == "number") {
    return js.mkVar(thing.value, "float", "copy");
  }
  if (thing.kind == "bool") {
    return js.mkVar(thing.value, "bool", "copy");
  }
  if (thing.kind == "vec3f") {
    js.nop();
    return mkVec3f(js, thing.value.x, thing.value.y, thing.value.z);
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
  if (thing.kind == "struct" && thing.hasOwnProperty("base")) {
    return js_get_at(thing.type, copy(js, thing.base), 0);
  }
  if (thing.kind == "frame" && thing.hasOwnProperty("base")) {
    var res = flatclone(thing);
    res.base = copy(js, res.base);
    return res;
  }
  fail(thing, "how copy "+thing.kind+" "+JSON.stringify(thing));
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
  // if (value == null) fail(let1_props.thing.value[1], "'let' value is null");
  // if (value == null) log("debug let1:", name, "=", sexpr_dump(value), " ("+((value == null)?"null":"defined")+") from ", sexpr_dump(let1_props.value));
  letctx.add(name, value);
  return letctx.eval(let1_props.body);
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
  }
  context.namehint = backup_namehint;
  
  var toplevel = context;
  if (!toplevel.hasOwnProperty("toplevel")) fail(thing, "'def' only permitted at the top level."+context.info());
  toplevel.add(name, value);
  
  return value;
}

function js_set(js, thing, target, value) {
  if (target == null || value == null) fail(thing, "what");
  // fake it
  if (value.kind == "number") {
    value = {kind: "variable", type: "float", value: tagf_init(value.value)};
  }
  if (value.kind == "bool") {
    value = {kind: "variable", type: "bool", value: value.value};
  }
  
  if (target.kind == "variable" && value.kind == "variable") {
    if (target.type != value.type)
      thing.fail("mismatch: assigning "+value.type+" to "+target.type);
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
  if (target.kind == "vec3f" && value.kind == "vec3f") {
    js.set("float", target.value.x, value.value.x);
    js.set("float", target.value.y, value.value.y);
    js.set("float", target.value.z, value.value.z);
    return;
  }
  fail(thing, "unimplemented: "+sexpr_dump(thing)+" -- "+JSON.stringify(target)+" = "+JSON.stringify(value));
}

function set_internal(context, thing, rest) {
  if (rest.length != 2) fail(thing, "'set' expected two arguments, target and value");
  var target = rest[0];
  var value = rest[1];
  var js = context.js;
  if (js) {
    var value_js = context.eval(value);
    js_set(js, thing, context.eval(target), value_js);
    // return value_js;
    return null;
  }
  
  if (target.kind != "atom") fail(target, "'set' requires an atom as the lhs in interpreted mode");
  var name = target.value;
  
  value = context.eval(value);
  context.modify(name, value);
  
  // return value;
  return null;
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
  else if (ret_type == "vec3f") {
    js.addLine(call+";");
    // immediately copy the return vals elsewhere
    ret_value = copy(js, {
      kind: "vec3f",
      value: {
        x: {kind: "variable", type: "float", value: "_rvec_x"},
        y: {kind: "variable", type: "float", value: "_rvec_y"},
        z: {kind: "variable", type: "float", value: "_rvec_z"}}});
  }
  else if (ret_type == null || ret_type == "void") {
    js.addLine(call+";");
  }
  else if (ret_type.kind == "struct") {
    var ret_base = js.mkVar(call, "int", "ret_base");
    ret_value = js_get_at(ret_type, ret_base, 0);
  }
  else if (ret_type.kind == "closure-poly") {
    js.addLine(call+";");
    ret_value = flatclone(ret_type);
    ret_value.base = flatclone(ret_value.base);
    ret_value.base.base = copy(js, {kind: "variable", type: "int", value: "_cp_base"});
  }
  else if (ret_type.kind == "closure") {
    js.addLine(call+";");
    ret_value = copy(js, new ClosurePointer(
      ret_type,
      {kind: "frame", base: {kind: "variable", type: "int", value: "_cp_base"}},
      {kind: "variable", type: "int", value: "_cp_offset"}
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
  
  var lambda_thing = {kind: "function-poly", arity: argnames.length};
  
  if (thing.hasOwnProperty("fail")) lambda_thing.fail = thing.fail;
  
  var standard_call = function(callctx, callthing, argnames, args) {
    // log("standard call");
    
    var callframe = new Context(contextview, callctx.js);
    
    callframe.namehint = namehint+"_call";
    
    for (var i = 0; i < args.length; ++i) {
      var arg = args[i];
      // log("debug call:", argnames[i], "=", sexpr_dump(arg));
      callframe.add(argnames[i], arg);
      callframe.add("self", lambda_thing);
    }
    
    var res = callframe.eval(body);
    // log("debug return:", namehint, "->", sexpr_dump(res), "from", sexpr_dump(body));
    return res;
  };
  
  var lambda_cache = [];
  var compiling_depth = 0;
  
  // create a version of the lambda adapted for the types of 'args'
  function instantiate_and_call(callctx, callthing, args, self) {
    if (args.length != argnames.length) callthing.fail("internal logic error");
    // list all the types of all the individual parameters
    // (decomposing structs and vectors)
    
    var js = callctx.js;
    // log("debug call", namehint);
    if (!js) return standard_call(callctx, callthing, argnames, args);
    
    var partypes = [];
    
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
      
      var early_ret_type = this.type
      
      var parnames = [];
      for (var i = 0; i < partypes.length; ++i) parnames.push("par"+i);
      // for inserting in the "functions" section of the module
      js.openSection("function", "functions");
      js.addLine("// signature: "+signature);
      js.addLine("function "+fn+"("+parnames.join(", ")+") {");
      js.indent();
      
      // declare argument types for asm.js
      for (var i = 0; i < partypes.length; ++i) {
        js.set(partypes[i], parnames[i], parnames[i]);
      }
      
      if (partypes.length) {
        js.addLine("");
      }
      
      js.openSection("variables");
      js.addLine("var BP = 0;"); // stack base pointer
      
      js.openSection("body");
      js.addLine("BP = SP;");
      
      var abort = function() {
        // discard
        js.popSection("body");
        js.popSection("variables");
        js.popSection("function");
      };
      
      // reform our decomposed parameters back into 'args'
      var inside_flat_arglist = [];
      for (var i = 0; i < partypes.length; ++i) {
        inside_flat_arglist.push({kind: "variable", type: partypes[i], value: parnames[i]});
      }
      
      var inside_args = reconstruct_array(js, args, inside_flat_arglist);
      // log("outside args=", JSON.stringify(args), "for", namehint);
      // log("inside_args=", JSON.stringify(inside_args), "for", namehint);
      
      for (var i = 0; i < argnames.length; ++i) {
        callframe.add(argnames[i], inside_args[i]);
      }
      
      compiling_depth ++;
      if (compiling_depth > 10) {
        fail(thing, "Function compiled in infinite? (or >10) self-recursion. Are you trying to compile a function that does not have a type?");
      }
      
      var res = callframe.eval(body);
      
      compiling_depth --;
      
      if (res == null) {
        ret_type = "void";
        js.addLine("SP = BP;");
        js.addLine("return");
      }
      else if (res.kind == "number") {
        ret_type = "float";
        js.addLine("SP = BP;");
        js.addLine("return "+js_tag(res)+";");
      }
      else if (res.kind == "bool") {
        ret_type = "int";
        js.addLine("SP = BP;");
        js.addLine("return "+js_tag(res)+";");
      }
      else if (res.kind == "vec3f") {
        ret_type = "vec3f";
        js.set("float", "_rvec_x", res.value.x);
        js.set("float", "_rvec_y", res.value.y);
        js.set("float", "_rvec_z", res.value.z);
        
        js.addLine("SP = BP;");
        js.addLine("return");
      }
      else if (res.kind == "variable" && (res.type == "float" || res.type == "bool" || res.type == "int")) {
        ret_type = res.type;
        js.addLine("SP = BP;");
        js.addLine("return "+js_tag(res)+";");
      }
      else if (res.kind == "struct") {
        ret_type = res.type;
        js.addLine("SP = BP;");
        js.addLine("return "+js_tag(res.base)+";");
      }
      else if (res.kind == "closure-poly") {
        ret_type = res;
        js.set("int", "_cp_base", res.base.base.value);
        js.addLine("SP = BP;");
        js.addLine("return");
      }
      else if (res.kind == "closure-pointer") {
        ret_type = res.type;
        js.set("int", "_cp_base", res.base.base.value);
        js.set("int", "_cp_offset", res.fnptr.offset.value);
        js.addLine("SP = BP;");
        js.addLine("return");
      }
      else {
        callthing.fail("3 how return "+JSON.stringify(res));
      }
      
      if (early_type && JSON.stringify(early_type) != JSON.stringify(ret_type)) {
        fail(thing, "function return type does not match declared return type: "+JSON.stringify(early_type)+" and "+JSON.stringify(ret_type));
      }
      
      js.closeSection("body");
      js.closeSection("variables");
      
      js.unindent();
      js.addLine("}");
      
      
      var fun = js.popSection("function");
      js.add("functions", fun);
      
      // log("late cache "+fn+": "+signature+": "+ret_type);
      lambda_cache[signature] = {fn: fn, ret_type: ret_type};
    }
    
    if (flat_args.length != partypes.length) callthing.fail("internal logic error");
    
    return build_js_call(callthing, js, fn, ret_type, flat_args);
  }
  
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
    js.addLine("function "+fn+"("+parnames.join(", ")+") {");
    js.indent();
    
    // declare argument types for asm.js
    for (var i = 0; i < partypes.length; ++i) {
      js.set(partypes[i], parnames[i], parnames[i]);
    }
    
    if (partypes.length) {
      js.addLine("");
    }
    
    js.openSection("variables");
    js.addLine("var BP = 0;"); // stack base pointer
    
    js.openSection("body");
    js.addLine("BP = SP;");
    
    // reform our decomposed parameters back into 'type.args'
    var inside_flat_arglist = [];
    for (var i = 0; i < partypes.length; ++i) {
      inside_flat_arglist.push({kind: "variable", type: partypes[i], value: parnames[i]});
    }
    
    var inside_args = reconstruct_by_types(js, type.args, inside_flat_arglist);
    
    var callframe = new Context(contextview, js);
    
    for (var i = 0; i < argnames.length; ++i) {
      callframe.add(argnames[i], inside_args[i]);
    }
    
    var res = callframe.eval(body);
    
    var ret_type = null;
    
    if (res == null) {
      js.addLine("SP = BP;");
      js.addLine("return");
      ret_type = "void";
    }
    else if (res.kind == "number") {
      js.addLine("SP = BP;");
      js.addLine("return "+js_tag(res)+";");
      ret_type = "float";
    }
    else if (res.kind == "vec3f") {
      ret_type = "vec3f";
      
      js.set("float", "_rvec_x", res.value.x);
      js.set("float", "_rvec_y", res.value.y);
      js.set("float", "_rvec_z", res.value.z);
      ret_type = "vec3f";
      
      js.addLine("SP = BP;");
      js.addLine("return");
    }
    else if (res.kind == "variable" && (res.type == "float" || res.type == "bool" || res.type == "int")) {
      js.addLine("SP = BP;");
      js.addLine("return "+js_tag(res)+";");
      ret_type = res.type;
    }
    else if (res.kind == "closure-pointer") {
      ret_type = res.type;
      js.set("int", "_cp_base", res.base.base.value);
      js.set("int", "_cp_offset", res.fnptr.offset.value);
      js.addLine("SP = BP;");
      js.addLine("return");
    }
    else {
      fail(thing, "1 how return "+JSON.stringify(res));
    }
    
    if (JSON.stringify(ret_type) != JSON.stringify(type.ret)) {
      fail(thing, "declared return type does not match actual return type - "+JSON.stringify(ret_type)+" != "+JSON.stringify(type.ret));
    }
    
    js.closeSection("body");
    js.closeSection("variables");
    
    js.unindent();
    js.addLine("}");
    
    var fun = js.popSection("function");
    js.add("functions", fun);
    
    return {
      kind: "function",
      signature: sign,
      ret: ret_type,
      args: type.args,
      fname: fn
    };
  };
  lambda_thing.call = function(callctx, callthing, args) {
    if (argnames.length != args.length) {
      callthing.fail("lambda call expected "+argnames.length+" arguments, but called with "+args.length);
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
          callframe.add(argnames[i], args[i]);
        }
        callframe.add("...", {
          kind: "list",
          fail: callthing.fail,
          value: args.slice(argnames.length - 1)
        });
      } else {
        for (var i = 0; i < args.length; ++i) {
          // log("for macro:", argnames[i], " = ", sexpr_dump(args[i]));
          callframe.add(argnames[i], args[i]); // add unevaluated
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
  if (test.kind == "bool") {
    if (test.value == true) {
      return context.eval(if_prop.branch_true);
    } else if (if_prop.branch_false) {
      return context.eval(if_prop.branch_false);
    } else return null;
  }
  var js = context.js;
  if (!js) fail(thing, "could not evaluate test condition at compile time; was "+test.kind);
  if (test.kind == "variable" && test.type == "bool") {
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
        // fake it
        if (case1.kind == "bool")
          case1 = {kind: "variable", type: "bool", value: case1.value};
        if (case2.kind == "bool")
          case2 = {kind: "variable", type: "bool", value: case2.value};
        if (case1.kind == "number")
          case1 = {kind: "variable", type: "float", value: case1.value};
        if (case2.kind == "number")
          case2 = {kind: "variable", type: "float", value: case2.value};
        
        function merge_amend(after1, after2) {
          js.indent();
          js.openSection("case1");
          js.add(case1_js);
          
          after1();
          
          case1_js = js.popSection("case1");
          js.openSection("case2");
          js.add(case2_js);
          
          after2();
          case2_js = js.popSection("case2");
        }
        
        if (case1.kind == "variable" && case2.kind == "variable") {
          if (case1.type != case2.type) {
            thing.fail("type mismatch between if branches: "+case1.type+" and "+case2.type);
          }
          js.unindent();
          phi = js.mkVar(null, case1.type, "phi");
          merge_amend(
            function() { js.set(case1.type, phi.value, case1.value); },
            function() { js.set(case1.type, phi.value, case2.value); });
        } else if (case1.kind == "vec3f" && case2.kind == "vec3f") {
          js.unindent();
          phi = mkVec3f(js,
            {kind: "variable", type: "float", value: null},
            {kind: "variable", type: "float", value: null},
            {kind: "variable", type: "float", value: null});
          
          var val = phi.value;
          merge_amend(
            function() {
              var c1v = case1.value, c2v = case2.value;
              js.set("float", val.x, c1v.x);
              js.set("float", val.y, c1v.y);
              js.set("float", val.z, c1v.z);
            },
            function() {
              var c2v = case2.value;
              js.set("float", val.x, c2v.x);
              js.set("float", val.y, c2v.y);
              js.set("float", val.z, c2v.z);
            });
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
    if (test.kind == "variable" && test.type == "bool") {
      js.addLine("if (!"+paren_maybe(test.value, "!")+") break;");
    }
    else thing.fail("unimplemented: while test that's "+JSON.stringify(test));
    res = context.eval(while_props.body);
    js.unindent();
    js.addLine("}");
    // the last loop pass will naturally be the one whose variables are "final"
  } else {
    while (true) {
      var test = context.eval(while_props.test);
      if (test.kind != "bool") fail(while_props.test, "test did not evaluate to a boolean");
      if (!test.value) break;
      res = context.eval(while_props.body);
    }
  }
  return res;
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
    
    names_arr.push(pair.value[0].value);
    values_arr.push(pair.value[1]);
  }
  return {
    names: names_arr,
    values: values_arr,
    location: location,
    rewriteWith: function(fn) {
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
    }
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
      context.js.set("int", "SP", js_op("-", "SP", res.type.size));
      base = context.js.mkVar("SP", "int", "struct_base");
    }
  } else if (location == "heap") {
    if (context.js) {
      // heap grows up
      base = context.js.mkVar("malloc("+res.type.size+")", "int", "struct_base");
      // base = context.js.mkVar("HP", "int", "struct_base");
      // context.js.set("int", "HP", js_op("+", "HP", res.type.size));
    }
  } else throw ("internal error "+location);
  
  alloc_struct_at(res, context, thing, names, values, base); 
  return res;
}

function makestruct_internal(context, thing, rest, location) {
  if (!rest.length) fail(thing, "make-struct expected list");
  
  var makestruct_props = match_makestruct(thing, location);
  
  var names_arr = makestruct_props.names;
  var values_arr = makestruct_props.values;
  
  for (var i = 0; i < values_arr.length; ++i) {
    values_arr[i] = context.eval(values_arr[i]);
  }
  
  return make_struct_on(location, context, thing, names_arr, values_arr);
}

function eval_builtin(context, thing) {
  if (thing.kind != "list") throw "internal error";
  var list = thing.value;
  if (!list.length || list[0].kind != "atom") throw "internal error";
  var name = list[0].value;
  var rest = list.slice(1);
  
  if (name == "let1") return let1_internal(context, thing, rest);
  if (name == "def") return def_internal(context, thing, rest);
  if (name == "set") return set_internal(context, thing, rest);
  
  if (name == "lambda") return lambda_internal(context, thing, rest);
  if (name == "macro" ) return macro_internal (context, thing, rest);
  
  if (name == "if")    return if_internal   (context, thing, rest);
  if (name == "while") return while_internal(context, thing, rest);
  
  if (name == "make-struct") return makestruct_internal(context, thing, rest, "stack");
  if (name == "alloc-struct") return makestruct_internal(context, thing, rest, "heap");
}

/** @constructor */
function Context(sup, js) {
  if (sup && !js && sup.js) js = sup.js;
  
  reserved_identifiers = {
    let1: 1, def: 1, set: 1,
    lambda: 1, macro: 1,
    "if": 1, "while": 1,
    "alloc-struct": 1, "make-struct": 1/*, "require": 1*/
  };
  
  this.sup = sup;
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
      
      if (context.sup) context = context.sup;
      else return;
    }
  };
  
  // TODO remove
  this.lookupPath = function(name, path, sysctx, local) {
    local = local || false;
    var context = this;
    while (true) {
      if (context === sysctx) path = ["sysctx"];
      
      if (typeof context.table[name] !== "undefined") return path.concat(["table[\""+jsStringEscape(name)+"\"]"]);
      
      if (local) return null;
      
      for (var i = 0; i < context.requires.length; ++i) {
        // requires are not transitive
        var res = context.requires[i].lookupPath(name, path.concat(["requires["+i+"]"]), sysctx, true);
        if (res) return res;
      }
      if (context.sup) {
        context = context.sup;
        path.push("sup");
      } else return null;
    }
  };
  
  this.add = function(name, value) {
    if (typeof name != "string") {
      log("what is a "+name);
      throw "fuck";
    }
    if (reserved_identifiers.hasOwnProperty(name)) {
      throw ("Cannot define variable named '"+name+"': reserved identifier!");
    }
    this.table[name] = value;
  };
  this.addRequire = function(context) {
    this.requires.push(context);
  };
  this.modify = function(name, value) {
    if (typeof name != "string") throw "shit fuck";
    if (typeof this.table[name] !== "undefined") {
      this.table[name] = value;
      return;
    }
    if (sup) sup.modify(name, value);
    else fail(value, "'"+name+"' not found; cannot modify");
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
    if (thing.kind == "quote") {
      return thing.value;
    }
    if (thing.kind == "atom") {
      var res = this.lookup(thing.value);
      
      if (typeof res != "undefined") return res;
      
      fail(thing, "Symbol '"+thing.value+"' not found."+this.info());
    }
    if (thing.kind == "number" || thing.kind == "bool") {
      return thing;
    }
    if (thing.kind == "list") {
      var list = thing.value;
      if (!list.length) thing.fail("Cannot evaluate empty list!");
      if (list[0].kind == "atom") {
        var res = eval_builtin(this, thing);
        if (typeof res !== "undefined") return res;
      }
      var op = this.eval(list[0]);
      if (op == null) {
        fail(list[0], "operator not found: "+sexpr_dump(list[0])+" at "+this.info());
      }
      if (op.kind == "function-poly" || op.kind == "closure-poly" || op.kind == "closure-pointer") {
        var lex_ctx = new Context(this);
        var args = [];
        
        if (op.kind == "closure-poly") {
          // log("closure-poly, push", JSON.stringify(op.base));
          args.push(op.base);
          op = op.fn;
        }
        if (op.kind == "closure-pointer") {
          // log("closure-pointer, push", JSON.stringify(op.base.base), "call", JSON.stringify(op.fnptr));
          args.push(op.base.base);
          op = op.fnptr;
        }
        
        for (var i = 1; i < list.length; ++i) {
          var arg = this.eval(list[i]);
          /*if (arg == null && sexpr_dump(list[i]) == "%parentframe") {
            log("Xdebug:", i, sexpr_dump(arg), "<-", sexpr_dump(list[i]), "at", this.info());
            fail(list[i], "what");
          }*/
          args.push(arg);
        }
        
        var res = op.call(lex_ctx, thing, args);
        if (typeof res == "undefined") res = null;
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

function emitStubFunction(js, type) {
  var flattened = flatten_type_array(type.args);
  var sign = flattened.signature;
  var partypes = flattened.js_types;
  
  var parnames = [];
  for (var i = 0; i < partypes.length; ++i) parnames.push("par"+i);
  
  var fn = js.allocName("f", "stub");
  
  js.openSection("function", "functions");
  js.addLine("function "+fn+"("+parnames.join(", ")+") {");
  js.indent();
  
  for (var i = 0; i < partypes.length; ++i) {
    js.set(partypes[i], parnames[i], parnames[i]);
  }
  
  js.addLine("error(0);");
  
  if (type.ret == "void") { js.addLine("return;"); }
  else if (type.ret == "int") { js.addLine("return 0;"); }
  else if (type.ret == "float") { js.addLine("return 0.0;"); }
  else fail(null, "unimplemented: stub return type "+JSON.stringify(type.ret));
  
  js.unindent();
  js.addLine("}");
  
  js.add("functions", js.popSection("function"));
  
  return fn;
}

function js_return_type(type) {
  if (type == "int" || type == "float" || type == "bool" || type == "void") return type;
  if (type.kind == "closure") {
    return "void"; // passed in globals
  }
  fail(null, "unimplemented: js_return_type("+JSON.stringify(type)+")");
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
      
      function is_pot(i) { return i > 0 && ((i & (i - 1)) == 0); }
      
      var stubname = null;
      if (!is_pot(list.length)) {
        stubname = emitStubFunction(js, type);
      }
      while (!is_pot(list.length)) {
        list.push(stubname);
      }
      
      var mask = list.length - 1;
      js.addLine("var "+name+" = ["+list.join(", ")+"];");
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
  this.allocVar = function(value, type, hint, location) {
    if (location == null) location = "variables";
    
    var name = this.allocName("v", hint);
    // JavaScript
    var initializer = js_tag_init(type, value);
    if (initializer != null) {
      this.addLine(location, "var "+name+" = "+initializer+";");
    } else {
      var sample = null;
      if (type == "float") sample = tagf_init("0");
      else if (type == "int") sample = "0";
      else if (type == "bool") sample = "0";
      else throw ("how init "+type+"?");
      
      this.addLine(location, "var "+name+" = "+sample+";");
      if (value != null) {
        this.set(type, name, value);
      }
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
      if (typeof value == "number") type = "float";
      else if (typeof value == "boolean") type = "bool";
      else if (typeof value == "object") {
        if (value.kind == "number") {
          type = "float";
        } else if (value.kind == "variable") {
          type = value.type;
        }
      }
    }
    if (!type) throw (
      "cannot make var: what is type of " +
      JSON.stringify(value) +
      "?");
    if (value === null) {
      return {
        kind: "variable",
        type: type,
        value: this.allocVar(null, type, hint, location)
      };
    }
    if (typeof value == "number" || typeof value == "string" || typeof value == "boolean") {
      return {
        kind: "variable",
        type: type,
        value: this.allocVar(value, type, hint, location)
      };
    }
    if (typeof value == "object") {
      if (value.kind == "number") {
        return {
          kind: "variable",
          type: type,
          value: this.allocVar(value.value, type, hint, location)
        };
      }
      if (value.kind == "variable") {
        return {
          kind: "variable",
          type: type,
          value: this.allocVar(value.value, type, hint, location)
        };
      }
    }
    log("how var of "+(typeof value)+" "+JSON.stringify(value));
    throw "fuck";
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

function mkRes(context, thing) {
  var
    zero = {kind: "variable", type: "float", value: "0"},
    success = {kind: "variable", type: "bool", value: "0"},
    distance = zero,
    reflect = mkVec3f_direct(zero, zero, zero),
    emit = mkVec3f_direct(zero, zero, zero),
    normal = mkVec3f_direct(zero, zero, zero);
  
  return make_struct_on("stack", context, thing,
    ["success", "distance", "reflect", "emit", "normal"],
    [success, distance, reflect, emit, normal]);
}

function defun(context, name, arity, fun) {
  if (typeof arity == "function") {
    fun = arity; arity = null;
  }
  var obj = {
    kind: "function-poly",
    namehint: name,
    call: function(context, thing, args) {
      if (arity != null && args.length != arity)
        fail(thing, "expect "+arity+" arguments for '"+name+"'");
      if (arity == null) {
        return fun.call(this, context, thing, args);
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

function js_call_fnptr(js, fnptr, thing, args) {
  var tblname = js.fntable.getTblNameForType(fnptr.type);
  var tbl_expr = tblname+"["+js_op("&", js_tag(fnptr.offset), js.fntable.getMaskId(tblname))+"]";
  
  var flattened = flatten_array(thing, args);
  var signature = flattened.signature;
  var flat_args = flattened.array;
  
  if (flat_args.length != fnptr.type.args.length) throw "internal type mismatch";
  
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
    function fmt(value) {
      if (value == null) return "'null'";
      if (value.kind == "vec3f") {
        return "'vec3f('+("+value.value.x+")+', '"+
          "+("+value.value.y+")+', '"+
          "+("+value.value.z+")+')'";
      }
      if (value.kind == "atom") {
        return "'"+jsStringEscape(value.value)+"'";
      }
      if (value.kind == "variable") {
        return "'<'+"+value.value+"+'>'";
      }
      if (value.kind == "number") {
        return value.value;
      }
      if (value.kind == "bool") {
        return value.value?"true":"false";
      }
      if (value.kind == "list") {
        var list = [];
        for (var i = 0; i < value.value.length; ++i) {
          list.push(fmt(value.value[i]));
        }
        if (!list.length) return "'()'";
        return "'('+"+list.join("+' '+")+"+')'";
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
        return "'&lt;closure(poly) to "+value.fn.namehint+", base at '+"+fmt(value.base.base)+"+'&gt;'";
      }
      if (value.kind == "closure-pointer") {
        return "'&lt;closure of "+get_type_signature(value)+", fn at '+"+fmt(value.fnptr.offset)+"+', base at '+"+fmt(value.base.base)+"+'&gt;'";
      }
      if (value.kind == "quote") {
        return "\"'\"+"+fmt(value.value);
      }
      return "'unimplemented: dump "+(JSON.stringify(value))+"'";
      // thing.fail("unimplemented: dump "+JSON.stringify(value));
    }
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
    if (value.kind != "list") {
      fail(thing, "'size' expected list as parameter");
    }
    return {kind: "number", value: value.value.length};
  });
  defun(sysctx, "first", "1", function(context, thing, value) {
    if (!value) fail(thing, "argument is null");
    if (value.kind == "list") {
      return value.value[0];
    }
    fail(thing, "first? "+JSON.stringify(value));
  });
  defun(sysctx, "list?", "1", function(context, thing, value) {
    return {kind: "bool", value: value.kind == "list"};
  });
  defun(sysctx, "struct?", "1", function(context, thing, value) {
    return {kind: "bool", value: value.kind == "struct"};
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
      return {kind: "bool", value: a.value === b.value};
    }
    if (a.kind != b.kind) return {kind: "bool", value: false};
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
  
  defun(sysctx, "%make-frame", 0, function(context, thing) {
    var js = context.js;
    if (!js) {
      return {kind: "frame", entries: {}};
    }
    var base = js.mkVar("malloc(__FRAME_SIZE__)", "int", "frame_base");
    // var base = js.mkVar("HP", "int", "frame_base");
    // js.set("int", "HP", js_op("+", "HP", "__FRAME_SIZE__"));
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
    if (frame.base.kind != "variable" || frame.base.type != "int") {
      fail(thing, "?? "+JSON.stringify(frame.base));
    }
    // offset from frame base = current depth - base depth
    var type = js_type(value);
    var size = js_size(value);
    var offset = frame.offset.value;
    
    js_set_at(context, type, frame.base, offset, value);
    
    frame.entries[name] = {type: type, offset: offset};
    frame.offset.value += size;
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
        
        return new ClosurePointer(type, this.base, {kind: "variable", type: "int", value: id});
      }
    };
  });
  
  defun(sysctx, "%seq2_3", 3, function(context, thing, a, b, c) { return b; });
  
  function mkNum(i) {
    return {kind: "number", value: i};
  }
  
  // a vec3f is a bundle of three variables
  defun(sysctx, "vec3f", function(context, thing, array) {
    var fun = function(x, y, z) { return mkVec3f(js, x, y, z); };
    var js = context.js;
    if (!js) {
      // TODO assert x,y,z are numbers
      fun = function(x, y, z) {
        // lol
        x = {kind: "variable", type: "float", value: x.value};
        y = {kind: "variable", type: "float", value: y.value};
        z = {kind: "variable", type: "float", value: z.value};
        return mkVec3f_direct(x, y, z);
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
  
  defun(sysctx, "_element", function(context, thing, array) {
    if (array.length < 2) fail(thing, "':' expected at least two arguments");
    var base = array[0];
    // log("debug _element:", sexpr_dump(thing));
    // log("debug _element::", JSON.stringify(array));
    if (base == null) fail(thing, "first value is null");
    if (base.kind == "list") throw "wtf";
    for (var i = 1; i < array.length; ++i) {
      // log("debug _element "+i+":", sexpr_dump(base));
      var key = array[i];
      if (key.kind != "atom")
        fail(thing.value[i+1], "cannot access member with key of type "+key.kind);
      var name = key.value;
      
      if (base == null) fail(thing.value[i], "key not found");
      
      if (base.kind == "vec3f") {
        if (name == "x")
          base = {kind: "variable", type: "float", value: base.value.x};
        else if (name == "y")
          base = {kind: "variable", type: "float", value: base.value.y};
        else if (name == "z")
          base = {kind: "variable", type: "float", value: base.value.z};
        else fail(thing, "undefined vector property '"+name+"'");
      } else if (base.kind == "struct") {
        if (base.value.hasOwnProperty(name)) {
          base = base.value[name];
        } else {
          fail(key, "undefined struct property '"+name+"' - "+sexpr_dump(thing));
        }
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
          base = base.entries[name].value;
        }
      } else {
        fail(key || thing.value[i+1], "cannot access property '"+name+"' of something that "+
          "is not a struct or vector, but a "+base.kind+" "+sexpr_dump(base));
      }
    }
    if (!context.js) {
      // log("what do with : result "+typeof(base)+" "+JSON.stringify(base)+" for "+sexpr_dump({kind: "list", value: array}));
      if (typeof base == "object") {
        if (base.type == "float" && typeof(base.value) == "number") {
          return {kind: "number", value: base.value};
        }
      }
    }
    return base;
  });
  defun(sysctx, "list", function(context, thing, array) {
    return {kind: "list", fail: thing.fail, value: array};
  });
  function make_ray_fn(context, thing, array, location) {
    if (array.length > 1) fail(thing, "make-ray expected none or one parameter");
    
    var zero = {kind: "variable", type: "float", value: "0"}; // lol
    var pos = mkVec3f_direct(zero, zero, zero)
        dir = mkVec3f_direct(zero, zero, zero),
        flags = {kind: "variable", type: "int", value: "3"};
    
    if (array.length == 1) {
      var srcray = array[0];
      if (srcray.kind != "struct" || !srcray.value.hasOwnProperty("flags")) {
        fail(thing, "expected ray as parameter to make-ray");
      }
      flags = srcray.value.flags;
    }
    
    return make_struct_on(location, context, thing,
      ["pos", "dir", "flags"],
      [pos, dir, flags]);
  }
  defun(sysctx, "make-ray", function(context, thing, array) { return make_ray_fn(context, thing, array, "stack"); });
  defun(sysctx, "alloc-ray", function(context, thing, array) { return make_ray_fn(context, thing, array, "heap"); });
  defun(sysctx, "make-res", 0, function(context, thing) { return mkRes(context, thing); });
  defun(sysctx, "sqrt", 1, function(context, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return context.js.mkVar("sqrt("+js_tag(value)+")", "float", "sqrt");
    }
    thing.fail("unimplemented: sqrt "+JSON.stringify(value));
  });
  defun(sysctx, "abs", 1, function(context, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return context.js.mkVar("abs("+js_tag(value)+")", "float", "abs");
    }
    if (value.kind == "number") return {kind: "number", value: Math.abs(value.value)};
    thing.fail("unimplemented: abs "+JSON.stringify(value));
  });
  defun(sysctx, "pow", 2, function(context, thing, value, exp) {
    if (value.kind == "number" && exp.kind == "number") {
      return {kind: "number", value: Math.pow(value.value, exp.value)};
    }
    
    if (value.kind == "number") value = {kind: "variable", type: "float", value: value.value};
    if (  exp.kind == "number")   exp = {kind: "variable", type: "float", value:   exp.value};
    
    if (value.kind == "variable" && value.type == "float"
       && exp.kind == "variable" &&   exp.type == "float") {
      return context.js.mkVar("pow("+js_tag(value)+", "+js_tag(exp)+")", "float", "pow");
    }
    thing.fail("unimplemented: pow "+JSON.stringify(value)+", "+JSON.stringify(exp));
  });
  defun(sysctx, "sin", 1, function(context, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return context.js.mkVar("sin("+js_tag(value)+")", "float", "sin");
    }
    if (value.kind == "number") return {kind: "number", value: Math.sin(value.value)};
    thing.fail("unimplemented: sin "+JSON.stringify(value));
  });
  defun(sysctx, "cos", 1, function(context, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return context.js.mkVar("cos("+js_tag(value)+")", "float", "cos");
    }
    thing.fail("unimplemented: cos "+JSON.stringify(value));
  });
  defun(sysctx, "tan", 1, function(context, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return context.js.mkVar("tan("+js_tag(value)+")", "float", "tan");
    }
    thing.fail("unimplemented: tan "+JSON.stringify(value));
  });
  defun(sysctx, "atan2", 2, function(context, thing, y, x) {
    if (y.kind == "variable" && y.type == "float" && x.kind == "variable" && x.type == "float") {
      return context.js.mkVar("atan2("+js_tag(y)+", "+js_tag(x)+")", "float", "atan2");
    }
    thing.fail("unimplemented: atan "+JSON.stringify(y)+", "+JSON.stringify(x));
  });
  defun(sysctx, "floor", 1, function(context, thing, value) {
    if (value.kind == "number") {
      return {kind: "number", value: Math.floor(value.value)};
    }
    if (value.kind == "variable" && value.type == "float") {
      return context.js.mkVar("floor("+js_tag(value)+")", "float", "floor");
    }
    thing.fail("unimplemented: floor "+JSON.stringify(value));
  });
  function defCmp(opname, opfun) {
    defun(sysctx, opname, 2,
      function(context, thing, v1, v2) {
        var js = context.js;
        if (v1.kind == "number" && v2.kind == "number") {
          return {kind: "bool", value: opfun(v1.value, v2.value)};
        }
        
        if (!js) thing.fail("invalid arguments to comparison in interpreted mode: "+JSON.stringify(v1)+" and "+JSON.stringify(v2));
        
        if (v1.kind == "vec3f" || v2.kind == "vec3f") fail(thing, "cannot compare vectors: "+v1.kind+" with "+v2.kind);
        
        var jsop = opname;
        if (opname == "=") jsop = "==";
        
        var _ = js_unify_vars(v1, v2);
        v1 = _.left; v2 = _.right;
        
        return js.mkVar(js_op(jsop, js_tag(v1), js_tag(v2)), "bool", "cmp");
      }
    );
  }
  defCmp("<", function(a, b) { return a < b; });
  defCmp(">", function(a, b) { return a > b; });
  defCmp("<=", function(a, b) { return a <= b; });
  defCmp(">=", function(a, b) { return a >= b; });
  defCmp("=", function(a, b) { return a == b; });
  defCmp("!=", function(a, b) { return a != b; });
  defun(sysctx, "isfinite", 1, function(context, thing, value) {
    var js = context.js;
    if (!js) thing.fail("TODO js");
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("isFinite(+("+value.value+"))|0", "bool", "isfinite");
    }
    thing.fail("unimplemented: isfinite of "+JSON.stringify(value));
  });
  defun(sysctx, "not", 1, function(context, thing, bool) {
    var js = context.js;
    if (bool.kind == "bool") {
      return {kind: "bool", value: !bool.value};
    }
    if (!js) thing.fail("TODO js");
    if (bool.kind == "variable" && bool.type == "bool") {
      return js.mkVar("!"+paren_maybe(js_tag(bool), "!"), "bool", "not");
    }
    thing.fail("unimplemented: 'not' of "+JSON.stringify(bool));
  });
  function defOp(opname, opfun) {
    defun(sysctx, opname, function(context, thing, array) {
      var js = context.js;
      if (array.length === 0)
        thing.fail("'"+opname+"' expects more than one argument");
      var res = null;
      for (var i = 1; i < thing.value.length; ++i) {
        if (array[i-1] == null) {
          fail(thing.value[i], "cannot '"+opname+"' undefined value");
        }
      }
      
      function vecIsNumbers(obj) {
        if (obj.kind == "vec3f") {
          return isFloat(obj.value.x) && isFloat(obj.value.y) && isFloat(obj.value.z);
        }
        throw ("obj is not vec: "+typeof obj);
      }
      
      var allNumbers = false, anyVecs = false;;
      if (array[0].kind == "number") {
        allNumbers = true;
        res = array[0].value;
      }
      else if (array[0].kind == "vec3f") {
        anyVecs = true;
        if (vecIsNumbers(array[0])) {
          allNumbers = true;
          res = array[0].value;
          res = {x: res.x, y: res.y, z: res.z}; // clone vector
        }
      }
      for (var i = 1; i < array.length; ++i) {
        var oper = array[i];
        if (oper.kind == "vec3f") {
          // promote to vector
          if (!anyVecs) res = {x: res, y: res, z: res};
          if (!anyVecs) if (res.x == null) throw "null";
           
          anyVecs = true;
          if (!vecIsNumbers(oper)) {
            allNumbers = false;
          }
        }
        else if (oper.kind != "number") allNumbers = false;
        
        if (allNumbers) {
          if (!anyVecs) {
            res = opfun(res, oper.value);
          } else {
            if (oper.kind == "vec3f") {
              res.x = opfun(res.x, oper.value.x);
              res.y = opfun(res.y, oper.value.y);
              res.z = opfun(res.z, oper.value.z);
            } else {
              res.x = opfun(res.x, oper.value);
              res.y = opfun(res.y, oper.value);
              res.z = opfun(res.z, oper.value);
            }
          }
        }
      }
      
      if (allNumbers) {
        if (!anyVecs) return { kind: "number", value: res };
        else return { kind: "vec3f", value: res };
      }
      
      if (!js) fail(thing, "unimplemented: interpreted '"+opname+"' "+JSON.stringify(array));
      
      if (anyVecs) {
        // split operation over vector
        var rx = null, ry = null, rz = null;
        if (array[0].kind == "vec3f") {
          var vec = array[0].value;
          rx = js_tag("float", vec.x);
          ry = js_tag("float", vec.y);
          rz = js_tag("float", vec.z);
        } else {
          var fv = js_tag("float", copy(js, array[0]).value);
          rx = fv;
          ry = fv;
          rz = fv;
        }
        for (var i = 1; i < array.length; ++i) {
          var oper = array[i];
          if (oper.kind == "vec3f") {
            rx = js_op(opname, rx, js_tag("float", oper.value.x));
            ry = js_op(opname, ry, js_tag("float", oper.value.y));
            rz = js_op(opname, rz, js_tag("float", oper.value.z));
          } else if (oper.kind == "variable" && oper.type == "float" ||
                     oper.kind == "number"
          ) {
            var opn = js_tag_cast("float", copy(js, oper));
            rx = js_op(opname, rx, opn);
            ry = js_op(opname, ry, opn);
            rz = js_op(opname, rz, opn);
          } else {
            thing.fail("unimplemented: vop "+JSON.stringify(oper));
          }
        }
        res = {kind: "vec3f", value: {x: rx, y: ry, z: rz}};
      } else {
        var combined_op = null;
        for (var i = 0; i < array.length; ++i) {
          var oper = array[i];
          
          if (oper.kind == "variable" && (oper.type == "float" || oper.type == "int") ||
              oper.kind == "number"
          ) {
            if (!combined_op) combined_op = js_tag(oper);
            else combined_op = js_op(opname, combined_op, js_tag(oper));
          } else {
            thing.fail("unimplemented: op "+JSON.stringify(oper));
          }
        }
        res = {kind: "variable", type: js_type(array[0]), value: combined_op};
      }
      return res;
    });
  }
  defOp("+", function(a, b) { return a+b; });
  defOp("-", function(a, b) { return a-b; });
  defOp("*", function(a, b) { return a*b; });
  defOp("/", function(a, b) { return a/b; });
  
  defOp("%", function(a, b) { return a%b; });
  
  defOp("&", function(a, b) { return a&b; });
  defOp("|", function(a, b) { return a|b; });
  defOp("^", function(a, b) { return a^b; });
  
  defun(sysctx, "<<", 2, function(context, thing, a, b) {
    if (a.kind == "number" && b.kind == "number") {
      return {kind: "number", value: a.value << b.value};
    }
    return context.js.mkVar(js_op("<<", js_tag(a), js_tag(b)), "float", "lsh");
  });
  defun(sysctx, ">>", 2, function(context, thing, a, b) {
    if (a.kind == "number" && b.kind == "number") {
      return {kind: "number", value: a.value >> b.value};
    }
    return context.js.mkVar(js_op(">>", js_tag(a), js_tag(b)), "float", "rsh");
  });
  defun(sysctx, ">>>", 2, function(context, thing, a, b) {
    if (a.kind == "number" && b.kind == "number") {
      return {kind: "number", value: a.value >>> b.value};
    }
    return context.js.mkVar(js_op(">>>", js_tag(a), js_tag(b)), "float", "ursh");
  });
  
  defun(sysctx, "typeof", 1, function(context, thing, value) {
    if (value.kind == "struct") return value.type;
    fail(thing, "unimplemented: typeof "+JSON.stringify(value));
  });
  
  defun(sysctx, "function-type", 2, function(context, thing, argtypes, ret) {
    if (argtypes.kind != "list") fail(thing, "first parameter must be list of argument types");
    if (ret.kind == "atom") ret = ret.value;
    return {
      kind: "function",
      ret: ret,
      args: argtypes.value,
      fail: thing.fail,
    };
  });
  
  defun(sysctx, "closure-type", 2, function(context, thing, argtypes, ret) {
    if (argtypes.kind != "list") fail(thing, "first parameter must be list of argument types");
    if (ret.kind == "atom") ret = ret.value;
    return {
      kind: "closure",
      ret: ret,
      args: argtypes.value,
      fail: thing.fail,
    };
  });
  
  defun(sysctx, "type", 2, function(context, thing, type, value) {
    if (typeof value == "object" && value) {
      if (value.kind == "function-poly") {
        // TODO
        // return value.withFixedType(context.js, type);
        value.type = type;
        return value;
      }
      if (value.kind == "closure-poly") {
        if (context.js) {
          return value.withFixedType(context.js, type);
        } else {
          // lazy?
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
  
  sysctx.add("true", {kind: "bool", value: 1});
  sysctx.add("false", {kind: "bool", value: 0});
  
  sysctx.add("Infinity", {kind: "variable", type: "float", value: "Infinity"});
  sysctx.add("dw", {kind: "variable", type: "float", value: "(dw|0)"});
  sysctx.add("dh", {kind: "variable", type: "float", value: "(dh|0)"});
  sysctx.add("param-quality", {kind: "variable", type: "float", value: "(quality|0)"});
  sysctx.add("projscale", {kind: "number", value: 1});
  return sysctx;
}

function compile(files) {
  "use strict";
  
  function get_file(fn) {
    for (var i = 0; i < files.length; ++i) {
      if (files[i].name == fn) return files[i];
    }
    return null;
  }
  
  var jsfile = new JsFile();
  
  jsfile.openSection("module");
  
  jsfile.addLine("\"use asm\";");
  
  jsfile.openSection("globals");
  
  jsfile.addLine("var sqrt = stdlib.Math.sqrt;");
  jsfile.addLine("var abs = stdlib.Math.abs;");
  jsfile.addLine("var pow = stdlib.Math.pow;");
  jsfile.addLine("var sin = stdlib.Math.sin;");
  jsfile.addLine("var cos = stdlib.Math.cos;");
  jsfile.addLine("var tan = stdlib.Math.tan;");
  jsfile.addLine("var atan2 = stdlib.Math.atan2;");
  jsfile.addLine("var floor = stdlib.Math.floor;");
  jsfile.addLine("var fround = stdlib.Math.fround;");
  
  jsfile.addLine("var Infinity = stdlib.Infinity;");
  jsfile.addLine("var Int32Array = stdlib.Int32Array");
  jsfile.addLine("var Float32Array = stdlib.Float32Array;");
  jsfile.addLine("var Float64Array = stdlib.Float64Array;");
  
  jsfile.addLine("var alert_ = foreign.alert_;");
  jsfile.addLine("var error = foreign.error;");
  jsfile.addLine("var isFinite = foreign.isFinite;");
  jsfile.addLine("var hit = foreign.hit;");
  jsfile.addLine("var dw = foreign.dw|0;");
  jsfile.addLine("var dh = foreign.dh|0;");
  jsfile.addLine("var quality = foreign.quality|0;");
  jsfile.addLine("var _memory_limit = foreign.memory_limit|0;");
  
  jsfile.addLine("var mem_i32 = new Int32Array(heap);");
  jsfile.addLine("var mem_f32 = new Float32Array(heap);");
  
  // scratch space for vector return
  jsfile.addLine("var _rvec_x = 0.0;");
  jsfile.addLine("var _rvec_y = 0.0;");
  jsfile.addLine("var _rvec_z = 0.0;");
  
  // scratch space for closure pointer return
  jsfile.addLine("var _cp_base = 0;");
  jsfile.addLine("var _cp_offset = 0;");
  
  jsfile.openSection("variables");
  
  // stack pointer
  jsfile.addLine("var SP = foreign.stackborder|0;"); // grows down, underflow bounded
  // heap pointer
  jsfile.addLine("var HP = foreign.stackborder|0;"); // grows up, overflow bounded
  // backup
  jsfile.addLine("var stackborder = foreign.stackborder|0;")
  
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
        
        var toplevel = context.sup;
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
  
  jsfile.openSection("function");
  jsfile.addLine("function resetGlobals() {");
  jsfile.indent();
  
  for (var i = 0; i < context_list.length; ++i) {
    var context = context_list[i].context;
    while (context) { // bake for entire list of frozen clones
      for (var key in context.table) {
        var value = context.table[key];
        if (typeof value == "object" && value.kind == "number") {
          // bake in
          var jsname = jsfile.allocName("g", key);
          // log("baking "+jsname);
          jsfile.addLine("variables", "var "+jsname+" = "+js_tag_init("float", value.value)+";");
          jsfile.set("float", jsname, js_tag_init("float", value.value));
          context.table[key] = {kind: "variable", type: "float", value: jsname};
        }
      }
      context = context.sup;
    }
  }
  
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  // last lambda is compiled, not interpreted
  var callctx = new Context(main.context, jsfile);
  
  var main_fn = main.obj;
  
  jsfile.openSection("function");
  jsfile.addLine("function executeRange(x_from, y_from, x_to, y_to) {");
  jsfile.indent();
  jsfile.addLine("x_from = x_from|0;");
  jsfile.addLine("y_from = y_from|0;");
  jsfile.addLine("x_to = x_to|0;");
  jsfile.addLine("y_to = y_to|0;");
  
  jsfile.addLine("var x = 0;");
  jsfile.addLine("var y = 0;");
  jsfile.addLine("var HP_snapshot = 0;");
  
  jsfile.addLine("HP = stackborder|0;"); // reset to start, as innermost as we can
  
  // unroll any number of nested argument-less lambdas (only need one, but why not)
  while (main_fn.arity == 0) {
    main_fn = callctx.eval(list({kind: "quote", value: main_fn}));
  }
  
  jsfile.addLine("HP_snapshot = HP|0;");
  
  jsfile.addLine("y = y_from|0;");
  jsfile.addLine("while ((y|0) < (y_to|0)) {");
  jsfile.indent();
  jsfile.addLine("x = x_from|0;");
  jsfile.addLine("while ((x|0) < (x_to|0)) {");
  jsfile.indent();
  jsfile.addLine("HP = HP_snapshot|0;"); // reset again
  
  // pass lambda-to-call to trace
  var trace_args = [
    {kind: "variable", type: "float", value: "x|0"},
    {kind: "variable", type: "float", value: "y|0"},
    main_fn,
  ];
  var flattened = flatten_array(null, trace_args);
  
  build_js_call(null, jsfile, "trace", "void", flattened.array)
  
  jsfile.addLine("x = (x + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.addLine("y = (y + 1)|0;");
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
    inside_flatargs.push({kind: "variable", type: flattened.types[i], value: parnames[i]});
  }
  jsfile.addLine("function trace("+parnames.join(", ")+") {");
  jsfile.indent();
  
  for (var i = 0; i < flattened.types.length; ++i) {
    jsfile.set(flattened.types[i], parnames[i], parnames[i]);
  }
  
  jsfile.openSection("variables");
  
  var inside_args = reconstruct_array(jsfile, trace_args, inside_flatargs);
  
  jsfile.addLine("var BP = 0;");
  
  jsfile.openSection("body");
  
  jsfile.addLine("BP = SP|0;");
  
  var res = mkRes(callctx, null);
  
  // call innermost lambda: (fn x y res)
  callctx.eval(list(
    {kind: "quote", value: inside_args[2]},
    {kind: "quote", value: inside_args[0]},
    {kind: "quote", value: inside_args[1]},
    {kind: "quote", value: res}
  ));
  
  var xvar = js_tag(inside_args[0]), yvar = js_tag(inside_args[1]);
  
  var rvev = res.value.emit.value;
  jsfile.addLine("hit(~~"+xvar+", ~~"+yvar+", "+js_tag("int", res.value.success.value)+", "+
    js_tag("double", rvev.x)+", "+js_tag("double", rvev.y)+", "+js_tag("double", rvev.z)+");");
  
  jsfile.addLine("SP = BP|0;");
  
  jsfile.unindent();
  jsfile.addLine("}");
  
  jsfile.closeSection("body");
  jsfile.closeSection("variables");
  jsfile.closeSection("function");
  
  jsfile.emitFunctionTables();
  
  jsfile.addLine("return {resetGlobals: resetGlobals, executeRange: executeRange};");
  
  jsfile.replace("malloc(0)", "HP"); // peephole
  
  return jsfile.all_source();
}
