function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
function program(vs, fs, name) {
  const p = gl.createProgram();
  try {
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  } catch (e) { showErr('Shader error in ' + name + ':\n' + e.message); throw e; }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { showErr('Link error in ' + name + ':\n' + gl.getProgramInfoLog(p)); throw new Error('link'); }
  const locs = {};
  return {p, u: n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(p, n))};
}