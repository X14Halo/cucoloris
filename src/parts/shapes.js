/* =====================================================================
   SHAPES
   Procedural breakup patterns lighters use to add interest: shafts,
   beams, streaks, splotches, a cucoloris board, water shimmer, soft
   spots. The tiling ones are exactly periodic; all of them loop.
   ===================================================================== */
const OVL_GLSL = `
// paint over: k > 0 opens the pattern up (light grows into the gaps, then clears), k < 0 thickens it
vec3 ovlMod(vec3 g, float k){
  if (abs(k) < 0.004) return g;
  vec3 o;
  if (k > 0.0){
    o = max(g, min(g * (1.0 + 6.0 * k), max(g, vec3(1.0))));
    o = mix(o, max(g, vec3(1.0)), smoothstep(0.65, 1.0, k));
  } else {
    float a = -k;
    o = g * pow(clamp(g, 0.0, 1.0), vec3(3.0 * a));
    o = mix(o, vec3(0.0), smoothstep(0.65, 1.0, a));
  }
  return o;
}`;
const FS_SHAPE = COMMON + OVL_GLSL + `
uniform int uShape, uCount, uDir, uStretch; uniform uint uSeed; uniform float uWarp, uClump; uniform sampler2D uPaint;
uniform float uSpread, uAngle, uWidth, uWVar, uSoft, uFall, uBrk, uScale, uAmount, uMotion, uT, uLoopT;
uniform vec2 uApex; uniform int uPz; uniform float uAim;
uniform sampler2D uOvl; uniform int uOvlOn; vec2 gOv = vec2(0.0);
// organic motion
uniform vec2 uDriftOff; uniform float uMorphZ, uFlowZ; uniform int uPzM, uPzF;
uniform float uSway, uSwayHz, uWindA, uFlow, uBreath, uBreathT, uGust, uFlutter; uniform ivec2 uWindI;
float gZ = 0.0, gAmt = 0.5, gGain = 0.5; int gPz = 1000; uint gSO = 0u; bool gFlut = false;
uniform float uRough, uDark, uShimSpd, uBlend, uBlendT, uBlendOff; uniform int uBlendN;
bool gRaw = false;   // when set, the soft shapes return their raw field, so two versions can be morphed before it is shaped
uniform float uFlutHz, uLSig;
void useZ(float z, int P){ gZ = z; gPz = P; }
float h1(int i, int k){ return rnd(ivec3(i, k, 5), uSeed); }
// a slowly wandering 0–1 value for each shaft: shimmer that never repeats
float wander(float x, float s){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fract(sin((i + s) * 78.233) * 43758.5), fract(sin((i + 1.0 + s) * 78.233) * 43758.5), f); }
float qf(float f){ return uLoopT > 0.0 ? max(1.0, floor(f * uLoopT + 0.5)) / uLoopT : f; }
// plain value noise (for the framed shapes, which need not tile)
float vz(vec2 p, uint s){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = rnd(ivec3(ivec2(i), 1), s), b = rnd(ivec3(ivec2(i) + ivec2(1, 0), 1), s), c = rnd(ivec3(ivec2(i) + ivec2(0, 1), 1), s), d = rnd(ivec3(ivec2(i) + ivec2(1, 1), 1), s);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float fz(vec2 p, uint s){ float v = 0.0, a = 0.5, n = 0.0; for (int o = 0; o < 4; o++){ v += a * vz(p, s + uint(o) * 7u); n += a; p = p * 2.07 + 13.1; a *= 0.5; } return v / n; }
// periodic noise on an integer lattice, animated with a looping third axis
// periodic noise; the third axis is time, so the shapes evolve (gZ is set per use: morph, flow or still)
float pnA(vec2 q, ivec2 A, ivec2 B, uint s){ return pn3(vec3(q, gZ), A, B, gPz, s); }
float fbmA(vec2 uv, ivec2 A, ivec2 B, int oct, uint s){
  float v = 0.0, a = 0.5, n = 0.0;
  // q = M·uv with integer rows A, B: one tile step in uv moves q by a column of M, so those columns are the periods
  for (int o = 0; o < 6; o++){
    if (o >= oct) break;
    int m = 1 << o;
    vec2 q = vec2(dot(uv, vec2(A)), dot(uv, vec2(B))) * float(m);
    // fine flutter: the small detail of leafy shapes rocks back and forth through the noise's time axis
    float z0 = gZ;
    if (gFlut && o >= 2) gZ += uFlutter * sin(TAU * qf(uFlutHz * (1.0 + 0.23 * float(o))) * uT + float(o) * 1.7 + float(gSO) * 0.9);
    v += a * pnA(q, ivec2(A.x, B.x) * m, ivec2(A.y, B.y) * m, s + uint(o) * 31u); n += a; a *= gGain;
    gZ = z0;
  }
  return v / n;
}
// one fan of shafts from a source above the frame
float shafts(vec2 uv, bool curtain){
  vec2 p = uv - vec2(0.5 + uApex.x, 1.0 + uApex.y);
  // the fan is aimed from the source toward the middle of the frame
  float th = atan(p.x, -p.y) - uAim, r = length(p);
  float sp = radians(uSpread), acc = 0.0;
  float tw = TAU * qf(0.07) * uT;
  for (int i = 0; i < 64; i++){
    if (i >= uCount) break;
    float hi = h1(i, 1), hw = h1(i, 2), hb = h1(i, 3);
    float ts = uT * uShimSpd;
    float c = (-0.5 + (float(i) + 0.5 + (hi - 0.5) * 0.9 * uWVar) / float(uCount)) * sp + uMotion * 0.012 * sp * (2.0 * wander(ts * 0.15 + hi * 7.0, hi * 31.0) - 1.0);
    float w = 0.5 * uWidth * sp / float(uCount) * (1.0 + uWVar * (hw * 2.0 - 1.0) * 0.8);
    float d = abs(th - c);
    float e = 1.0 - smoothstep(w * (1.0 - uSoft), w * (1.0 + uSoft) + 1e-4, d);
    float fl = 1.0 + uMotion * 0.45 * (wander(ts * (0.2 + 0.15 * hb) + hb * 13.0, hb * 57.0) - 0.5) + uMotion * 0.12 * (wander(ts * 0.9 + hw * 5.0, hw * 91.0) - 0.5);
    float I = mix(1.0, 0.3 + 0.7 * hb, uWVar) * fl;
    if (curtain){
      // sheer or lace caught in the shaft: thread streaks and a repeating motif
      float u = (th - c) / max(w, 1e-4), v = r * 9.0;
      vec2 g = vec2(u * 2.5, v); vec2 gi = floor(g + 0.5), l = g - gi;
      float ros = 1.0 - smoothstep(0.18, 0.3, length(l * vec2(1.0, 1.3)));
      float thr = fz(vec2(u * 8.0, r * 1.2), 9u);
      I *= (0.55 + 0.45 * smoothstep(0.25, 0.75, thr)) * (1.0 - 0.45 * ros * uBrk);
    }
    acc = 1.0 - (1.0 - acc) * (1.0 - clamp(e * I, 0.0, 1.0));
  }
  float r0 = uApex.y;
  float fade = mix(1.0, exp(-2.6 * max(r - r0, 0.0)), uFall);
  // dust and haze drifting slowly through the shafts
  float st = fz(vec2(th * 60.0 / max(sp, 0.2) + uMotion * 0.4 * sin(uT * uShimSpd * 0.07), r * 1.4 - uMotion * 0.06 * uT * uShimSpd), 3u);
  st = mix(st, fz(vec2(th * 25.0 / max(sp, 0.2) - uMotion * 0.03 * uT * uShimSpd, r * 3.0 + uMotion * 0.02 * uT * uShimSpd), 5u), 0.4);
  float brk = mix(1.0, 0.35 + 1.1 * smoothstep(0.25, 0.8, st), uBrk);
  return acc * fade * brk;
}
float beams(vec2 uv){
  float a = radians(uAngle);
  vec2 d = vec2(cos(a), sin(a)), n = vec2(-d.y, d.x);   // beams run along -n (downward when angle is 0)
  vec2 q = uv - 0.5;
  float x = dot(q, d), y = dot(q, n);
  float acc = 0.0, span = 1.1;
  for (int i = 0; i < 64; i++){
    if (i >= uCount) break;
    float hi = h1(i, 1), hw = h1(i, 2), hb = h1(i, 3);
    float ts = uT * uShimSpd;
    float c = (-0.5 + (float(i) + 0.5 + (hi - 0.5) * 0.9 * uWVar) / float(uCount)) * span + uMotion * 0.008 * (2.0 * wander(ts * 0.15 + hi * 7.0, hi * 31.0) - 1.0);
    float w = 0.5 * uWidth * span / float(uCount) * (1.0 + uWVar * (hw * 2.0 - 1.0) * 0.8);
    float e = 1.0 - smoothstep(w * (1.0 - uSoft), w * (1.0 + uSoft) + 1e-4, abs(x - c));
    float I = mix(1.0, 0.35 + 0.65 * hb, uWVar) * (1.0 + uMotion * 0.45 * (wander(ts * (0.2 + 0.15 * hb) + hb * 13.0, hb * 57.0) - 0.5));
    acc = 1.0 - (1.0 - acc) * (1.0 - clamp(e * I, 0.0, 1.0));
  }
  float fade = mix(1.0, exp(-2.2 * (0.5 - y)), uFall);
  float st = fz(vec2(x * 40.0 + uMotion * 0.3 * sin(uT * uShimSpd * 0.07), y * 1.5 - uMotion * 0.06 * uT * uShimSpd), 4u);
  return acc * fade * mix(1.0, 0.35 + 1.1 * smoothstep(0.25, 0.8, st), uBrk);
}
float thresh(float n, float amount, float soft){
  float t = 1.0 - amount, w = 0.02 + 0.42 * soft * soft + 0.08 * soft;
  return smoothstep(t - w, t + w, n);
}
// ---- organic breakup: warped, clumped multi-scale noise, all exactly periodic ----
void lattice(int F, out ivec2 A, out ivec2 B){
  int s = max(uStretch, 1);
  if (uDir == 0){ A = ivec2(F * s, 0); B = ivec2(0, F); }
  else if (uDir == 2){ A = ivec2(F, 0); B = ivec2(0, F * s); }
  else if (uDir == 1){ A = ivec2(F * s, -F * s); B = ivec2(F, F); }
  else { A = ivec2(F * s, F * s); B = ivec2(-F, F); }
  if (s == 1){ A = ivec2(F, 0); B = ivec2(0, F); }
}
float orgField(vec2 uv, int F, uint sd){
  ivec2 A, B; lattice(F, A, B);
  int Fw = max(F, 1);
  // domain warp makes flowing, organic forms instead of plain noise
  float z0 = gZ; int p0 = gPz;
  if (uFlow > 0.0) useZ(uFlowZ, uPzF);
  vec2 w = vec2(fbmA(uv, ivec2(Fw, 0), ivec2(0, Fw), 3, sd + 1u), fbmA(uv, ivec2(Fw, 0), ivec2(0, Fw), 3, sd + 2u));
  useZ(z0, p0);
  vec2 u2 = uv + uWarp * 0.45 * w / float(Fw);
  int oct = 1 + int(uBrk * 5.0 + 0.5);
  float n = fbmA(u2, A, B, oct, sd);
  // clumping: a coarser field gathers the breakup into clusters with open gaps between
  int Fc = max(F / 3, 1);
  float c = fbmA(uv, ivec2(Fc, 0), ivec2(0, Fc), 2, sd + 5u);
  return 0.5 + 0.5 * (n + uClump * 0.9 * c) / (0.6 + 0.5 * uClump);
}
float leafStamps(vec2 uv, int F, float field, float thr){
  // little leaf shapes crowding the edges of the shadow masses
  int G = F * 4; vec2 g = uv * float(G); vec2 gi = floor(g); float m = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    ivec2 c = ivec2(gi) + ivec2(i, j); ivec2 cw = ivec2(wrap1(c.x, G), wrap1(c.y, G));
    vec2 ctr = vec2(c) + vec2(rnd(ivec3(cw, 11), uSeed + gSO), rnd(ivec3(cw, 12), uSeed + gSO));
    float a = rnd(ivec3(cw, 13), uSeed + gSO) * PI, sz = 0.35 + 0.45 * rnd(ivec3(cw, 14), uSeed + gSO);
    vec2 d = g - ctr; d = vec2(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
    float e = length(d / vec2(sz, sz * 0.5));
    float pr = smoothstep(0.22, 0.0, abs(field - thr) - 0.02) * step(rnd(ivec3(cw, 15), uSeed + gSO), 0.85);
    m = max(m, (1.0 - smoothstep(0.85, 1.0, e)) * pr);
  }
  return m;
}
float organic(vec2 uv, int F){
  float soft = uSoft;
  if (uShape == 9){                          // organic breakup
    float f9 = orgField(uv, F, (81u + gSO)); return gRaw ? f9 : thresh(f9, gAmt, soft);
  } else if (uShape == 10){                  // leafy breakup
    float f = orgField(uv, F, (82u + gSO)), thr = 1.0 - gAmt;
    float L = thresh(f, gAmt, soft * 0.7);
    return L * (1.0 - leafStamps(uv, F, f, thr) * (1.0 - 0.6 * soft));
  } else if (uShape == 11){                  // soft mottling
    float f = orgField(uv, F, (83u + gSO));
    return gRaw ? f : clamp(0.5 + (f - (1.0 - gAmt)) * (1.2 + 3.0 * (1.0 - soft)), 0.0, 1.0);
  } else if (uShape == 12){                  // dappled holes in a dark canopy
    int G = F * 2;
    // warp the cells so the holes come out irregular, not round
    vec2 wv = vec2(fbmA(uv, ivec2(G, 0), ivec2(0, G), 3, (89u + gSO)), fbmA(uv, ivec2(G, 0), ivec2(0, G), 3, (90u + gSO)));
    vec2 g = (uv + (0.2 + 0.5 * uWarp) * wv / float(G)) * float(G); vec2 gi = floor(g); float best = 0.0;
    float cl = orgField(uv, max(F / 2, 1), (84u + gSO));
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      ivec2 c = ivec2(gi) + ivec2(i, j); ivec2 cw = ivec2(wrap1(c.x, G), wrap1(c.y, G));
      vec2 ctr = vec2(c) + vec2(rnd(ivec3(cw, 21), uSeed + gSO), rnd(ivec3(cw, 22), uSeed + gSO));
      ctr += uMotion * 0.06 * vec2(sin(TAU * qf(0.06) * uT + float(cw.x) * 1.3), cos(TAU * qf(0.09) * uT + float(cw.y) * 2.1));
      float r = (0.15 + 0.5 * gAmt) * (0.4 + 0.9 * rnd(ivec3(cw, 23), uSeed + gSO)) * (0.5 + cl);
      float wob = 1.0 + (0.2 + uWarp * 0.5) * fbmA(uv, ivec2(G * 3, 0), ivec2(0, G * 3), 3, (85u + gSO));
      float d = length(g - ctr) * wob;
      best = max(best, 1.0 - smoothstep(r * (1.0 - soft * 0.9), r + 0.02 + 0.3 * soft, d));
    }
    return best;
  } else {                                   // branchy: twigs and leaf clusters
    ivec2 A, B; lattice(F, A, B);
    float n = fbmA(uv + uWarp * 0.03 * vec2(fbmA(uv, ivec2(F, 0), ivec2(0, F), 2, (86u + gSO))), A, B, 4, (87u + gSO));
    float br = smoothstep(0.86 - 0.1 * uBrk, 0.97, 1.0 - abs(n * 2.2));
    float f = orgField(uv, F * 2, (88u + gSO));
    float leaves = 1.0 - thresh(f, gAmt, soft);
    return (1.0 - max(br * (1.0 - soft * 0.6), leaves * 0.95));
  }
}

/* ---- soft noise patterns for adding interest to a key light ---- */
// billow noise: summed absolute noise, which makes rounded puffs between soft creases
float fbmAbs(vec2 uv, ivec2 A, ivec2 B, int oct, uint s){
  float v = 0.0, a = 0.5, n = 0.0;
  for (int o = 0; o < 6; o++){
    if (o >= oct) break;
    int m = 1 << o;
    vec2 q = vec2(dot(uv, vec2(A)), dot(uv, vec2(B))) * float(m);
    v += a * abs(pnA(q, ivec2(A.x, B.x) * m, ivec2(A.y, B.y) * m, s + uint(o) * 31u)); n += a; a *= gGain;
  }
  return v / n;
}
vec2 warpBy(vec2 uv, int F, float k, uint s){
  if (k <= 0.0) return uv;
  int Fw = max(F, 1);
  float z0 = gZ; int p0 = gPz; if (uFlow > 0.0) useZ(uFlowZ, uPzF);
  float g0 = gGain; gGain = 0.5;
  vec2 w = vec2(fbmA(uv, ivec2(Fw, 0), ivec2(0, Fw), 3, s), fbmA(uv, ivec2(Fw, 0), ivec2(0, Fw), 3, s + 1u));
  gGain = g0; useZ(z0, p0);
  return uv + k * w / float(Fw);
}
float washOut(float n){ return clamp(0.5 + (n - 0.5) * (0.8 + 2.5 * (1.0 - uSoft)) + (gAmt - 0.5), 0.0, 1.0); }
float softNoise(vec2 uv, int F){
  int oct = 1 + int(uBrk * 5.0 + 0.5);
  ivec2 A, B; lattice(F, A, B);
  if (uShape == 15){                       // soft clouds
    vec2 u2 = warpBy(uv, F, uWarp * 0.35, 401u);
    float n = 0.5 + 0.5 * fbmA(u2, A, B, oct, 403u) / 0.6;
    float c = fbmA(uv, ivec2(max(F / 3, 1), 0), ivec2(0, max(F / 3, 1)), 2, 404u);
    n = 0.5 + (n - 0.5 + uClump * 0.45 * c) / (1.0 + 0.45 * uClump);
    return gRaw ? n : thresh(n, gAmt, uSoft);
  }
  if (uShape == 16){                       // billows: puffs of light between soft dark creases
    vec2 u2 = warpBy(uv, F, uWarp * 0.3, 411u);
    float b = clamp(fbmAbs(u2, A, B, oct, 413u) * 2.4, 0.0, 1.0);
    return gRaw ? b : thresh(b, gAmt, uSoft);
  }
  if (uShape == 17){                       // soft pools of light that swell and fade, each on its own time
    vec2 u2 = warpBy(uv, F, uWarp * 0.25, 421u);
    vec2 g = u2 * float(F), gi = floor(g); float acc = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      ivec2 c = ivec2(gi) + ivec2(i, j); ivec2 cw = ivec2(wrap1(c.x, F), wrap1(c.y, F));
      float h1 = rnd(ivec3(cw, 31), uSeed), h2 = rnd(ivec3(cw, 32), uSeed), h3 = rnd(ivec3(cw, 33), uSeed), h4 = rnd(ivec3(cw, 34), uSeed);
      vec2 ctr = vec2(c) + vec2(h1, h2);
      ctr += uMotion * 0.35 * vec2(sin(TAU * qf(0.03 + 0.02 * h3) * uT + h1 * TAU) + 0.4 * sin(TAU * qf(0.071 + 0.03 * h2) * uT + h4 * TAU), cos(TAU * qf(0.025 + 0.02 * h4) * uT + h2 * TAU) + 0.4 * cos(TAU * qf(0.063 + 0.03 * h1) * uT + h3 * TAU));
      float fade = 1.0;
      float r = (0.25 + 0.5 * gAmt) * (1.0 - 0.6 * uWVar * h3);
      float d = length(g - ctr) / max(r, 0.02);
      float e = exp(-d * d * (1.2 + 6.0 * (1.0 - uSoft) * (1.0 - uSoft)));
      acc = 1.0 - (1.0 - acc) * (1.0 - e * fade * (1.0 - 0.7 * uWVar * h4));
    }
    return clamp(acc * (1.0 + 0.3 * (1.0 - uSoft)), 0.0, 1.0);
  }
  if (uShape == 18){                       // marbled: soft bands that the warp curls into flowing swirls
    vec2 u2 = warpBy(uv, max(F / 2, 1), uWarp * 0.7, 433u);
    float ph = uDir == 0 ? u2.x : uDir == 2 ? u2.y : uDir == 1 ? u2.x - u2.y : u2.x + u2.y;
    float t = TAU * float(F) * ph + uWarp * 12.0 * fbmA(u2, ivec2(max(F / 2, 1), 0), ivec2(0, max(F / 2, 1)), oct, 431u);
    return gRaw ? 0.5 + 0.5 * sin(t) : thresh(0.5 + 0.5 * sin(t), gAmt, uSoft);
  }
  // uneven wash: broad, gentle unevenness rather than shapes
  vec2 u2 = warpBy(uv, F, uWarp * 0.3, 441u);
  float n = 0.5 + 0.5 * fbmA(u2, A, B, max(oct - 2, 1), 443u) / 0.55;
  return gRaw ? n : washOut(n);
}

// sway of one layer of the pattern: it moves almost rigidly (a slowly varying offset, so nothing smears),
// back and forth along the wind, harder as a gust front passes; each layer keeps its own timing
vec2 swayOf(vec2 uv, float L){
  vec2 dir = vec2(cos(uWindA), sin(uWindA)), perp = vec2(-dir.y, dir.x);
  float front = 0.5 + 0.5 * sin(TAU * (qf(0.05) * uT - dot(uv, vec2(uWindI))) - L * 0.8);
  float env = 1.0 + uGust * (1.2 * front * front - 0.6);
  float z0 = gZ; int p0 = gPz; useZ(3.7 + L * 2.3, 1000);
  float a = fbmA(uv, ivec2(1, 0), ivec2(0, 1), 2, 301u + uint(L) * 7u);
  useZ(z0, p0);
  float hz = uSwayHz * (1.0 + 0.27 * L), ph = L * 2.1 + a * 1.2;
  float amp = uSway * env * (1.0 - 0.25 * L);
  return amp * (dir * (sin(TAU * qf(hz) * uT + ph) + 0.35 * sin(TAU * qf(hz * 1.73) * uT + ph * 1.9)) + perp * 0.3 * sin(TAU * qf(hz * 1.31) * uT + ph * 0.7));
}
/* Organic motion, all of it periodic over the tile so seamless shapes stay seamless: drift carries the whole
   pattern along the wind, flow carries it around on slowly turning currents. Sway is applied per layer (main). */
vec2 motionUV(vec2 uv){
  vec2 p = uv - uDriftOff;
  if (uFlow > 0.0){
    float z0 = gZ; int p0 = gPz;
    useZ(uFlowZ, uPzF);
    p += uFlow * 0.05 * vec2(fbmA(uv, ivec2(2, 0), ivec2(0, 2), 3, 311u), fbmA(uv, ivec2(2, 0), ivec2(0, 2), 3, 312u));
    useZ(z0, p0);
  }
  return p;
}
float breathAt(vec2 uv){
  if (uBreath <= 0.0) return 0.0;
  float z0 = gZ; int p0 = gPz; useZ(1.3, 1000);
  float ph = fbmA(uv, ivec2(1, 0), ivec2(0, 1), 2, 321u);
  useZ(z0, p0);
  float f = qf(1.0 / uBreathT);
  return uBreath * 0.16 * (0.65 * sin(TAU * f * uT + ph * 6.0) + 0.35 * sin(TAU * qf(f * 0.618) * uT + 1.7));
}

void shapeMain(){
  vec2 uv0 = gl_FragCoord.xy / uRes;
  float v = 0.0;
  int F = max(1, int(uScale + 0.5));
  bool moving = uShape >= 3 && uShape != 8;
  useZ(uMorphZ, uPzM);
  vec2 uv = moving ? motionUV(uv0) : uv0;
  gOv = uv;
  float br = moving ? breathAt(uv0) : 0.0;
  gAmt = clamp(uAmount + br, 0.02, 0.98);
  if ((uShape >= 15 && uShape <= 19) || ((uShape == 9 || uShape == 11) && uSway <= 0.0)){
    gGain = uRough;
    if (uBlend > 0.0 && uShape != 17){
      /* Morph: the pattern is blended, before it is shaped, through a chain of versions of itself shifted by
         random offsets. Blending the underlying field (not the light) lets shapes stretch, merge and split
         into the next version instead of cross-fading, and B-spline weights keep the motion going without
         ever pausing at a version. The blend is renormalised so contrast and brightness stay steady. */
      float tt = uT / uBlendT, k = floor(tt), f = tt - k;
      float w0 = 0.5 * (1.0 - f) * (1.0 - f), w2 = 0.5 * f * f, w1 = 1.0 - w0 - w2;
      float n = 0.0;
      gRaw = true;
      for (int i = 0; i < 3; i++){
        float ki = k + float(i) - 1.0; if (uBlendN > 0) ki = mod(ki, float(uBlendN));
        vec2 o = uBlendOff * (vec2(fract(sin(ki * 12.9898 + 4.1) * 43758.5453), fract(sin(ki * 78.233 + 1.7) * 43758.5453)) - 0.5) * 3.0 / float(F);
        float fi = uShape >= 15 ? softNoise(uv + o, F) : organic(uv + o, F);
        n += (i == 0 ? w0 : i == 1 ? w1 : w2) * (fi - 0.5);
      }
      gRaw = false;
      n = 0.5 + n / sqrt(w0 * w0 + w1 * w1 + w2 * w2);
      v = uShape == 11 ? clamp(0.5 + (n - (1.0 - gAmt)) * (1.2 + 3.0 * (1.0 - uSoft)), 0.0, 1.0) : uShape == 19 ? washOut(n) : thresh(n, gAmt, uSoft);
    } else v = uShape >= 15 ? softNoise(uv, F) : organic(uv, F);
    fragColor = vec4(vec3(mix(uDark, 1.0, v)), 1.0); return;
  }
  if (uShape >= 9 && uShape <= 13){
    gFlut = uFlutter > 0.0;
    if (uSway <= 0.0 || uShape == 12){
      if (uShape == 12) uv += swayOf(uv0, 0.0) * 0.6; gGain = uRough; fragColor = vec4(vec3(mix(uDark, 1.0, organic(uv, F))), 1.0); return; }
    // a canopy is layers of foliage, each swaying on its own; light gets through where all of them leave a gap
    // each layer lets through enough that all three together pass about the same light as one would:
    // coverage of a thresholded field ~ logistic((amount - 0.5) / sigma), and the layers' coverages multiply
    float c = 1.0 / (1.0 + exp(-1.702 * (gAmt - 0.5) / uLSig)), c1 = pow(c, 1.0 / 3.0);
    float a1 = clamp(0.5 + uLSig * log(c1 / max(1.0 - c1, 1e-4)) / 1.702, 0.02, 0.98), acc = 1.0;
    for (int L = 0; L < 3; L++){
      gSO = uint(L) * 101u; gAmt = a1;
      acc *= organic(uv + swayOf(uv0, float(L)), F);
    }
    fragColor = vec4(vec3(acc), 1.0); return;
  }
  // everything else sways as one piece, like a flag or a board on a stand
  if (moving && uSway > 0.0) uv += swayOf(uv0, 0.0) * 0.6;
  if (uShape == 0) v = shafts(uv, false);
  else if (uShape == 1) v = shafts(uv, true);
  else if (uShape == 2) v = beams(uv);
  else if (uShape == 3){
    // ridged noise stretched along a direction: ragged, crackly streaks
    ivec2 A, B;
    if (uDir == 0){ A = ivec2(F * 8, 0); B = ivec2(0, F); }
    else if (uDir == 2){ A = ivec2(F, 0); B = ivec2(0, F * 8); }
    else if (uDir == 1){ A = ivec2(F * 5, -F * 5); B = ivec2(F, F); }
    else { A = ivec2(F * 5, F * 5); B = ivec2(-F, F); }
    vec2 w = vec2(fbmA(uv, ivec2(F * 2, 0), ivec2(0, F * 2), 3, 41u), fbmA(uv, ivec2(F * 2, 0), ivec2(0, F * 2), 3, 42u));
    float n = fbmA(uv + 0.04 * uBrk * w / float(F), A, B, 5, 43u);
    float rid = 1.0 - abs(n * 2.0);
    v = thresh(pow(clamp(rid, 0.0, 1.0), 2.0 + 4.0 * uBrk), gAmt * 0.6, uSoft) * (0.6 + 0.4 * rid);
  } else if (uShape == 4){
    float n = 0.5 + 0.5 * fbmA(uv, ivec2(F, 0), ivec2(0, F), 2 + int(uBrk * 4.0), 51u) / 0.7;
    v = thresh(n, gAmt, uSoft);
  } else if (uShape == 5){
    // a plywood cookie: smooth sawn holes, edges a little ragged
    float n = 0.5 + 0.5 * fbmA(uv, ivec2(F, 0), ivec2(0, F), 2, 61u) / 0.7;
    n += 0.04 * uBrk * fbmA(uv, ivec2(F * 8, 0), ivec2(0, F * 8), 2, 62u);
    v = thresh(n, gAmt, uSoft * 0.5);
  } else if (uShape == 6){
    // light bounced off moving water onto a wall: thin bright wavering bands
    vec2 w = vec2(fbmA(uv, ivec2(F, 0), ivec2(0, F * 2), 3, 71u), 0.0);
    float n = fbmA(uv + vec2(0.0, 0.06 * w.x / float(F)), ivec2(F, 0), ivec2(0, F * 7), 4, 72u);
    float rid = 1.0 - abs(n * 2.2);
    v = pow(clamp(rid, 0.0, 1.0), 2.0 + 10.0 * uBrk) * (0.4 + 1.2 * thresh(0.5 + 0.5 * fbmA(uv, ivec2(F, 0), ivec2(0, F), 2, 73u), gAmt, 0.8));
    v = mix(v, smoothstep(0.0, 0.6, v), 1.0 - uSoft);
  } else if (uShape == 7){
    vec2 g = uv * float(F); vec2 gi = floor(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      ivec2 c = ivec2(gi) + ivec2(i, j); ivec2 cw = ivec2(wrap1(c.x, F), wrap1(c.y, F));
      vec2 ctr = vec2(c) + vec2(rnd(ivec3(cw, 1), uSeed), rnd(ivec3(cw, 2), uSeed));
      ctr += uMotion * 0.15 * vec2(sin(TAU * qf(0.05) * uT + float(cw.x)), cos(TAU * qf(0.07) * uT + float(cw.y)));
      float rad = 0.5 * gAmt * (1.0 - uWVar * rnd(ivec3(cw, 3), uSeed));
      float d = length(g - ctr);
      v = max(v, (1.0 - smoothstep(rad * (1.0 - uSoft), rad * (1.0 + uSoft) + 0.02, d)) * (0.6 + 0.4 * rnd(ivec3(cw, 4), uSeed)));
    }
  } else if (uShape == 8){
    // art deco fanlight: a half disc of radial lites
    vec2 p = (uv - vec2(0.5, 0.18)) / 0.42;
    float r = length(p), th = atan(p.y, p.x);
    float seg = PI / float(uCount);
    float k = floor(th / seg + 0.5);
    float bar = (k > 0.0 && k < float(uCount)) ? r * abs(sin(th - k * seg)) : 1e3;
    float bw = uWidth * 0.12, sf = 0.004 + 0.06 * uSoft;
    float inside = (1.0 - smoothstep(1.0 - sf, 1.0 + sf, r)) * smoothstep(-sf, sf, p.y);
    float hub = smoothstep(0.22 - sf, 0.22 + sf, r) * (1.0 - smoothstep(0.26 - sf, 0.26 + sf, r));
    float arc = smoothstep(0.62 - sf, 0.62 + sf, r) * (1.0 - smoothstep(0.62 + bw * 0.6 - sf, 0.62 + bw * 0.6 + sf, r));
    v = inside * smoothstep(bw * 0.5 - sf, bw * 0.5 + sf, bar) * (1.0 - hub) * (1.0 - arc) * smoothstep(bw * 0.4, bw * 0.4 + 2.0 * sf, p.y * 0.42);
  } else if (uShape == 14){
    v = texture(uPaint, uv).r;
    // painted shapes breathe by spreading and pulling in at their soft edges
    if (uBreath > 0.0) v = clamp(mix(v, textureLod(uPaint, uv, 3.5).r, 0.5 * uBreath) + br * 1.6, 0.0, 1.0);
  } else {
    v = organic(uv, F);
  }
  if (uShape == 7) v = mix(uDark, 1.0, v);
  fragColor = vec4(vec3(v), 1.0);
}
// the painting rides on the pattern: it is looked up where the drifting, flowing pattern has carried that spot
void main(){
  shapeMain();
  if (uOvlOn == 1) fragColor.rgb = ovlMod(fragColor.rgb, texture(uOvl, gOv).r * 2.0 - 1.0);
}`;
/* Light pool: only the middle of the frame lets light through. Shadows thicken toward the
   edge, which is itself organic rather than a clean circle, and the frame ends in black. */
