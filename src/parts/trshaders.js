/* ---------- Trees: leaves of real 3D trees, projected along the central sun direction
              into eight height slices (multiplicative transmission, two MRT targets) ---------- */
const VS_LEAF3 = HEAD + `
layout(location=0) in vec4 aPos;   // xyz, shape
layout(location=1) in vec4 aAxis;  // xyz, len
layout(location=2) in vec4 aNorm;  // xyz, wid
layout(location=3) in vec4 aFlut;  // f1, f2, phase, amp
layout(location=4) in float aNode;
uniform sampler2D uDisp; uniform float uT, uLx, uLy, uCot, uSinE, uZr, uDS;
out vec2 vUV; flat out int vSlice; flat out float vShape;

uniform float uTwA, uGustE, uTwCoh, uLoopT; uniform vec3 uTwF; uniform int uWrap;
uniform vec4 uWk[32], uWa[32]; uniform int uNW; uniform vec3 uWm; uniform float uZtop, uFlutU, uLeanK;
// node data .w = local eddy strength (gusts reach each spray on their own), +10 when the node is a twig
float nodeE(float w){ return w >= 9.5 ? w - 10.0 : w; }
float qf(float f){ return uLoopT > 0.0 ? max(1.0, floor(f * uLoopT + 0.5)) / uLoopT : f; }
vec3 twigMove(int node, float w, vec2 xy){
  if (w < 9.5 || uTwA <= 0.0) return vec3(0.0);
  float E = w - 10.0;
  uint h = uint(node) * 2654435761u; h ^= h >> 15; h *= 2246822519u; h ^= h >> 13;
  // every twig has its own phases and its own natural frequencies (springier or stiffer)
  vec3 rp = vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) * (TAU / 1023.0);
  float j = 0.75 + 0.6 * float((h >> 5) & 255u) / 255.0;
  float s1 = sin(TAU * qf(uTwF.x * j) * uT + rp.x), s2 = sin(TAU * qf(uTwF.y * j) * uT + rp.y), s3 = sin(TAU * qf(uTwF.z * j) * uT + rp.z);
  return uTwA * E * vec3(0.7 * s1 + 0.3 * s3, 0.55 * s2 + 0.2 * s1, 0.6 * s3 + 0.25 * s2);
}
uniform sampler2D uOvl; uniform int uOvlOn;
// painted density where this point of the tree sits at rest, seen along the sun: + thins it out, - fills it in
float paintK(vec3 p0){
  if (uOvlOn == 0) return 0.0;
  vec2 g = vec2((p0.x - (p0.z - uZr) * uCot) / uLx, p0.y / uLy);
  if (uWrap == 1) g = fract(g);
  return textureLod(uOvl, g, 0.0).r * 2.0 - 1.0;
}
float hashI(int i, uint s){ uint h = uint(i) * 2654435761u + s; h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16; return float(h & 65535u) / 65535.0; }
vec3 rot(vec3 v, vec3 ax, float a){ return v * cos(a) + cross(ax, v) * sin(a) + ax * dot(ax, v) * (1.0 - cos(a)); }
void main(){
  int corner = gl_VertexID;
  vec2 c = (corner == 0) ? vec2(0.0, -0.5) : (corner == 1 || corner == 4) ? vec2(1.0, -0.5) : (corner == 2 || corner == 3) ? vec2(0.0, 0.5) : vec2(1.0, 0.5);
  int node = int(aNode + 0.5);
  vec4 dd = texelFetch(uDisp, ivec2(node % 1024, node / 1024), 0);
  vec3 disp = dd.xyz + twigMove(node, dd.w, aPos.xy);
  // the air at this leaf: mean wind (weaker down in the crown) plus the same eddies that drive the branches
  float zr = clamp(1.0 - aPos.z / uZtop, 0.0, 1.5);
  vec3 Wv = uWm * exp(-2.0 * zr);
  float tp = exp(-zr);
  for (int i = 0; i < 32; i++){ if (i >= uNW) break; Wv += uWa[i].xyz * tp * cos(dot(uWk[i].xy, aPos.xy) - uWk[i].z * uT + uWk[i].w); }
  float spd = length(Wv.xy);
  // leaves flutter once the local wind passes a threshold, harder the stronger it blows
  float th = aFlut.w * smoothstep(0.4 * uFlutU, 2.2 * uFlutU, spd) * (0.6 + 0.4 * min(spd / (3.0 * uFlutU), 2.0)) * (sin(TAU * aFlut.x * uT + aFlut.z) + 0.45 * sin(TAU * aFlut.y * uT + aFlut.z * 1.7));
  vec3 ax = aAxis.xyz;
  vec3 n = rot(aNorm.xyz, ax, th);
  // and they are pushed over downwind, turning toward edge-on as the wind rises (reconfiguration)
  if (spd > 0.05){ vec3 la = normalize(vec3(-Wv.y, Wv.x, 0.0)); float lean = min(uLeanK * spd * spd, 0.9); n = rot(n, la, lean); ax = rot(ax, la, lean * 0.5); }
  vec3 side = normalize(cross(ax, n));
  // painted density: opening up drops leaves (each by its own chance, so the crown thins naturally), filling in
  // grows them, closing the gaps between; it is tied to where each leaf hangs, so it moves with the tree
  float pk = paintK(aPos.xyz), ls = 1.0;
  if (pk > 0.0){ if (hashI(gl_InstanceID / 4, 17u) < pk * 1.08) { gl_Position = vec4(-9.0, -9.0, 0.0, 1.0); return; } ls = 1.0 - 0.25 * pk; }
  else ls = 1.0 - 0.9 * pk;
  vec3 P = aPos.xyz + disp + n * (0.06 * aAxis.w * th);
  vec3 W = P + (ax * (c.x * aAxis.w) + side * (c.y * aNorm.w)) * ls;
  // light space: project along the sun onto the receiver, then view perpendicular to the beam
  vec2 g = vec2((W.x - (W.z - uZr) * uCot) / uLx, W.y / uLy);
  vec2 gc = vec2((P.x - (P.z - uZr) * uCot) / uLx, P.y / uLy);
  vec2 shift = uWrap == 1 ? -floor(gc) : vec2(0.0);
  vec2 fc = gc + shift;
  int cp = gl_InstanceID % 4;
  if (uWrap == 0 && cp != 0) { gl_Position = vec4(-9.0, -9.0, 0.0, 1.0); return; }
  vec2 o = vec2((cp & 1) == 1 ? (fc.x > 0.5 ? -1.0 : 1.0) : 0.0, (cp & 2) == 2 ? (fc.y > 0.5 ? -1.0 : 1.0) : 0.0);
  vUV = c; vShape = aPos.w;
  vSlice = clamp(int((P.z - uZr) / uSinE / uDS), 0, 7);
  gl_Position = P.z < uZr ? vec4(-9.0, -9.0, 0.0, 1.0) : vec4((g + shift + o) * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_LEAF3 = HEAD + `
