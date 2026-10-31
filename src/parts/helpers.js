const f1 = (p, n, v) => gl.uniform1f(p.u(n), v);
const f2 = (p, n, a, b) => gl.uniform2f(p.u(n), a, b);
const f3 = (p, n, a, b, c) => gl.uniform3f(p.u(n), a, b, c);
const i1 = (p, n, v) => gl.uniform1i(p.u(n), v);
const i2 = (p, n, a, b) => gl.uniform2i(p.u(n), a, b);
const u1 = (p, n, v) => gl.uniform1ui(p.u(n), v >>> 0);
function tex(p, n, t, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u(n), unit); }

const targets = {};
function makeTex(w, h, fmt, mip) {
  const texo = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texo);
  let ifmt = gl.RGBA8, type = gl.UNSIGNED_BYTE, filt = gl.LINEAR;
  if (fmt === 'f32' && floatOK) { ifmt = gl.RGBA32F; type = gl.FLOAT; filt = gl.NEAREST; }
  else if ((fmt === 'f16' || fmt === 'f32') && floatOK) { ifmt = gl.RGBA16F; type = gl.HALF_FLOAT; }
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  return texo;
}
function tgt(name, w, h, fmt, mip = false) {
  let t = targets[name];
  if (t && t.w === w && t.h === h && t.fmt === fmt && t.mip === mip) return t;
  if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
  const texo = makeTex(w, h, fmt, mip);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texo, 0);
  t = targets[name] = {tex:texo, fb, w, h, fmt, mip};
  return t;
}
function mrt(name, w, h) {
  let t = targets[name];
  if (t && t.w === w && t.h === h) return t;
  if (t) { gl.deleteTexture(t.tex); gl.deleteTexture(t.tex2); gl.deleteFramebuffer(t.fb); }
  const a = makeTex(w, h, 'u8', true), b = makeTex(w, h, 'u8', true);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  t = targets[name] = {tex:a, tex2:b, fb, w, h, mrt:true};
  return t;
}
function bindTarget(t) {
  if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); }
}
function pass(prog, t, setup) {
  gl.bindVertexArray(vao);
  bindTarget(t);
  gl.useProgram(prog.p);
  f2(prog, 'uRes', t ? t.w : cv.width, t ? t.h : cv.height);
  setup(prog);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function mips(t) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.generateMipmap(gl.TEXTURE_2D); }
const lodFor = (r, srcRes, taps, stretch) => Math.max(0, Math.log2(Math.max(r * srcRes * Math.sqrt(Math.PI * stretch / taps), 1e-6)) - 0.25);
function dataTex(w, h, data, filter = gl.NEAREST) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