const FS_POOL = COMMON + `
uniform sampler2D uSrc; uniform float uSize, uSoft; uniform uint uSeed;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 q = (uv - 0.5) / (0.5 * uSize);
  float n = fbm2(uv, 3, 4, uSeed) * 0.5;
  float r = length(q) * (1.0 + 0.35 * uSoft * n);
  float m = 1.0 - smoothstep(1.0 - uSoft, 1.0, r);
  vec3 c = texture(uSrc, uv).rgb;
  c = pow(max(c, 0.0), vec3(1.0 + 1.6 * smoothstep(0.3, 1.0, r)));
  fragColor = vec4(c * m, 1.0);
}`;
PR.shape = program(VS_FULL, FS_SHAPE, 'shapes');
PR.pool = program(VS_FULL, FS_POOL, 'light pool');
const FS_FADE = COMMON + `
uniform sampler2D uSrc; uniform float uF;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 e = smoothstep(vec2(0.0), vec2(uF), uv) * smoothstep(vec2(0.0), vec2(uF), 1.0 - uv);
  fragColor = vec4(texture(uSrc, uv).rgb * e.x * e.y, 1.0);
}`;
PR.fade = program(VS_FULL, FS_FADE, 'edge fade');
function fadePass(src, f) {
  const out = tgt('fadeOut', src.w, src.h, 'f16');
  pass(PR.fade, out, p => { tex(p, 'uSrc', src.tex, 0); f1(p, 'uF', f); });
  return out;
}
function renderShapes(P, res, t, tl) {
  const out = renderShapesRaw(P, res, t, tl, 'shOut');
  return shapePost(P, res, tl, out);
}
// the shapes that move with the organic motion controls (shafts, beams and the fan keep their own shimmer)
const SHAPE_ORGMOTION = sh => sh >= 3 && sh !== 8;
function shapeMotion(P, t, tl) {
  const sp = P.mSpeed ?? 1, loop = tl.loop, Lm = tl.len * sp, tm = t * sp;
  const ts = Math.max(P.tileSize || 3, 0.1);
  const th = (P.windDir ?? 0) * DEG, dir = [Math.cos(th), Math.sin(th)];
  // drift: m/s along the wind, varied by gusts (the offset is the integral of the gusting speed)
  let v = (P.drift ?? 0) / ts, off;
  if (loop) { v = Math.round(v * Lm) / Lm; off = v * tm; }
  else {
    const g = P.gust ?? 0, w1 = 2 * Math.PI * 0.05, w2 = 2 * Math.PI * 0.13;
    off = v * (tm + g * (0.5 * Math.sin(w1 * tm) / w1 + 0.3 * Math.sin(w2 * tm + 1.3) / w2));
  }
  // morph and flow move through the noise's time axis; looping counts whole cycles of it
  const zAxis = rate => loop ? (() => { const n = Math.max(1, Math.round(rate * Lm)); return {z:tm / Lm * n, P:n}; })() : {z:tm * rate, P:1000};
  const morph = zAxis(0.25 * (P.morph ?? 0)), flow = zAxis(0.1 * Math.max(P.flow ?? 0, 0.01));
  return {tm, Lm:loop ? Lm : 0, off:[(dir[0] * off) % 1, (dir[1] * off) % 1], th, dir, morph, flow, ts};
}
function renderShapesRaw(P, res, t, tl, name = 'shRaw') {
  const out = tgt(name, res, res, 'f16', true);
  const tt = tl.loop ? ((t % tl.len) + tl.len) % tl.len : t;
  const sh = P.shape | 0, org = SHAPE_ORGMOTION(sh), M = shapeMotion(P, tt, tl);
  pass(PR.shape, out, p => {
    i1(p, 'uShape', sh); i1(p, 'uCount', P.count | 0); i1(p, 'uDir', P.dir | 0); u1(p, 'uSeed', P.seed | 0);
    f1(p, 'uSpread', P.spread); f1(p, 'uAngle', P.angle); f1(p, 'uWidth', P.width); f1(p, 'uWVar', P.wVar); f1(p, 'uSoft', P.soft);
    f1(p, 'uFall', P.fall); f1(p, 'uBrk', P.brk); f1(p, 'uScale', P.scale); f1(p, 'uAmount', P.amount);
    // shafts and beams keep their simple shimmer; everything else runs on the organic motion clock
    f1(p, 'uMotion', org ? (P.morph ?? 0) : P.motion);
    f1(p, 'uT', org ? M.tm : tt); f1(p, 'uLoopT', org ? M.Lm : (tl.loop ? tl.len : 0));
    f2(p, 'uApex', P.apexX, P.apexY); f1(p, 'uAim', Math.atan2(-P.apexX, 0.5 + P.apexY));
    i1(p, 'uPz', tl.loop ? Math.max(1, Math.round(P.motion * tl.len / 3)) : 1000);
    i1(p, 'uStretch', Math.round(P.stretch || 1)); f1(p, 'uWarp', P.warp ?? 0.5); f1(p, 'uClump', P.clump ?? 0.4);
    // morph timing: in a loop, a whole number of morphs per loop, cycling through that many versions
    { const bt = Math.max(P.blendT ?? 8, 0.2); let BT = bt, BN = 0; if (tl.loop) { BN = Math.max(1, Math.round(M.Lm / bt)); BT = M.Lm / BN; }
      f1(p, 'uBlend', org ? (P.blend ?? 0) : 0); f1(p, 'uBlendT', BT); i1(p, 'uBlendN', BN); f1(p, 'uBlendOff', P.blend ?? 0); }
    f1(p, 'uRough', P.rough ?? 0.5); f1(p, 'uDark', P.darkest ?? 0); f1(p, 'uShimSpd', P.shimSpd ?? 1);
    f2(p, 'uDriftOff', ...(org ? M.off : [0, 0])); f1(p, 'uMorphZ', M.morph.z); i1(p, 'uPzM', M.morph.P); f1(p, 'uFlowZ', M.flow.z); i1(p, 'uPzF', M.flow.P);
    // sway amplitude is a real distance where the light lands (up to about 10 cm), so it reads the same at any tile size
    f1(p, 'uSway', org ? (P.sway ?? 0) * 0.10 / M.ts : 0);
    // flutter rocks the fine detail through the noise's time axis (about a third of a feature at full strength)
    f1(p, 'uFlutter', org && sh >= 9 && sh <= 13 ? (P.flutter ?? 0) * 0.35 : 0); f1(p, 'uFlutHz', (P.swayHz ?? 0.4) * 3.2); f1(p, 'uLSig', P.lsig ?? ({9:0.1, 10:0.12, 11:0.14, 13:0.24}[sh] || 0.12));
    f1(p, 'uSwayHz', P.swayHz ?? 0.4); f1(p, 'uWindA', M.th); gl.uniform2i(p.u('uWindI'), Math.round(M.dir[0]), Math.round(M.dir[1]));
    f1(p, 'uFlow', org ? (P.flow ?? 0) : 0); f1(p, 'uBreath', 0); f1(p, 'uBreathT', Math.max(P.breathT ?? 8, 0.5)); f1(p, 'uGust', P.gust ?? 0);
    tex(p, 'uPaint', paintTex(), 1);
    const ov = name === 'shOut' && ovlOn() && ovlTarget('shapes').used; i1(p, 'uOvlOn', ov ? 1 : 0); if (ov) tex(p, 'uOvl', ovlTex(ovlTarget('shapes')), 2);
  });
  return out;
}
function shapePost(P, res, tl, out) {
  // defocus blur, as when the gobo sits further from focus: a disk kernel that wraps with the tile
  if (P.blur > 0) {
    gl.bindTexture(gl.TEXTURE_2D, out.tex); gl.generateMipmap(gl.TEXTURE_2D);
    const r = P.blur / 100, Q = QUAL[S.quality];
    const o2 = tgt('shBlur', res, res, 'f16');
    pass(PR.disk, o2, p => {
      tex(p, 'uSrc', out.tex, 0); f1(p, 'uRad', r); f1(p, 'uRad2', r); f1(p, 'uMix', 0); f1(p, 'uGain', 1); f1(p, 'uLimb', 0);
      f1(p, 'uRadK', 0); f1(p, 'uSrcRes', res); i1(p, 'uClampY', 0); i1(p, 'uTaps', Q.taps); f1(p, 'uLod', lodFor(r, res, Q.taps, 1)); f1(p, 'uLod2', 0);
    });
    return finishShape(P, tl, o2);
  }
  return finishShape(P, tl, out);
}
function finishShape(P, tl, out) {
  const sh = P.shape | 0;
  info = `${SHAPES[sh]} · ${SHAPE_SEAMLESS[sh] && !(P.framing | 0) ? 'seamless tile' : 'single frame'} · ${P.tileSize.toFixed(1)} m across where it lands` +
         (SHAPE_ORGMOTION(sh) ? motionInfo(P) : P.motion > 0 && tl.loop ? `\nEvery motion completes whole cycles in ${fmtLen(tl.len)}` : '');
  return out;
}
function motionInfo(P) {
  const bits = [];
  if (P.drift > 0) bits.push(`drifting ${P.drift.toFixed(2)} m/s`);
  if (P.sway > 0) bits.push(`swaying ±${(P.sway * 10).toFixed(0)} cm at ${(P.swayHz ?? 0.4).toFixed(2)} Hz`);
  if (P.flutter > 0 && (P.shape | 0) >= 9 && (P.shape | 0) <= 13) bits.push('leaves fluttering');
  if (P.flow > 0) bits.push('flowing');
  if (P.morph > 0) bits.push(`evolving over about ${(4 / P.morph / (P.mSpeed ?? 1)).toFixed(0)} s`);
  if (P.blend > 0) bits.push(`morphing to a new version every ${((P.blendT ?? 8) / (P.mSpeed ?? 1)).toFixed(1)} s`);
  return bits.length ? '\nMotion: ' + bits.join(', ') + (P.gust > 0 && (P.drift > 0 || P.sway > 0) ? ', in gusts' : '') : '\nStill';
}
function usesPool() {
  const k = MODES[S.mode].kind, P = S.p[S.mode];
  return (k === 'trees' && (P.framing | 0) === 2) || (k === 'shapes' && (P.framing | 0) === 1);
}
function poolPass(src) {
  const P = S.p[S.mode], out = tgt('poolOut', src.w, src.h, 'f16');
  pass(PR.pool, out, p => { tex(p, 'uSrc', src.tex, 0); f1(p, 'uSize', P.poolSize ?? 0.9); f1(p, 'uSoft', P.poolSoft ?? 0.5); u1(p, 'uSeed', (P.seed | 0) + 3); });
  return out;
}
