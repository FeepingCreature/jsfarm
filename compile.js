function fail(thing, info) {
  if (typeof thing == 'object' && 'fail' in thing) thing.fail(info);
  log(info);
  throw "broken "+typeof thing;
}

function assert_src(thing, test) {
  if (!test) fail(thing, "assert failed");
}

var idcounter = 0;
function unique_id() {
  return "id"+(idcounter++);
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
    if (typeof type != "object") throw "what is "+typeof type+" "+type;
    if (type.kind == "variable") {
      value = type.value;
      type = type.type;
    } else if (type.kind == "number") {
      var res = tagf_init(type.value);
      if (res != null) return res;
      throw "what why can't I tag init '"+type.value+"'";
    } else throw "how tag "+type.kind;
  }
  if (type == "float") return "+"+paren_maybe(value, "+");
  // if (type == "float") return "fround("+value+")";
  if (type == "double") return "+"+paren_maybe(value, "+");
  if (type == "int") return paren_maybe(value, "|")+"|0";
  if (type == "bool") return paren_maybe(value, "|")+"|0";
  throw "how tag "+type;
  // return value;
}

function js_get_at(type, base, offs) {
  var shift = null, stackvar = null;
  if (type == "float") {
    shift = 2;
    stackvar = "stack_fp32";
  } else if (type == "int" || type == "bool") {
    shift = 2;
    stackvar = "stack_i32";
  } else throw "what is type "+type;
  
  var target = stackvar+"[("+js_op("+", js_tag(base), offs)+") >> "+shift+"]";
  
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
function flatten(thing) {
  if (thing == null)
    throw "flatten null?";
  if (typeof thing == "function")
    return {signature: "function", array: [thing]}; // hopeless
  
  if (thing.kind == "number") {
    return {signature: "float", array: [thing]}; // primitive
  }
  if (thing.kind == "struct") {
    if (!thing.hasOwnProperty("base")) fail(thing, "bad struct for runtime call");
    return {signature: "struct", array: [thing.base]};
  }
  if (thing.kind == "variable") {
    return {signature: thing.type, array: [thing]}; // all "variables" are primitive
  }
  if (thing.kind == "vec3f") {
    return {signature: "vec3f", array: [
      {kind: "variable", type: "float", value: thing.value.x},
      {kind: "variable", type: "float", value: thing.value.y},
      {kind: "variable", type: "float", value: thing.value.z}]};
  }
  fail(thing, "how to flatten "+typeof thing+" "+thing.kind);
}

function flatten_array(args) {
  var array = [];
  var sigparts = [];
  for (var i = 0; i < args.length; ++i) {
    var sub = flatten(args[i]);
    sigparts.push(sub.signature);
    for (var k = 0; k < sub.array.length; ++k) {
      array.push(sub.array[k]);
    }
  }
  // alert("flatten_array("+JSON.stringify(args)+") => "+JSON.stringify(array));
  return {signature: sigparts.join("_"), array: array};
}

function js_type(thing) {
  if (thing.kind == "number") return "float";
  if (thing.kind == "variable") return thing.type;
  if (thing.kind == "vec3f") return "vec3f";
  fail(thing, "what's its type?? "+JSON.stringify(thing));
}

// turn an array of primitives into a structurally
// equivalent reconstruction of a compound expression
function reconstruct(js, thing, array) {
  var type = null;
  if (thing.kind == "vec3f") type = "vec3f";
  else if (thing.kind == "number") type = "float";
  else if (thing.kind == "variable") type = thing.type;
  else if (thing.kind == "struct") type = "struct";
  else fail(thing, "how to reconstruct "+typeof thing+" "+thing.kind);
  
  if (type == "float") {
    if (array.length < 1) fail(thing, "reconstruct:1 internal error");
    if (array[0].kind != "variable" || array[0].type != "float") throw ("can't reconstruct float from "+JSON.stringify(array[0]));
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
  if (type == "struct") {
    var newval = {};
    var base = array[0], rest = array.slice(1);
    var value = {};
    for (var key in thing.value) if (thing.value.hasOwnProperty(key)) {
      var offset = thing.offsets[key];
      var type = js_type(thing.value[key]);
      if (type == "bool") {
        value[key] = js_get_at("bool", base, offset);
      }
      else if (type == "float") {
        value[key] = js_get_at("float", base, offset);
      }
      else if (type == "vec3f") {
        value[key] = {
          kind: "vec3f",
          value: {
            x: js_get_at("float", base, offset + 0).value,
            y: js_get_at("float", base, offset + 4).value,
            z: js_get_at("float", base, offset + 8).value
          }
        };
      }
      else fail(thing, "TODO "+type);
    }
    return {
      rest: rest,
      value: {
        kind: "struct",
        base: base,
        offsets: thing.offsets,
        value: value
      }
    };
  }
  
  fail(thing, "TODO");
}

function reconstruct_array(js, args, array) {
  // alert("reconstruct_array("+JSON.stringify(args)+", array "+JSON.stringify(array)+")");
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
function Parser(text, fulltext) {
  if (!fulltext) fulltext = text;
  this.text = text;
  this.fulltext = fulltext;
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
    return {row: line, column: column};
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

function sexpr_parse(parser) {
  var thing = {};
  var text_at = parser.text;
  var text_post = null;
  function failHere(info) {
    var loc1 = parser.getLocation(text_at);
    var loc2 = parser.getLocation(text_post);
    log((loc1.row+1)+":"+loc1.column+": "+info);
    
    var editor = window.editor;
    
    editor.markText(
      {line: loc1.row, ch: loc1.column},
      {line: loc2.row, ch: loc2.column},
      {className: "error-marker"}
    );
    
    var marker = $('<div class="error-icon"></div>');
    marker.attr('title', info);
    marker.tooltip({ container: 'body' });
    
    editor.setGutterMarker(loc1.row, "error-gutter", marker[0]);
    
    // thanks http://codemirror.977696.n3.nabble.com/Scroll-to-line-td4028275.html
    var h = editor.getScrollInfo().clientHeight;
    var coords = editor.charCoords({line: loc1.row, ch: loc1.column}, "local");
    editor.scrollTo(null, (coords.top + coords.bottom - h) / 2);
    
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
        {kind: "atom", value: "quasiquote"},
        thing
      ]};
    }
    if (unquoted) {
      thing = {kind: "list", fail: thing.fail, value: [
        {kind: "atom", value: "unquote"},
        thing
      ]};
    }
    return thing;
  }
  
  if (parser.accept("(")) {
    var sexpr = [];
    while (true) {
      if (parser.accept(")")) break;
      sexpr.push(sexpr_parse(parser));
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
  else if (thing.hasOwnProperty('fail')) {
    thing.fail("what is even "+thing.kind);
  }
  else if (thing.kind == "variable") {
    return "&lt;"+thing.type+" "+thing.value+"&gt;";
  }
  else if (typeof thing == "function") {
    return "<function>";
  }
  else return "magical unicorn "+JSON.stringify(thing);
}

/** @constructor */
function Context(sup, js) {
  if (sup && !js && sup.js) js = sup.js;
  
  this.sup = sup;
  this.js = js;
  this.namehint = "";
  this.table = {};
  this.lookup = function(name) {
    if (this.table.hasOwnProperty(name)) return this.table[name];
    if (this.sup) return this.sup.lookup(name);
    return null;
  };
  this.add = function(name, value) {
    if (typeof name != "string") {
      log("what is a "+name);
      throw "fuck";
    }
    this.table[name] = value;
  };
  this.modify = function(name, value) {
    if (typeof name != "string") throw "shit fuck";
    if (this.table.hasOwnProperty(name)) {
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
  this.setHint = function(name) {
    var backup = this.namehint;
    this.namehint = name;
    return function() { this.namehint = backup; }.bind(this);
  };
  this.eval = function(thing) {
    if (thing.kind == "quote") {
      return thing.value;
    }
    if (thing.kind == "atom") {
      var res = this.lookup(thing.value);
      if (typeof res != "undefined") return res;
      var info = "";
      var cur = this;
      while (cur != null) {
        info += " :[";
        var list = [];
        for (var key in cur.table)
          if (this.table.hasOwnProperty(key))
            list.push(key);
        info += list.join(",");
        info += "]";
        cur = cur.sup;
      }
      thing.fail("Symbol '"+thing.value+"' not found."+info);
    }
    if (thing.kind == "number" || thing.kind == "bool") {
      return thing;
    }
    if (thing.kind == "list") {
      var list = thing.value;
      if (!list.length) thing.fail("Cannot evaluate empty list!");
      var op = this.eval(list[0]);
      if (typeof op == "function") {
        var res = op(this, thing, list.slice(1));
        if (typeof res == "undefined") res = null;
        // log("| "+sexpr_dump(thing)+" => "+sexpr_dump(res));
        return res;
      }
      if (op == null) {
        fail(list[0], "operator not found");
      }
      fail(thing, "cannot call "+typeof op+" "+JSON.stringify(op));
    }
    fail(thing, "helplessly lost trying to eval "+typeof thing+" "+thing);
  };
  this.clone = function() {
    var res = new Context(this.sup, this.js);
    for (var key in this.table) {
      if (this.table.hasOwnProperty(key)) {
        res.table[key] = this.table[key];
      }
    }
    return res;
  };
}

/** @constructor */
function JsFile() {
  this.sections = [];
  this.counter = 0;
  this.namehint = "";
  this.nop = function() { };
  this.openSection = function(name, parent) {
    var indentDepth = 0;
    if (this.sections.length > 0) {
      indentDepth = this.findSection(parent).indentDepth;
    }
    
    this.sections.push({name: name, indentDepth: indentDepth, source: ""});
  };
  this.popSection = function(name) {
    var last = this.sections.pop();
    if (last.name != name)
      throw("mismatch: tried to close '"+name+"' but we were at '"+last.name+"'");
    return last.source;
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
  this.addLine = function(name, text) {
    if (text == null) {
      text = name;
      name = null;
    }
    
    var section = this.findSection(name);
    
    if (text.search("undefined") !== -1 || text.search("object Object") !== -1) {
      throw ("this seems suspicious. "+text);
    }
    
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
      var reg = /[a-z_]+/gi;
      var result;
      while (result = reg.exec(hint)) name += result;
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
    if (typeof value == "number" || typeof value == "string") {
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
}

function compile(src) {
  "use strict";
  
  var parser = new Parser(src);
  var sysctx = new Context();
  
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
    if (typeof thing == "function") return thing; // hopeless
    if (thing === null) return null;
    if (thing.kind == "variable") {
      return js.mkVar(thing.value, thing.type, "copy");
    }
    if (thing.kind == "number") {
      return js.mkVar(thing.value, "float", "copy");
    }
    if (thing.kind == "vec3f") {
      js.nop();
      return mkVec3f(js, thing.value.x, thing.value.y, thing.value.z);
    }
    if (thing.kind == "struct") {
      return thing; // TODO??
    }
    fail(thing, "how copy "+thing.kind);
  }
  
  sysctx.add("def", function(context, thing, rest) {
    if (rest.length != 2) thing.fail("expect two arguments for 'def'");
    if (rest[0] == null) fail(thing, "invalid argument for 'def'");
    if (rest[0].kind != "atom") fail(rest[0], "expect name for 'def'");
    
    var name = rest[0].value;
    var valuepar = rest[1];
    
    var restore = context.setHint(name);
    var value = null;
    if (context.js) {
      value = copy(context.js, context.eval(valuepar));
    } else {
      value = context.eval(valuepar);
      if (value == null) fail(thing, "'def' value is null");
    }
    restore();
    context.add(name, value);
  });
  sysctx.add("nop", function(context, thing, rest) { });
  sysctx.add("eval", function(context, thing, rest) {
    if (rest.length != 1) thing.fail("expect one argument for 'eval'");
    return context.eval(context.eval(rest[0]));
  });
  sysctx.add("macro", function(context, thing, rest) {
    if (rest.length != 2) thing.fail("expect two arguments for 'lambda'");
    if (rest[0].kind != "list") rest[0].fail("expect parameter list for 'macro'");
    var argnames = [];
    for (var i = 0; i < rest[0].value.length; ++i) {
      var argname = rest[0].value[i];
      if (argname.kind != "atom")
        argname.fail("expect name for parameter");
      argnames.push(argname.value);
    }
    return function(callctx, callthing, args) {
      if (argnames.length != args.length) {
        fail(callthing, "macro call expected "+argnames.length+" arguments");
      }
      var callframe = new Context(context);
      for (var i = 0; i < args.length; ++i) {
        // log("for macro:", argnames[i], " = ", sexpr_dump(args[i]));
        callframe.add(argnames[i], args[i]); // add unevaluated
      }
      /* macros are evaluated twice
       * first in the defining context
       * then in the calling context.
       */
      /*
      log("STEP 1");
      log("v=v=v");
      log("->", sexpr_dump(callframe.eval(rest[1])));
      log("^=^=^");
      */
      return callctx.eval(callframe.eval(rest[1]));
    };
  });
  sysctx.add("lambda", function(context, thing, rest) {
    var namehint = context.getNamehint();
    
    var get_argnames = function(args) {
      if (args.kind != "list") args.fail("expect parameter list for 'lambda'");
      var argnames = [];
      for (var i = 0; i < args.value.length; ++i) {
        var argname = args.value[i];
        if (argname.kind != "atom")
          argname.fail("expect name for parameter");
        argnames.push(argname.value);
      }
      return argnames;
    };
    
    // var contextview = context.clone();
    var contextview = context; // let us call functions defined after us? TODO rethink
    
    var standard_call = function(callctx, callthing, argnames, args) {
      var callframe = new Context(contextview, callctx.js);
      callframe.setHint(namehint+"_call"); // no need to reset, is temporary
      
      for (var i = 0; i < args.length; ++i) {
        var arg = args[i];
        callframe.add(argnames[i], arg);
      }
      return callframe.eval(body);
    };
    
    // resolve tail recursive functions by pre-determining the return type
    var typehint = "";
    if (rest.length == 3) {
      var hint = rest[0];
      if (hint.kind != "atom") thing.fail("type-hinted lambda expected type parameter");
      typehint = hint.value;
      rest = rest.slice(1);
    }
    
    if (rest.length != 2) thing.fail("expect two arguments for 'lambda'");
    var argnames = get_argnames(rest[0]);
    
    var body = rest[1];
    
    var lambda_cache = [];
    
    // create a version of the lambda adapted for the types of 'args'
    function instantiate_and_call(callctx, callthing, args) {
      if (args.length != argnames.length) callthing.fail("internal logic error");
      // list all the types of all the individual parameters
      // (decomposing structs and vectors)
      
      var js = callctx.js;
      if (!js) return fallback();
      
      function fallback() { return standard_call(callctx, callthing, argnames, args); }
      
      if (typehint == "object") return fallback();
      
      var signature = "sig";
      
      var partypes = [];
      
      var flattened = flatten_array(args);
      var signature = flattened.signature;
      var flat_args = flattened.array;
      
      for (var i = 0; i < flat_args.length; ++i) {
        var arg = flat_args[i];
        if (typeof arg == "function") {
          return fallback();
        }
        else if (arg.kind == "variable") {
          partypes.push(arg.type);
        }
        else if (arg.kind == "number") {
          partypes.push("float");
        }
        else callthing.fail("1 what is "+typeof arg+" "+arg.kind);
      }
      
      var fn = null;
      var ret_type = null, ret_value = null;
      
      if (lambda_cache.hasOwnProperty(signature)) {
        var cached = lambda_cache[signature];
        fn = cached.fn;
        ret_type = cached.ret_type;
        ret_value = cached.ret_value;
      } else {
        fn = js.allocName("f", namehint);
        
        var ret_preeval = null;
        
        if (typehint == "vec3f") {
          var x = js.mkVar(null, "float", "rvec_x", "globals").value;
          var y = js.mkVar(null, "float", "rvec_y", "globals").value;
          var z = js.mkVar(null, "float", "rvec_z", "globals").value;
          ret_preeval = {
            ret_type: "vec3f",
            ret_value: {kind: "vec3f", value: {x: x, y: y, z: z}}
          };
        } else if (typehint == "object") {
          // don't try to emit as js function
        } else if (typehint == "void") {
          ret_preeval = { ret_type: null, ret_value: null};
        } else if (typehint) thing.fail("type-hinted lambda: unknown type '"+typehint+"'");
        
        var parnames = [];
        for (var i = 0; i < partypes.length; ++i) parnames.push("par"+i);
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
        js.addLine("var BP = 0;");
        
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
        
        var callframe = new Context(contextview, callctx.js);
        for (var i = 0; i < argnames.length; ++i) {
          callframe.add(argnames[i], inside_args[i]);
        }
        
        if (ret_preeval != null) {
          // log("early cache "+fn+": "+signature+": "+ret_preeval.ret_type+", "+JSON.stringify(ret_preeval.ret_value));
          lambda_cache[signature] = {fn: fn, ret_type: ret_preeval.ret_type, ret_value: ret_preeval.ret_value};
        }
        
        var res = callframe.eval(body);
        
        if (res == null) {
          js.addLine("SP = BP;");
          js.addLine("return");
        }
        else if (typeof res == "function" ||
            res.kind == "struct"
        ) {
          abort();
          return fallback();
        }
        else if (res.kind == "vec3f") {
          ret_type = "vec3f";
          if (ret_preeval != null) {
            if (ret_preeval.ret_type != "vec3f")
              callthing.fail("return type did not match declared type hint");
            ret_value = ret_preeval.ret_value;
            js.set("float", ret_value.value.x, res.value.x);
            js.set("float", ret_value.value.y, res.value.y);
            js.set("float", ret_value.value.z, res.value.z);
          } else {
            var x = js.mkVar(res.value.x, "float", "rvec_x", "globals");
            var y = js.mkVar(res.value.y, "float", "rvec_y", "globals");
            var z = js.mkVar(res.value.z, "float", "rvec_z", "globals");
            ret_value = {kind: "vec3f", value: {x:x.value, y:y.value, z:z.value}};
            ret_type = "vec3f";
          }
          js.addLine("SP = BP;");
          js.addLine("return");
        }
        else if (res.kind == "variable" && (res.type == "float" || res.type == "bool")) {
          js.addLine("SP = BP;");
          js.addLine("return "+js_tag(res)+";");
          ret_type = res.type;
        }
        else {
          callthing.fail("how return "+res.kind+" "+res.type);
        }
        
        js.closeSection("body");
        js.closeSection("variables");
        
        js.unindent();
        js.addLine("}");
        
        
        var fun = js.popSection("function");
        js.add("functions", fun);
        
        if (ret_preeval == null) {
          // log("late cache "+fn+": "+signature+": "+ret_type+", "+JSON.stringify(ret_value));
          lambda_cache[signature] = {fn: fn, ret_type: ret_type, ret_value: ret_value};
        }
      }
      
      // build call
      var arglist = [];
      for (var i = 0; i < flat_args.length; ++i) {
        arglist.push(js_tag(flat_args[i]));
      }
      
      if (arglist.length != partypes.length) callthing.fail("internal logic error");
      
      var call = fn+" ("+arglist.join(",")+")";
      
      if (ret_type == "float" || ret_type == "bool") {
        ret_value = js.mkVar(call, ret_type, "retval");
      }
      else if (ret_type == "vec3f") {
        js.addLine(call+";");
        // immediately copy the return vals elsewhere
        ret_value = {
          kind: "vec3f",
          value: {
            x: js.mkVar(ret_value.value.x, "float", "rcopy_x").value,
            y: js.mkVar(ret_value.value.y, "float", "rcopy_y").value,
            z: js.mkVar(ret_value.value.z, "float", "rcopy_z").value}};
      }
      else if (ret_type == null) {
        js.addLine(call+";");
      }
      else callthing.fail("TODO how return "+ret_type);
      
      return ret_value;
    }
    
    return function(callctx, callthing, args) {
      var args_eval = [];
      for (var i = 0; i < args.length; ++i) {
        var evalled = callctx.eval(args[i]);
        if (evalled == null) fail(callthing, "arg "+i+" evaluates to null");
        args_eval.push(evalled);
      }
      
      if (argnames.length != args.length) {
        callthing.fail("lambda call expected "+argnames.length+" arguments");
      }
      
      return instantiate_and_call(callctx, callthing, args_eval);
    };
  });
  sysctx.add("seq", function(context, thing, rest) {
    if (!rest.length) thing.fail("expect nonzero arguments for 'seq'");
    var res = null;
    var seqctx = new Context(context);
    for (var i = 0; i < rest.length; ++i) {
      res = seqctx.eval(rest[i]);
    }
    return res;
  });
  sysctx.add("dump", function(context, thing, rest) {
    if (rest.length != 1) thing.fail("'dump' expects one argument");
    var js = context.js;
    // if (!js) thing.fail("TODO dump in interpreted mode (how??)");
    var info = sexpr_dump(rest[0]);
    // js.addLine("alert(par1);");
    function fmt(value) {
      if (value.kind == "vec3f") {
        return "'vec3f('+("+value.value.x+")+', '"+
          "+("+value.value.y+")+', '"+
          "+("+value.value.z+")+')'";
      }
      if (value.kind == "atom") {
        return "'"+value.value+"'";
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
        return "'('+"+list.join("+' '+")+"+')'";
      }
      if (value.kind == "struct") {
        var list = [];
        for (var key in value.value) if (value.value.hasOwnProperty(key)) {
          list.push("'"+key+": '+"+fmt(value.value[key]));
        }
        return "'{'+"+list.join("+', '+")+"+'}'";
      }
      if (value.kind == "quote") {
        return "\"'\"+"+fmt(value.value);
      }
      return "'TODO dump "+(typeof value)+"'";
      // thing.fail("TODO dump "+JSON.stringify(value));
    }
    var value = context.eval(rest[0]);
    if (!js)  alert(info+" = "+eval(fmt(value)));
     else js.addLine("alert_('"+info+" = '+"+fmt(value)+");");
  });
  function addfun(name, arity, fun) {
    if (fun == null) { fun = arity; arity = null; }
    sysctx.add(name, function(context, thing, rest) {
      if (arity != null && rest.length != arity)
        thing.fail("expect "+arity+" arguments for '"+name+"'");
      var args = [];
      for (var i = 0;  i < rest.length; ++i) {
        args.push(context.eval(rest[i]));
      }
      if (arity == null) {
        return fun.call(this, context.js, thing, args);
      } else {
        var args2 = [];
        args2.push(context.js);
        args2.push(thing);
        for (var i = 0; i < args.length; ++i) args2.push(args[i]);
        return fun.apply(this, args2);
      }
    });
  }
  addfun("quote", 1, function(js, thing, value) {
    return {kind: "quote", value: value};
  });
  addfun("size", 1, function(js, thing, value) {
    if (value.kind != "list") {
      fail(thing, "'size' expected list as parameter");
    }
    return {kind: "number", value: value.value.length};
  });
  addfun("first", "1", function(js, thing, value) {
    if (value.kind == "list") {
      return value.value[0];
    }
    fail(thing, "first? "+JSON.stringify(value));
  });
  addfun("list?", "1", function(js, thing, value) {
    return {kind: "bool", value: value.kind == "list"};
  });
  addfun("struct?", "1", function(js, thing, value) {
    return {kind: "bool", value: value.kind == "struct"};
  });
  // first of list of size 1
  addfun("first1", "1", function(js, thing, value) {
    if (value.kind == "list") {
      if (!value.value.length) fail(thing, "first1 of empty list");
      if (value.value.length > 1) fail(thing, "first1 of list of length "+value.value.length);
      return value.value[0];
    }
    fail(thing, "first1? "+JSON.stringify(value));
  });
  addfun("rest", "1", function(js, thing, value) {
    if (value.kind == "list") {
      if (!value.value.length) fail(thing, "rest of empty list");
      var rest = value.value.slice(1);
      return {kind: "list", value: rest};
    }
    fail(thing, "rest? "+JSON.stringify(value));
  });
  addfun("same", "2", function(js, thing, a, b) {
    if (a.kind == "atom" && b.kind == "atom") {
      return {kind: "bool", value: a.value === b.value};
    }
    if (a.kind != b.kind) return {kind: "bool", value: false};
    fail(thing, "same? "+JSON.stringify(a)+" and "+JSON.stringify(b));
  });
  addfun("conc", 2, function(js, thing, a, b) {
    if (b.kind != "list") {
      fail(thing, "expected list as second argument to 'conc'");
    }
    var nlist = [];
    nlist.push(a);
    for (var i = 0; i < b.value.length; ++i)
      nlist.push(b.value[i]);
    return {kind: "list", value: nlist};
  });
  function mkNum(i) {
    return {kind: "number", value: i};
  }
  // a vec3f is a bundle of three variables
  addfun("vec3f", function(js, thing, array) {
    var fun = function(x, y, z) { return mkVec3f(js, x, y, z); };
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
  function doSetJs(js, thing, target, value) {
    if (target == null || value == null) thing.fail("what");
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
    if (target.kind == "struct" && value.kind == "struct") {
      var tv = target.value, vv = value.value;
      for (var key in tv)
        if (tv.hasOwnProperty(key) && !vv.hasOwnProperty(key))
          value.fail("mismatch: target property '"+key+"' not in value");
      for (var key in vv)
        if (vv.hasOwnProperty(key) && !tv.hasOwnProperty(key))
          target.fail("mismatch: value property '"+key+"' not in target");
      for (var key in tv) if (tv.hasOwnProperty(key)) {
        doSetJs(js, thing, target.value[key], value.value[key]);
      }
      return;
    }
    if (target.kind == "vec3f" && value.kind == "vec3f") {
      js.set("float", target.value.x, value.value.x);
      js.set("float", target.value.y, value.value.y);
      js.set("float", target.value.z, value.value.z);
      return;
    }
    fail(thing, "TODO<br>"+JSON.stringify(target)+"<br>=<br>"+JSON.stringify(value));
  }
  sysctx.add("set", function(context, thing, rest) {
    if (rest.length != 2) fail(thing, "'set' expected two arguments, target and value");
    var target = rest[0];
    var value = rest[1];
    var js = context.js;
    if (js) return doSetJs(js, thing, context.eval(target), context.eval(value));
    if (target.kind != "atom") fail(target, "'set' requires an atom as the lhs in interpreted mode");
    var name = target.value;
    
    value = context.eval(value);
    context.modify(name, value);
    return;
  });
  sysctx.add(":", function(context, thing, rest) {
    if (rest.length < 2) thing.fail("':' expected at least two arguments");
    var base = context.eval(rest[0]);
    rest = rest.slice(1);
    for (var i = 0; i < rest.length; ++i) {
      var key = rest[i];
      if (key.kind != "atom")
        key.fail("cannot access member with key of type "+key.kind);
      
      if (base.kind == "vec3f") {
        if (key.value == "x")
          base = {kind: "variable", type: "float", value: base.value.x};
        else if (key.value == "y")
          base = {kind: "variable", type: "float", value: base.value.y};
        else if (key.value == "z")
          base = {kind: "variable", type: "float", value: base.value.z};
        else thing.fail("undefined vector property '"+key.value+"'");
      } else if (base.kind == "struct") {
        if (base.value.hasOwnProperty(key.value)) {
          base = base.value[key.value];
        } else {
          key.fail("undefined struct property '"+key.value+"'");
        }
      } else {
        thing.fail("cannot access property of something that "+
          "is not a struct or vector, but a "+base.kind);
      }
    }
    if (!context.js) {
      // log("what do with : result "+typeof(base)+" "+JSON.stringify(base)+" for "+sexpr_dump({kind: "list", value: rest}));
      if (typeof base == "object") {
        if (base.type == "float" && typeof(base.value) == "number") {
          return {kind: "number", value: base.value};
        }
      }
    }
    return base;
  });
  addfun("list", function(js, thing, array) {
    return {kind: "list", value: array};
  });
  sysctx.add("while", function(context, thing, rest) {
    var js = context.js;
    if (js) {
      if (rest.length != 2)
        thing.fail("'while' expected two arguments");
      // the test may need to do work, so do while (true) if (!test) break;
      js.addLine("while (1) {");
      js.indent();
      var test = context.eval(rest[0]);
      if (test.kind == "variable" && test.type == "bool") {
        js.addLine("if (!"+paren_maybe(test.value, "!")+") break;");
      }
      else thing.fail("TODO test that's "+JSON.stringify(test));
      var res = context.eval(rest[1]);
      js.unindent();
      js.addLine("}");
      // the last loop pass will naturally be the one whose variables are "final"
      return res;
    } else {
      var res = null;
      while (true) {
        var test = context.eval(rest[0]);
        if (test.kind != "bool") fail(rest[0], "test did not evaluate to a boolean");
        if (!test.value) break;
        res = context.eval(rest[1]);
      }
      return res;
    }
  });
  sysctx.add("if", function(context, thing, rest) {
    if (rest.length != 2 && rest.length != 3)
      thing.fail("'if' expected either two or three arguments");
    var test = context.eval(rest[0]);
    // log("test is "+JSON.stringify(test));
    if (test.kind == "bool") {
      if (test.value == true) {
        return context.eval(rest[1]);
      } else if (rest.length == 3) {
        return context.eval(rest[2]);
      } else return null;
    }
    var js = context.js;
    if (!js) fail(thing, "could not evaluate test condition at compile time; was "+test.kind);
    if (test.kind == "variable" && test.type == "bool") {
      var case1_js = null, case2_js = null;
      var phi = null;
      js.indent();
      
      js.openSection("case1");
      var case1 = context.eval(rest[1]);
      case1_js = js.popSection("case1");
      if (rest.length == 3) {
        js.openSection("case2");
        var case2 = context.eval(rest[2]);
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
          
          if (case1.kind == "variable" && case2.kind == "variable") {
            if (case1.type != case2.type) {
              thing.fail("type mismatch between if branches: "+case1.type+" and "+case2.type);
            }
            js.unindent();
            phi = js.mkVar(null, case1.type, "phi");
            js.indent();
            js.openSection("case1");
            js.add(case1_js);
            js.set(case1.type, phi.value, case1.value);
            case1_js = js.popSection("case1");
            js.openSection("case2");
            js.add(case2_js);
            js.set(case1.type, phi.value, case2.value);
            case2_js = js.popSection("case2");
          } else if (case1.kind == "vec3f" && case2.kind == "vec3f") {
            js.unindent();
            phi = mkVec3f(js,
              {kind: "variable", type: "float", value: null},
              {kind: "variable", type: "float", value: null},
              {kind: "variable", type: "float", value: null});
            js.indent();
            js.openSection("case1");
            js.add(case1_js);
            var val = phi.value, c1v = case1.value, c2v = case2.value;
            js.set("float", val.x, c1v.x);
            js.set("float", val.y, c1v.y);
            js.set("float", val.z, c1v.z);
            case1_js = js.popSection("case1");
            js.openSection("case2");
            js.add(case2_js);
            js.set("float", val.x, c2v.x);
            js.set("float", val.y, c2v.y);
            js.set("float", val.z, c2v.z);
            case2_js = js.popSection("case2");
          } else {
            fail(thing, "merge TODO "+JSON.stringify(case1)+" and "+JSON.stringify(case2));
          }
        }
      }
      else if (case1 == null) { } // no issues
      else {
        thing.fail("todo single if "+JSON.stringify(case1));
      }
      
      js.unindent();
      
      js.addLine("if ("+js_tag(test)+") {");
      js.add(case1_js);
      if (rest.length == 3) {
        js.addLine("} else {");
        js.add(case2_js);
      }
      js.addLine("}");
      return phi;
    }
    thing.fail("IF todo "+JSON.stringify(test));
  });
  sysctx.add("make-struct", function(context, thing, rest) {
    if (!rest.length) fail(thing, "make-struct expected list");
    var values = {};
    for (var i = 0; i < rest.length; ++i) {
      var pair = rest[i];
      if (pair.kind != "list") fail(pair, "expected name-value pair for make-struct");
      if (pair.value.length != 2) fail(pair, "expected name-value pair for make-struct");
      if (pair.value[0].kind != "atom") fail(pair, "expected name-value pair for make-struct");
      values[pair.value[0].value] = context.eval(pair.value[1]);
    }
    return {
      kind: "struct",
      value: values
    };
  });
  addfun("make-ray", 0, function(js, thing) {
    if (!js) thing.fail("make-ray cannot be called at compiletime");
    var base = js.mkVar("SP", "int", "ray_base");
    
    js.set("int", "SP", js_op("+", "SP", 32));
    
    var get_fp_at = function(offs) {
      var res = js_get_at("float", base, offs);
      js.set("float", res.value, "0");
      return res;
    };
    
    return {
      kind: "struct",
      base: base,
      offsets: {pos: 0, dir: 16},
      value: {
        pos: mkVec3f_direct(get_fp_at( 0), get_fp_at( 4), get_fp_at( 8)),
        dir: mkVec3f_direct(get_fp_at(16), get_fp_at(20), get_fp_at(24))
      }
    };
  });
  function mkRes(js) {
    var base = js.mkVar("SP", "int", "res_base");
    
    js.set("int", "SP", js_op("+", "SP", 64));
    
    var get_init = function(offs, type, init) {
      var res = js_get_at(type, base, offs);
      js.set(type, res.value, init);
      return res;
    };
    var get_vec = function(offs) {
      var x = js_get_at("float", base, offs + 0);
      var y = js_get_at("float", base, offs + 4);
      var z = js_get_at("float", base, offs + 8);
      return mkVec3f_direct(x, y, z);
    };
    var get_vec_init = function(offs, init_x, init_y, init_z) {
      var x = get_init(offs + 0, "float", init_x);
      var y = get_init(offs + 4, "float", init_y);
      var z = get_init(offs + 8, "float", init_z);
      return mkVec3f_direct(x, y, z);
    };
    
    return {
      kind: "struct",
      base: base,
      offsets: {success: 0, distance: 4, reflect: 16, emit: 32, normal: 48},
      value: {
        success: get_init(0, "bool", "0"),
        // distance: get_init(4, "float", "0"),
        // reflect: get_vec_init(16, "0", "0", "0"),
        // emit: get_vec_init(32, "0", "1", "0"),
        // normal: get_vec_init(48, "0", "0", "0")
        distance: js_get_at("float", base, 4),
        reflect: get_vec(16),
        emit: get_vec(32),
        normal: get_vec(48)
    }};
  }
  addfun("make-res", 0, function(js, thing) { return mkRes(js); });
  addfun("sqrt", 1, function(js, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("sqrt("+js_tag(value)+")", "float", "sqrt");
    }
    thing.fail("TODO sqrt "+JSON.stringify(value));
  });
  addfun("abs", 1, function(js, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("abs("+js_tag(value)+")", "float", "abs");
    }
    if (value.kind == "number") return {kind: "number", value: Math.abs(value.value)};
    thing.fail("TODO abs "+JSON.stringify(value));
  });
  addfun("sin", 1, function(js, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("sin("+js_tag(value)+")", "float", "sin");
    }
    if (value.kind == "number") return {kind: "number", value: Math.sin(value.value)};
    thing.fail("TODO sin "+JSON.stringify(value));
  });
  addfun("cos", 1, function(js, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("cos("+js_tag(value)+")", "float", "cos");
    }
    thing.fail("TODO cos "+JSON.stringify(value));
  });
  addfun("tan", 1, function(js, thing, value) {
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("tan("+js_tag(value)+")", "float", "tan");
    }
    thing.fail("TODO tan "+JSON.stringify(value));
  });
  addfun("floor", 1, function(js, thing, value) {
    if (value.kind == "number") {
      return {kind: "number", value: Math.floor(value.value)};
    }
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("floor("+js_tag(value)+")", "float", "floor");
    }
    thing.fail("TODO floor "+JSON.stringify(value));
  });
  function defCmp(opname, opfun) {
    addfun(opname, 2, function(js, thing, v1, v2) {
      if (v1.kind == "number" && v2.kind == "number") {
        return {kind: "bool", value: opfun(v1.value, v2.value)};
      }
      
      if (!js) thing.fail("invalid arguments to comparison in interpreted mode: "+v1.kind+" and "+v2.kind);
      
      if (v1.kind == "vec3f" || v2.kind == "vec3f") fail(thing, "cannot compare vectors: "+v1.kind+" with "+v2.kind);
      
      var jsop = opname;
      if (opname == "=") jsop = "==";
      
      return js.mkVar(js_op(jsop, js_tag(v1), js_tag(v2)), "bool", "cmp");
    });
  }
  defCmp("<", function(a, b) { return a < b; });
  defCmp(">", function(a, b) { return a > b; });
  defCmp("<=", function(a, b) { return a <= b; });
  defCmp(">=", function(a, b) { return a >= b; });
  defCmp("=", function(a, b) { return a == b; });
  defCmp("!=", function(a, b) { return a != b; });
  addfun("isfinite", 1, function(js, thing, value) {
    if (!js) thing.fail("TODO js");
    if (value.kind == "variable" && value.type == "float") {
      return js.mkVar("isFinite(+("+value.value+"))|0", "bool", "isfinite");
    }
    thing.fail("TODO isfinite of "+JSON.stringify(value));
  });
  addfun("not", 1, function(js, thing, bool) {
    if (bool.kind == "bool") {
      return {kind: "bool", value: !bool.value};
    }
    if (!js) thing.fail("TODO js");
    if (bool.kind == "variable" && bool.type == "bool") {
      return js.mkVar("!"+paren_maybe(js_tag(bool), "!"), "bool", "not");
    }
    thing.fail("TODO 'not' of "+JSON.stringify(bool));
  });
  function defOp(opname, opfun) {
    addfun(opname, function(js, thing, array) {
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
      
      if (!js) fail(thing, "TODO js '"+opname+"' "+JSON.stringify(array));
      
      if (anyVecs) {
        // split operation over vector
        if (array[0].kind == "vec3f") {
          var vec = array[0].value;
          res = mkVec3f(js, vec.x, vec.y, vec.z);
        } else {
          var f = array[0];
          res = mkVec3f(js, f, f, f);
        }
        for (var i = 1; i < array.length; ++i) {
          var rv = res.value;
          var oper = array[i];
          if (oper.kind == "vec3f") {
            js.set("float", rv.x, js_op(opname, js_tag("float", rv.x), js_tag("float", oper.value.x)));
            js.set("float", rv.y, js_op(opname, js_tag("float", rv.y), js_tag("float", oper.value.y)));
            js.set("float", rv.z, js_op(opname, js_tag("float", rv.z), js_tag("float", oper.value.z)));
          } else if (oper.kind == "variable" && oper.type == "float" ||
                     oper.kind == "number"
          ) {
            var opn = js_tag_cast("float", oper);
            js.set("float", rv.x, js_op(opname, js_tag("float", rv.x), opn));
            js.set("float", rv.y, js_op(opname, js_tag("float", rv.y), opn));
            js.set("float", rv.z, js_op(opname, js_tag("float", rv.z), opn));
          } else {
            thing.fail("TODO vop "+JSON.stringify(oper));
          }
        }
      } else {
        res = js.mkVar(array[0], null, "op");
        for (var i = 1; i < array.length; ++i) {
          var oper = array[i];
          
          if (oper.kind == "variable" && oper.type == "float" ||
              oper.kind == "number"
          ) {
            js.set(res.type, res.value, js_op(opname, js_tag(res), js_tag(oper)));
          } else {
            thing.fail("TODO op "+JSON.stringify(oper));
          }
        }
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
  
  addfun("<<", 2, function(js, thing, a, b) {
    if (a.kind == "number" && b.kind == "number") {
      return {kind: "number", value: a.value << b.value};
    }
    return js.mkVar(js_op("<<", js_tag(a), js_tag(b)), "float", "lsh");
  });
  addfun(">>", 2, function(js, thing, a, b) {
    if (a.kind == "number" && b.kind == "number") {
      return {kind: "number", value: a.value >> b.value};
    }
    return js.mkVar(js_op(">>", js_tag(a), js_tag(b)), "float", "rsh");
  });
  addfun(">>>", 2, function(js, thing, a, b) {
    if (a.kind == "number" && b.kind == "number") {
      return {kind: "number", value: a.value >>> b.value};
    }
    return js.mkVar(js_op(">>>", js_tag(a), js_tag(b)), "float", "ursh");
  });
  
  sysctx.add("true", {kind: "bool", value: 1});
  sysctx.add("false", {kind: "bool", value: 0});
  sysctx.add("Infinity", {kind: "number", value: 999999999});
  
  var dw = 512, dh = 512;
  
  sysctx.add("dw", {kind: "number", value: dw});
  sysctx.add("dh", {kind: "number", value: dh});
  sysctx.add("projscale", {kind: "number", value: 1});
  sysctx.add("fov", {kind: "number", value: 0.75});
  
  var jsfile = new JsFile();
  var context = new Context(sysctx);
  
  jsfile.openSection("module");
  
  var fun = null;
  jsfile.addLine("\"use asm\";");
  
  jsfile.openSection("globals");
  
  jsfile.addLine("var sqrt = stdlib.Math.sqrt;");
  jsfile.addLine("var abs = stdlib.Math.abs;");
  jsfile.addLine("var sin = stdlib.Math.sin;");
  jsfile.addLine("var cos = stdlib.Math.cos;");
  jsfile.addLine("var tan = stdlib.Math.tan;");
  jsfile.addLine("var floor = stdlib.Math.floor;");
  jsfile.addLine("var Infinity = stdlib.Infinity;");
  jsfile.addLine("var isFinite = foreign.isFinite;");
  jsfile.addLine("var alert_ = foreign.alert_;");
  jsfile.addLine("var fround = stdlib.Math.fround;");
  jsfile.addLine("var Int32Array = stdlib.Int32Array");
  jsfile.addLine("var Float32Array = stdlib.Float32Array;");
  jsfile.addLine("var Float64Array = stdlib.Float64Array;");
  jsfile.addLine("var hit = foreign.hit;");
  jsfile.addLine("var stack_i32 = new Int32Array(stack);");
  jsfile.addLine("var stack_fp32 = new Float32Array(stack);");
  
  jsfile.openSection("variables");
  
  jsfile.addLine("var SP = 0;");
  
  jsfile.openSection("functions");
  
  // TODO comments in s2
  // http://burtleburtle.net/bob/rand/smallprng.html
  
  var sex = null;
  while (!parser.eof()) {
    sex = sexpr_parse(parser);
    fun = context.eval(sex);
  }
  
  for (var key in context.table) if (context.table.hasOwnProperty(key)) {
    var value = context.table[key];
    if (typeof value == "object" && value.kind == "number") {
      // bake in
      var jsname = jsfile.allocName("g", key);
      jsfile.addLine("variables", "var "+jsname+" = "+js_tag_init("float", value.value)+";");
      context.table[key] = {kind: "variable", type: "float", value: jsname};
    }
  }
  
  // last lambda is compiled, not interpreted
  var callctx = new Context(context, jsfile);
  
  jsfile.openSection("function");
  jsfile.addLine("function trace(ix, iy) {");
  jsfile.indent();
  jsfile.set("int", "ix", "ix");
  jsfile.set("int", "iy", "iy");
  
  jsfile.openSection("variables");
  
  jsfile.addLine("var x = "+js_tag_init("float", "0")+";");
  jsfile.addLine("var y = "+js_tag_init("float", "0")+";");
  jsfile.addLine("var __i = 0;");
  jsfile.addLine("var BP = 0;");
  
  callctx.add("x", {kind: "variable", type: "float", value: "x"});
  callctx.add("y", {kind: "variable", type: "float", value: "y"});
  
  jsfile.openSection("body");
  
  jsfile.addLine("BP = SP|0;");
  
  jsfile.addLine("x = "+js_tag("float", "ix|0")+";");
  jsfile.addLine("y = "+js_tag("float", "iy|0")+";");
  
  var res = mkRes(jsfile);
  
  callctx.add("res", res);
  fun(callctx, sex, [
    {kind: "atom", value: "x"},
    {kind: "atom", value: "y"},
    {kind: "atom", value: "res"},
  ]);
  var rvev = res.value.emit.value;
  jsfile.addLine("hit(~~x, ~~y, "+js_tag("int", res.value.success.value)+", "+
    js_tag("double", rvev.x)+", "+js_tag("double", rvev.y)+", "+js_tag("double", rvev.z)+");");
  
  jsfile.addLine("SP = BP|0;");
  
  jsfile.unindent();
  jsfile.addLine("}");
  
  jsfile.closeSection("body");
  jsfile.closeSection("variables");
  jsfile.closeSection("function");
  
  jsfile.openSection("function");
  jsfile.addLine("function executeRange(from, to) {");
  jsfile.indent();
  jsfile.addLine("from = from|0;");
  jsfile.addLine("to = to|0;");
  
  jsfile.addLine("var x = 0;");
  jsfile.addLine("var y = 0;");
  jsfile.addLine("y = from|0;");
  jsfile.addLine("while ((y|0) < (to|0)) {");
  jsfile.indent();
  jsfile.addLine("x = 0;");
  jsfile.addLine("while ((x|0) < "+dw+") {");
  jsfile.indent();
  jsfile.addLine("trace(x, y);");
  jsfile.addLine("x = (x + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.addLine("y = (y + 1)|0;");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.unindent();
  jsfile.addLine("}");
  jsfile.closeSection("function");
  
  jsfile.addLine("return {executeRange: executeRange};");
  
  return jsfile.all_source();
}
  