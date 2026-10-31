/* ---------- Water: evolve the spectrum h(k,t). Output A packs slope_x + i·slope_y and
              disp_x + i·disp_y; output B packs the height. Both are inverse-FFT'd. ---------- */
const FS_SPEC = HEAD + `
uniform sampler2D uH0, uH0r; uniform int uN, uNd; uniform float uL, uT, uTS, uLoopT, uHw, uDs, uDk; uniform vec4 uDsrc[12];
layout(location=0) out vec4 oA; layout(location=1) out vec4 oB;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  float N = float(uN);
  vec2 n = vec2(ij);
  n -= N * step(N * 0.5, n);
  vec2 k = TAU * n / uL; float kl = length(k);
  if (kl < 1e-6){ oA = vec4(0.0); oB = vec4(0.0); return; }
  vec4 h0 = texelFetch(uH0, ij, 0);
  // gravity–capillary dispersion with finite depth: ω² = (gk + σk³/ρ) tanh(kH)
  float w = sqrt((9.81 * kl + 7.4e-5 * kl * kl * kl) * tanh(min(kl * uHw, 10.0))) * uTS;
  float w0 = w;
  if (uLoopT > 0.0) w = floor(w * uLoopT / TAU + 0.5) * TAU / uLoopT;
  float ph = mod(w * uT, TAU);
  vec2 e = vec2(cos(ph), -sin(ph));   // waves travel along +k
  vec2 h = cmul(h0.xy, e) + cmul(vec2(h0.z, -h0.w), vec2(e.x, -e.y));
  // splashes: each mode of an initial hump just oscillates in place, cos(ω·age)
  if (uNd > 0){
    float g = uDk * exp(-0.25 * kl * kl * uDs * uDs);
    for (int i = 0; i < 12; i++){
      if (i >= uNd) break;
      vec4 S = uDsrc[i];
      float ph2 = dot(k, S.xy);
      h += g * S.w * cos(w0 * S.z) * vec2(cos(ph2), -sin(ph2));
    }
  }
  vec2 ih = vec2(-h.y, h.x);
  oA = vec4(k.x * ih - k.y * h, -(k.x / kl) * ih + (k.y / kl) * h);
  // wind ripples kept apart (slopes only), so they can be confined to gust patches
  vec4 r0 = texelFetch(uH0r, ij, 0);
  vec2 hr = cmul(r0.xy, e) + cmul(vec2(r0.z, -r0.w), vec2(e.x, -e.y));
  vec2 ihr = vec2(-hr.y, hr.x);
  oB = vec4(h, k.x * ihr - k.y * hr);
}`;
/* ---------- Water: one radix-2 Stockham FFT stage (inverse, two complex signals per texel) ---------- */
const FS_FFT = COMMON + `
uniform sampler2D uSrc; uniform int uN, uSub, uHoriz;
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  int idx = uHoriz == 1 ? p.x : p.y;
  int hs = uSub / 2;
  int ev = (idx / uSub) * hs + (idx % hs);
  int od = ev + uN / 2;
  vec4 e = texelFetch(uSrc, uHoriz == 1 ? ivec2(ev, p.y) : ivec2(p.x, ev), 0);
  vec4 o = texelFetch(uSrc, uHoriz == 1 ? ivec2(od, p.y) : ivec2(p.x, od), 0);
  float a = TAU * float(idx % uSub) / float(uSub);
  vec2 w = vec2(cos(a), sin(a));
  fragColor = vec4(e.xy + cmul(w, o.xy), e.zw + cmul(w, o.zw));
}`;

/* ---------- Water: per-ray light transport. Every mesh vertex is a point on the displaced,
              heighted surface; its ray is refracted (or reflected) by Snell's law at that
              point's true normal, weighted by unpolarized Fresnel, and carried to the
              receiving plane. Brightness = source area / landed area. ---------- */
