'use strict';

// thanks http://croquetweak.blogspot.de/2014/08/deconstructing-floats-frexp-and-ldexp.html !
// (Which is posted without copyright, but SqueakJS is MIT, so..)
// TODO all of the attributions
function frexp(value, output) {
  var data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, value);
  var bits = (data.getUint32(0) >>> 20) & 0x7FF;
  if (bits === 0) { // subnormal
    data.setFloat64(0, value * Math.pow(2, 64));
    bits = ((data.getUint32(0) >>> 20) & 0x7FF) - 64;
  }
  var exponent = bits - 1022,
      mantissa = ldexp(value, -exponent);
  output.mantissa = mantissa;
  output.exponent = exponent;
}

function ldexp(mantissa, exponent) {
  return mantissa * Math.pow(2, exponent);
}

// thanks http://radsite.lbl.gov/radiance/refer/Notes/picture_format.html
function encode_rgbe(array) {
  var pixels = array.buffer.byteLength / 12;
  var res = new Uint8Array(pixels * 4);
  var obj = {mantissa: 0.0, exponent: 0};
  for (var i = 0; i < pixels; ++i) {
    var red = array[i*3+0];
    var grn = array[i*3+1];
    var blu = array[i*3+2];
    var v = red;
    if (grn > v) v = grn;
    if (blu > v) v = blu;
    if (v === 0.0) {
      res[i*4+0] = 0;
      res[i*4+1] = 0;
      res[i*4+2] = 0;
      res[i*4+3] = 0;
    } else {
      frexp(v, obj);
      var f = (obj.mantissa * 256) / v;
      res[i*4+0] = Math.floor(red * f);
      res[i*4+1] = Math.floor(grn * f);
      res[i*4+2] = Math.floor(blu * f);
      res[i*4+3] = obj.exponent + 128;
    }
  }
  return res;
}

function encode_rgbe10(array) {
  var pixels = array.buffer.byteLength / 12;
  var res = new Uint8Array(pixels * 5);
  var obj = {mantissa: 0.0, exponent: 0};
  for (var i = 0; i < pixels; ++i) {
    var red = array[i*3+0];
    var grn = array[i*3+1];
    var blu = array[i*3+2];
    var v = Math.max(Math.abs(red), Math.max(Math.abs(grn), Math.abs(blu)));
    if (v === 0.0) {
      res[i*5+0] = 0;
      res[i*5+1] = 0;
      res[i*5+2] = 0;
      res[i*5+3] = 0;
      res[i*5+4] = 0;
    } else {
      frexp(v, obj);
      var f = (obj.mantissa * 1024) / v;
      var r = Math.floor(red * f)|0;
      var g = Math.floor(grn * f)|0;
      var b = Math.floor(blu * f)|0;
      var e = Math.max(0, Math.min(1023, obj.exponent + 512));
      // [high 8 bits of r]
      res[i*5+0] = r >> 2;
      // [low 2 bits of r][high 6 bits of g]
      res[i*5+1] = ((r & 0x03) << 8) | (g >> 4);
      // [low 4 bits of g][high 4 bits of b]
      res[i*5+2] = ((g & 0x0f) << 4) | (b >> 6);
      // [low 6 bits of b][high 2 bits of e]
      res[i*5+3] = ((b & 0x3f) << 2) | (e >> 8);
      // [low 8 bits of e]
      res[i*5+4] = e & 0xff;
    }
  }
  return res;
}