in vec2 vUV; flat in int vSlice; flat in float vShape;
uniform float uTransl;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){
  float u = vUV.x, v = vUV.y;
  int s = int(vShape + 0.5);
  float d, Tl = uTransl;
  if (s == 0){            // oak: obovate with rounded lobes
    float env = 0.5 * pow(max(sin(PI * pow(u, 0.8)), 0.0), 0.75);
    float lobe = 0.6 + 0.4 * pow(abs(cos(PI * 4.5 * u)), 0.6);
    d = abs(v) - env * lobe;
  } else if (s == 1){     // maple: palmate, five pointed lobes
    vec2 q = vec2(u - 0.46, v);
    float a = atan(q.y, q.x);
    float lob = pow(abs(cos(2.5 * (a + PI))), 0.55);
    float R = 0.5 * (0.5 + 0.5 * lob) * (1.0 - 0.18 * smoothstep(2.4, PI, abs(a)));
    d = length(q) - R;
  } else if (s == 2){     // birch: ovate, pointed tip
    float env = 0.5 * pow(max(sin(PI * pow(u, 1.25)), 0.0), 0.7);
    d = abs(v) - env;
  } else if (s == 3){     // aspen: round with short point
    vec2 q = vec2(u - 0.48, v);
    float r = 0.47 * (1.0 + 0.12 * smoothstep(0.2, 0.5, q.x / 0.5) - 0.05 * cos(atan(q.y, q.x) * 2.0));
    d = length(q * vec2(1.0, 1.02)) - r * (1.0 - 0.6 * smoothstep(0.35, 0.52, q.x));
  } else if (s == 4){     // palm leaflet: long and narrow
    d = abs(v) - 0.5 * pow(max(sin(PI * u), 0.0), 0.3);
  } else {                // pine shoot: a brush of needles
    float env = 0.5 * pow(max(sin(PI * min(u * 1.05, 1.0)), 0.0), 0.5);
    float inside = abs(v) - env;
    float q = (u - abs(v) * 0.9) * 26.0;
    float needle = abs(fract(q) - 0.5);
    float lw = fwidth(q);
    float cov = smoothstep(0.5 * lw + 0.18, 0.18 - 0.5 * lw, needle);
    float shaft = smoothstep(0.08, 0.03, abs(v));
    d = inside;
    Tl = 1.0 - max(cov * 0.85, shaft);
  }
  float w = max(fwidth(d), 1e-4);
  float cov = clamp(0.5 - d / w, 0.0, 1.0);
  float T = 1.0 - cov * (1.0 - Tl);
  if (cov <= 0.0) discard;
  vec4 sel = vec4(equal(ivec4(vSlice), ivec4(0, 1, 2, 3)));
  vec4 sel2 = vec4(equal(ivec4(vSlice), ivec4(4, 5, 6, 7)));
  o0 = mix(vec4(1.0), vec4(T), sel);
  o1 = mix(vec4(1.0), vec4(T), sel2);
}`;
/* ---------- Trees: trunk, branches and twigs as tapered capsules ---------- */
const VS_SEG = HEAD + `
layout(location=0) in vec4 aA;  // xyz, radius
layout(location=1) in vec4 aB;  // xyz, radius
layout(location=2) in vec2 aN;  // node indices
uniform sampler2D uDisp; uniform float uLx, uLy, uCot, uSinE, uZr, uDS, uPx, uTile, uT;
uniform float uTwA, uGustE, uTwCoh, uLoopT; uniform vec3 uTwF; uniform int uWrap;
// node data .w = local eddy strength (gusts reach each spray on their own), +10 when the node is a twig
float nodeE(float w){ return w >= 9.5 ? w - 10.0 : w; }
float qf(float f){ return uLoopT > 0.0 ? max(1.0, floor(f * uLoopT + 0.5)) / uLoopT : f; }
vec3 twigMove(int node, float w, vec2 xy){
  if (w < 9.5 || uTwA <= 0.0) return vec3(0.0);
  float E = w - 10.0;
  uint h = uint(node) * 2654435761u; h ^= h >> 15; h *= 2246822519u; h ^= h >> 13;
  // every twig has its own phases and its own natural frequencies (springier or stiffer)
  vec3 rp = vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) * (TAU / 1023.0);
  float j = 0.75 + 0.6 * float((h >> 5) & 255u) / 255.0;
  float s1 = sin(TAU * qf(uTwF.x * j) * uT + rp.x), s2 = sin(TAU * qf(uTwF.y * j) * uT + rp.y), s3 = sin(TAU * qf(uTwF.z * j) * uT + rp.z);
  return uTwA * E * vec3(0.7 * s1 + 0.3 * s3, 0.55 * s2 + 0.2 * s1, 0.6 * s3 + 0.25 * s2);
}
out vec2 vP; flat out vec4 vSeg; flat out vec2 vW; flat out int vSlice;
vec3 dsp(float n, vec2 xy){ int i = int(n + 0.5); vec4 d = texelFetch(uDisp, ivec2(i % 1024, i / 1024), 0); return d.xyz + twigMove(i, d.w, xy); }
uniform sampler2D uOvl; uniform int uOvlOn;
// painted density where this point of the tree sits at rest, seen along the sun: + thins it out, - fills it in
float paintK(vec3 p0){
  if (uOvlOn == 0) return 0.0;
  vec2 g = vec2((p0.x - (p0.z - uZr) * uCot) / uLx, p0.y / uLy);
  if (uWrap == 1) g = fract(g);
  return textureLod(uOvl, g, 0.0).r * 2.0 - 1.0;
}
float hashI(int i, uint s){ uint h = uint(i) * 2654435761u + s; h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16; return float(h & 65535u) / 65535.0; }
void main(){
  int corner = gl_VertexID;
  vec2 c = (corner == 0) ? vec2(0.0, -1.0) : (corner == 1 || corner == 4) ? vec2(1.0, -1.0) : (corner == 2 || corner == 3) ? vec2(0.0, 1.0) : vec2(1.0, 1.0);
  // where it is opened right up, the finer twigs go too; the limbs stay
  float pk = paintK(0.5 * (aA.xyz + aB.xyz));
  if (pk > 0.55 && max(aA.w, aB.w) < 0.035 && hashI(gl_InstanceID / 4, 29u) < (pk - 0.55) * 2.4) { gl_Position = vec4(-9.0, -9.0, 0.0, 1.0); return; }
  vec3 A = aA.xyz + dsp(aN.x, aA.xy), B = aB.xyz + dsp(aN.y, aB.xy);
  vec2 ga = vec2((A.x - (A.z - uZr) * uCot) / uLx, A.y / uLy), gb = vec2((B.x - (B.z - uZr) * uCot) / uLx, B.y / uLy);
  vec2 t = gb - ga; float tl = length(t);
  vec2 td = tl > 1e-7 ? t / tl : vec2(1.0, 0.0); vec2 nd = vec2(-td.y, td.x);
  float wa = aA.w / uTile, wb = aB.w / uTile;      // a cylinder seen along the beam is exactly 2r wide
  float pad = max(wa, wb) + 1.5 * uPx;
  vec2 P = mix(ga - td * pad, gb + td * pad, c.x) + nd * c.y * pad;
  vec2 gc = 0.5 * (ga + gb);
  vec2 shift = uWrap == 1 ? -floor(gc) : vec2(0.0);
  vec2 fc = gc + shift;
  int cp = gl_InstanceID % 4;
  if (uWrap == 0 && cp != 0) { gl_Position = vec4(-9.0, -9.0, 0.0, 1.0); return; }
  vec2 o = vec2((cp & 1) == 1 ? (fc.x > 0.5 ? -1.0 : 1.0) : 0.0, (cp & 2) == 2 ? (fc.y > 0.5 ? -1.0 : 1.0) : 0.0);
  vP = P; vSeg = vec4(ga, gb); vW = vec2(wa, wb);
  float zm = 0.5 * (A.z + B.z);
  vSlice = clamp(int((zm - uZr) / uSinE / uDS), 0, 7);
  gl_Position = zm < uZr ? vec4(-9.0, -9.0, 0.0, 1.0) : vec4((P + shift + o) * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_SEG = HEAD + `
in vec2 vP; flat in vec4 vSeg; flat in vec2 vW; flat in int vSlice;
uniform float uPx;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){
  vec2 a = vSeg.xy, b = vSeg.zw, ba = b - a;
  float h = clamp(dot(vP - a, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
  float dd = length(vP - a - h * ba);
  float w = mix(vW.x, vW.y, h);
  float wE = max(w, 0.5 * uPx);
  float cov = clamp((wE - dd) / uPx + 0.5, 0.0, 1.0) * min(1.0, w / (0.5 * uPx));
  if (cov <= 0.0) discard;
  float T = 1.0 - cov;
  vec4 sel = vec4(equal(ivec4(vSlice), ivec4(0, 1, 2, 3)));
  vec4 sel2 = vec4(equal(ivec4(vSlice), ivec4(4, 5, 6, 7)));
  o0 = mix(vec4(1.0), vec4(T), sel);
  o1 = mix(vec4(1.0), vec4(T), sel2);
}`;
/* ---------- Trees: ray integration over the sun disk. Each direction is traced through
              all eight slices at its own parallax; the gaps act as pinhole cameras. ---------- */
const FS_CANOPY3 = COMMON + `
uniform sampler2D uS0, uS1, uTaps; uniform int uNTaps; uniform float uH[8]; uniform float uLod[8]; uniform vec3 uK;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c3 = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 512; i++){
    if (i >= uNTaps) break;
    vec4 tp = texelFetch(uTaps, ivec2(i, 0), 0);
    vec2 o = tp.xy;
    float T = textureLod(uS0, uv + o * uH[0], uLod[0]).r
            * textureLod(uS0, uv + o * uH[1], uLod[1]).g
            * textureLod(uS0, uv + o * uH[2], uLod[2]).b
            * textureLod(uS0, uv + o * uH[3], uLod[3]).a
            * textureLod(uS1, uv + o * uH[4], uLod[4]).r
            * textureLod(uS1, uv + o * uH[5], uLod[5]).g
            * textureLod(uS1, uv + o * uH[6], uLod[6]).b
            * textureLod(uS1, uv + o * uH[7], uLod[7]).a;
    c3 += tp.z * pow(vec3(max(T, 1e-6)), uK); ws += tp.z;
  }
  fragColor = vec4(c3 / ws, 1.0);
}`;