const FRES = `
float fres(float ci, float n){
  float st2 = (1.0 - ci * ci) / (n * n);
  if (st2 >= 1.0) return 1.0;
  float ct = sqrt(1.0 - st2);
  float rs = (ci - n * ct) / (ci + n * ct), rp = (n * ci - ct) / (n * ci + ct);
  return 0.5 * (rs * rs + rp * rp);
}`;
const VS_MESH = HEAD + FRES + `
uniform sampler2D uSa, uSb, uSm; uniform int uM, uG, uMargin, uRefl;
uniform float uTile, uDepth, uChop, uN, uF0; uniform vec3 uL; uniform vec2 uFlat;
out vec2 vOld; out float vF;
void main(){
  int q = gl_VertexID / 6; int k = gl_VertexID - q * 6;
  ivec2 cr = (k == 1 || k == 4) ? ivec2(1, 0) : ((k == 2 || k == 3) ? ivec2(0, 1) : ((k == 5) ? ivec2(1, 1) : ivec2(0, 0)));
  int gj = q / uG; int gi = q - gj * uG;
  ivec2 id = ivec2(gi, gj) + cr - ivec2(uMargin);
  vec2 rest = (vec2(id) + 0.5) / float(uM);
  vec4 a = textureLod(uSa, rest, 0.0), b = textureLod(uSb, rest, 0.0);
  float h = b.x;
  vec2 mk = textureLod(uSm, rest, 0.0).rg;
  vec2 sl = a.xy * mk.g + mk.r * b.zw;
  vec3 n = normalize(vec3(-sl, 1.0));
  vec2 p = rest * uTile - uChop * a.zw;
  float ci = max(dot(-uL, n), 0.0);
  vec2 hit;
  if (uRefl == 1){
    vec3 r = reflect(uL, n);
    hit = p + (uDepth - h) / max(r.z, 0.03) * r.xy;
    vF = fres(ci, uN) / uF0;
  } else {
    vec3 r = refract(uL, n, 1.0 / uN);
    hit = p + (uDepth + h) / max(-r.z, 0.03) * r.xy;
    vF = (1.0 - fres(ci, uN)) / uF0;
  }
  vOld = rest;
  gl_Position = vec4((hit / uTile - uFlat) * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_MESH = HEAD + `
in vec2 vOld; in float vF; out vec4 fragColor; uniform vec3 uMask; uniform float uA;
void main(){
  vec2 dx = dFdx(vOld), dy = dFdy(vOld);
  float a0 = abs(dx.x * dy.y - dx.y * dy.x);
  fragColor = vec4(uMask * min(a0 * uA * uA, 120.0) * vF, 1.0);
}`;
/* ---------- Hulls, walls and rocks: reflected rays from the water in front of a surface
              that may lean toward (flared bow) or away from the water. ---------- */
const VS_WALL = HEAD + FRES + `
uniform sampler2D uSa, uSb, uSm; uniform int uM, uGy, uMy;
uniform float uTile, uChop, uCosL, uSinL, uN, uF0, uLatK; uniform vec3 uL;
out vec2 vOld; out float vF;
void main(){
  int q = gl_VertexID / 6; int k = gl_VertexID - q * 6;
  ivec2 cr = (k == 1 || k == 4) ? ivec2(1, 0) : ((k == 2 || k == 3) ? ivec2(0, 1) : ((k == 5) ? ivec2(1, 1) : ivec2(0, 0)));
  int gx = q / uGy; int gy = q - gx * uGy;
  ivec2 id = ivec2(gx, gy - uMy) + cr;          // x = distance out from the wall, y = along the wall
  vec2 rest = vec2(id) / float(uM);
  vec4 a = textureLod(uSa, rest, 0.0), b = textureLod(uSb, rest, 0.0);
  float h = b.x;
  vec2 mk = textureLod(uSm, rest, 0.0).rg;
  vec2 sl = a.xy * mk.g + mk.r * b.zw;
  vec3 n = normalize(vec3(-sl, 1.0));
  vec3 r = reflect(uL, n);
  vF = fres(max(dot(-uL, n), 0.0), uN) / uF0;
  vec2 d = -uChop * a.zw;
  vec3 P = vec3(max(rest.x * uTile + d.x, 0.0), rest.y * uTile + d.y, h);
  float den = min(r.x * uCosL - r.z * uSinL, -0.02);
  float t = -(P.x * uCosL - P.z * uSinL) / den;
  vec3 H = P + t * r;
  float s = H.x * uSinL + H.z * uCosL;            // height up the surface from the waterline
  float yy = H.y - rest.x * uTile * uLatK;
  vOld = rest;
  gl_Position = vec4(yy / uTile * 2.0 - 1.0, s / uTile * 2.0 - 1.0, 0.0, 1.0);
}`;