// signed 10+1 R, signed 10+1 G, signed 10+1 B, 7 E
// SRRRRRRR RRRSGGGG GGGGGGSB BBBBBBBB BEEEEEEE
function encode_rgbe11(array) {
  var pixels = array.buffer.byteLength / 12;
  var res = new Uint8Array(pixels * 5);
  var obj = {mantissa: 0.0, exponent: 0};
  for (var i = 0; i < pixels; ++i) {
    var red = array[i*3+0];
    var grn = array[i*3+1];
    var blu = array[i*3+2];
    var v = Math.max(Math.abs(red), Math.max(Math.abs(grn), Math.abs(blu)));
    if (v === 0.0) {
      res[i*5+0] = 0;
      res[i*5+1] = 0;
      res[i*5+2] = 0;
      res[i*5+3] = 0;
      res[i*5+4] = 0;
    } else {
      frexp(v, obj);
      var f = (obj.mantissa * 1024) / v;
      var r = Math.floor(red * f)|0;
      var g = Math.floor(grn * f)|0;
      var b = Math.floor(blu * f)|0;
      var e = Math.max(0, Math.min(127, obj.exponent + 64));
      // [high 8 bits of r]
      res[i*5+0] = r >>> 3;
      // [low 3 bits of r][high 5 bits of g]
      res[i*5+1] = ((r & 0x07) << 5) | ((g >>> 6) & 0x1f);
      // [low 6 bits of g][high 2 bits of b]
      res[i*5+2] = ((g & 0xf3) << 2) | ((b >>> 9) & 0x03);
      // [high 8 bits of low 9 bits of b]
      res[i*5+3] = (b & 0x1ff) >>> 1;
      // [low bit of b][7 bits of e]
      res[i*5+4] = ((b & 0x001) << 7) | (e & 0x7f);
    }
  }
  return res;
}

function decode_rgbe(array) {
  var pixels = array.buffer.byteLength / 4;
  var res = new Float32Array(pixels*3);
  for (var i = 0; i < pixels; ++i) {
    var e = array[i*4+3];
    if (e === 0) {
      res[i*3+0] = res[i*3+1] = res[i*3+2] = 0;
    } else {
      var f = ldexp(1.0, e - 128 - 8)
      res[i*3+0] = array[i*4+0] * f;
      res[i*3+1] = array[i*4+1] * f;
      res[i*3+2] = array[i*4+2] * f;
    }
  }
  return res;
}

function decode_rgbe10(array) {
  var pixels = array.buffer.byteLength / 5;
  var res = new Float32Array(pixels*3);
  for (var i = 0; i < pixels; ++i) {
    var A0 = array[i*5+0], A1 = array[i*5+1],
        A2 = array[i*5+2], A3 = array[i*5+3],
        A4 = array[i*5+4];
    // [A0][high 2 bits of A1]
    var r = (A0 << 2) | (A1 >> 6);
    // [low 6 bits of A1][high 4 bits of A2]
    var g = ((A1 & 0x3f) << 4) | (A2 >> 4);
    // [low 4 bits of A2][high 6 bits of A3]
    var b = ((A2 & 0x0f) << 6) | (A3 >> 2);
    // [low 2 bits of A3][A4]
    var e = ((A3 & 0x03) << 8) | A4;
    if (e === 0) {
      res[i*3+0] = res[i*3+1] = res[i*3+2] = 0;
    } else {
      var f = ldexp(1.0, e - 512 - 10)
      res[i*3+0] = r * f;
      res[i*3+1] = g * f;
      res[i*3+2] = b * f;
    }
  }
  return res;
}

// sign-extend 11-bit integer
function sign_extend11(i) {
  if (i > 1023) return i - 2048;
  return i;
}

// signed 10+1 R, signed 10+1 G, signed 10+1 B, 7 E
// SRRRRRRR RRRSGGGG GGGGGGSB BBBBBBBB BEEEEEEE
function decode_rgbe11(array) {
  var pixels = array.buffer.byteLength / 5;
  var res = new Float32Array(pixels*3);
  for (var i = 0; i < pixels; ++i) {
    var A0 = array[i*5+0], A1 = array[i*5+1],
        A2 = array[i*5+2], A3 = array[i*5+3],
        A4 = array[i*5+4];
    // [A0][high 3 bits of A1]
    var r = sign_extend11((A0 << 3) | (A1 >> 5));
    // [low 5 bits of A1][high 6 bits of A2]
    var g = sign_extend11(((A1 & 0x1f) << 6) | (A2 >> 2));
    // [low 2 bits of A2][A3][high 1 bit of A4]
    var b = sign_extend11(((A2 & 0x03) << 9) | (A3 << 1) | (A4 >> 7));
    // [low 7 bits of A4]
    var e = A4 & 0x7f;
    if (e === 0) {
      res[i*3+0] = res[i*3+1] = res[i*3+2] = 0;
    } else {
      var f = ldexp(1.0, e - 64 - 10)
      res[i*3+0] = r * f;
      res[i*3+1] = g * f;
      res[i*3+2] = b * f;
    }
  }
  return res;
}
