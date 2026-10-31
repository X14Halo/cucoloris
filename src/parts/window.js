/* =====================================================================
   WINDOWS
   Sunlight through a window, built from physical layers at their real
   depths: the wall reveal (outer and inner faces), the frame and sashes
   (with their own depth), the glass (Fresnel loss, waviness caustics,
   dirt, rain, condensation), blinds or shutters inside the reveal and
   curtains in the room. Each layer is drawn in the window plane, then
   every gobo pixel is traced back toward the sun through all of them for
   many points across the sun disk, so each layer's shadow softens by its
   own distance to the lit surface. The output is in light space.
   ===================================================================== */
const WIN = {cover:3};
const WIN_GLSL = `
uniform vec2 uWin; uniform float uFW, uBW, uBorder, uOpen, uPx; uniform int uStyle, uCols, uRows, uCols2, uRows2;
uniform vec3 uSunW; uniform uint uSeed;
float aa(float d){ return clamp(d / uPx + 0.5, 0.0, 1.0); }
float rdist(vec2 p, vec2 lo, vec2 hi){ vec2 a = min(p - lo, hi - p); return min(a.x, a.y); }
float h2(vec2 c, uint s){ return rnd(ivec3(ivec2(c), 7), uSeed * 131u + s); }
// quintic fade keeps the second derivative continuous, so caustics show no lattice
float vn(vec2 p, uint s){ vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h2(i, s), h2(i + vec2(1, 0), s), u.x), mix(h2(i + vec2(0, 1), s), h2(i + vec2(1, 1), s), u.x), u.y); }
float fbm(vec2 p, int o, uint s){ float v = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 6; i++){ if (i >= o) break; v += a * vn(p, s + uint(i) * 17u); n += a; p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return v / n; }
// the window opening in the wall (signed distance, positive inside)
float sdOpen(vec2 p){
  float W = uWin.x * 0.5, H = uWin.y * 0.5;
  if (uStyle == 8) return min(W, H) - length(p);
  if (uStyle == 7){
    vec2 c = vec2(0.0, H - W);
    if (p.y > c.y) return min(W - length(p - c), p.y + H);
    return min(min(p.x + W, W - p.x), p.y + H);
  }
  return min(min(p.x + W, W - p.x), min(p.y + H, H - p.y));
}
struct Pane { float m; float g; float id; float edge; float v; vec2 e2; };
// distance to the nearest interior glazing bar of an n-way division
float barD(float u, int n, float cell){ if (n < 2) return 1e3; float k = clamp(floor(u + 0.5), 1.0, float(n - 1)); return abs(u - k) * cell; }
// a sash: stiles and top rail sw, bottom rail rb, glass split into cols × rows lites
void sash(vec2 p, vec2 lo, vec2 hi, float sw, float rb, int cols, int rows, float pid, inout Pane P){
  float inS = aa(rdist(p, lo, hi));
  if (inS <= 0.0) return;
  vec2 glo = lo + vec2(sw, rb), ghi = hi - vec2(sw, sw);
  float dG = rdist(p, glo, ghi);
  vec2 cell = (ghi - glo) / vec2(float(cols), float(rows));
  vec2 u = (p - glo) / cell;
  float db = min(barD(u.x, cols, cell.x), barD(u.y, rows, cell.y)) - uBW * 0.5;
  float gl = aa(dG) * aa(db);
  P.m *= 1.0 - inS * (1.0 - gl);
  if (gl > 0.0){
    vec2 ci = clamp(floor(u), vec2(0.0), vec2(float(cols - 1), float(rows - 1)));
    P.g += gl; P.id = pid * 97.0 + ci.x + ci.y * 13.0;
    P.edge = min(P.edge, min(max(dG, 0.0), max(db, 0.0)));
    // distance to the pane's sides (x) and to its top and bottom (y), for dirt that collects in corners
    vec2 dR = min(p - glo, ghi - p);
    P.e2 = min(P.e2, max(vec2(min(dR.x, barD(u.x, cols, cell.x) - uBW * 0.5), min(dR.y, barD(u.y, rows, cell.y) - uBW * 0.5)), 0.0));
    P.v = clamp((p.y - (glo.y + ci.y * cell.y)) / cell.y, 0.0, 1.0);
  }
}
Pane frame(vec2 p){
  Pane P = Pane(1.0, 0.0, 0.0, 1e3, 0.5, vec2(1e3));
  float W = uWin.x * 0.5, H = uWin.y * 0.5, fw = uFW, sw = uFW * 0.8;
  float so = sdOpen(p);
  P.m = aa(so - fw);                                       // outer frame (head, jambs, sill)
  vec2 lo = vec2(-W + fw, -H + fw), hi = vec2(W - fw, H - fw);
  if (uStyle == 0) sash(p, lo, hi, 0.0, 0.0, uCols, uRows, 1.0, P);
  else if (uStyle == 1){
    float mid = 0.5 * (lo.y + hi.y), ov = sw * 0.5, d = uOpen * (hi.y - mid) * 0.92;
    sash(p, vec2(lo.x, mid - ov), hi, sw, sw * 0.7, uCols, uRows, 1.0, P);
    sash(p, vec2(lo.x, lo.y + d), vec2(hi.x, mid + ov + d), sw, sw * 1.7, uCols2, uRows2, 2.0, P);
  } else if (uStyle == 2){
    sash(p, lo, hi, sw, sw * 1.3, 1, 1, 1.0, P);
    vec2 glo = lo + vec2(sw, sw * 1.3), ghi = hi - vec2(sw);
    float b = uBorder;
    float dx = min(abs(p.x - (glo.x + b)), abs(p.x - (ghi.x - b))), dy = min(abs(p.y - (glo.y + b)), abs(p.y - (ghi.y - b)));
    float bar = aa(min(dx, dy) - uBW * 0.5) ;
    float inG = aa(rdist(p, glo, ghi));
    P.m *= 1.0 - inG * (1.0 - bar); P.g *= mix(1.0, bar, inG);
    P.edge = min(P.edge, max(min(dx, dy) - uBW * 0.5, 0.0));
    P.id = floor((p.x - glo.x) / b) + 7.0 * floor((p.y - glo.y) / b);
  } else if (uStyle == 3 || uStyle == 4){
    float kick = uStyle == 4 ? 0.22 * uWin.y : sw * 1.2, s2 = uStyle == 4 ? max(sw, 0.09) : sw;
    float mull = uStyle == 4 ? 0.0 : fw * 0.5;
    sash(p, lo, vec2(-mull, hi.y), s2, kick, uCols, uRows, 1.0, P);
    sash(p, vec2(mull, lo.y), hi, s2, kick, uCols, uRows, 2.0, P);
    P.m *= aa(abs(p.x) - mull);                                   // mullion or astragal between the leaves
  } else if (uStyle == 5){
    // steel sections; a 2 × 2 pivot vent near the middle can swing open about its horizontal axis
    vec2 cell = (hi - lo) / vec2(float(uCols), float(uRows));
    int vc = max(uCols / 2 - 1, 0), vr = max(uRows / 2 - 1, 0);
    vec2 vlo = lo + cell * vec2(float(vc), float(vr)), vhi = vlo + cell * vec2(float(min(2, uCols)), float(min(2, uRows)));
    Pane F = P; sash(p, lo, hi, 0.0, 0.0, uCols, uRows, 1.0, F);
    float inV = uOpen > 0.0 ? aa(rdist(p, vlo + uBW * 0.5, vhi - uBW * 0.5)) : 0.0;
    P.m = mix(F.m, P.m, inV); P.g = mix(F.g, 0.0, inV); P.id = F.id; P.edge = F.edge; P.v = F.v;
    if (uOpen > 0.0){
      float al = uOpen * 0.9, yc = 0.5 * (vlo.y + vhi.y);
      float k = cos(al) - sin(al) * uSunW.y / uSunW.z;
      if (k > 0.05){
        float yv = (p.y - yc) / k;
        vec2 q = vec2(p.x + yv * sin(al) * uSunW.x / uSunW.z, yc + yv);
        Pane V = Pane(1.0, 0.0, 0.0, 1e3, 0.5, vec2(1e3));
        sash(q, vlo + uBW * 0.25, vhi - uBW * 0.25, uBW * 0.9, uBW * 0.9, min(2, uCols), min(2, uRows), 3.0, V);
        P.m *= V.m; P.g += V.g; if (V.g > 0.0){ P.id = V.id; P.edge = min(P.edge, V.edge); P.v = V.v; }
      }
    }
  } else if (uStyle == 6){
    // lead came in a diamond lattice, with round iron saddle bars every ~40 cm
    sash(p, lo, hi, sw * 0.5, sw * 0.6, 1, 1, 1.0, P);
    vec2 glo = lo + vec2(sw * 0.5, sw * 0.6), ghi = hi - vec2(sw * 0.5);
    float dw = (ghi.x - glo.x) / float(uCols), dh = dw * (1.0 + 0.25 * float(uRows));
    vec2 q = (p - vec2(0.0, glo.y)) / vec2(dw, dh);
    float a1 = abs(fract(q.x + q.y + 0.5) - 0.5), a2 = abs(fract(q.x - q.y + 0.5) - 0.5);
    float sc = 1.0 / length(vec2(1.0 / dw, 1.0 / dh));
    float came = min(a1, a2) * sc - uBW * 0.5;
    float nb = max(1.0, floor((ghi.y - glo.y) / 0.4));
    float sb = abs(fract((p.y - glo.y) / (ghi.y - glo.y) * (nb + 1.0) + 0.5) - 0.5) * (ghi.y - glo.y) / (nb + 1.0);
    float inG = aa(rdist(p, glo, ghi));
    float ok = aa(came) * mix(1.0, aa(sb - 0.006), step(0.04, rdist(p, glo, ghi)));
    P.m *= 1.0 - inG * (1.0 - ok); P.g *= mix(1.0, ok, inG);
    P.edge = min(P.edge, max(came, 0.0));
    P.id = floor(q.x + q.y) * 31.0 + floor(q.x - q.y);
    P.v = fract(q.y);
  } else if (uStyle == 7){
    // arched head: lites below the spring line, a sunburst fanlight above it
    vec2 c = vec2(0.0, H - W); float R = W - fw - sw * 0.6;
    if (p.y < c.y) sash(p, lo, vec2(hi.x, c.y), sw, sw * 1.3, uCols, uRows, 1.0, P);
    else {
      vec2 d = p - c; float r = length(d), th = atan(d.y, d.x);
      int n = uCols + 1; float seg = PI / float(n), hubR = R * 0.32;
      float k = floor(th / seg + 0.5), dth = abs(th - k * seg);
      float ray = (k > 0.0 && k < float(n) && r > hubR) ? r * sin(dth) - uBW * 0.5 : 1e3;
      float hub = abs(r - hubR) - uBW * 0.5;
      float inG = aa(R - r), ok = aa(min(ray, hub));
      P.m *= inG * ok; P.g += inG * ok;
      P.edge = min(P.edge, max(min(min(ray, hub), R - r), 0.0));
      P.id = 50.0 + k + (r > hubR ? 10.0 : 0.0);
      P.v = clamp(r / R, 0.0, 1.0);
    }
  } else if (uStyle == 8){
    float R = min(W, H) - fw, r = length(p), th = atan(p.y, p.x);
    int n = max(uCols, 1) * 4; float seg = TAU / float(n);
    float dth = abs(th - floor(th / seg + 0.5) * seg);
    float ray = r * sin(dth) - uBW * 0.5;
    float ring = uRows > 0 ? abs(r - R * 0.45) - uBW * 0.5 : 1e3;
    if (uRows >= 2 && r < R * 0.45) ray = 1e3;
    float inG = aa(R - r), ok = aa(min(ray, ring));
    P.m *= inG * ok; P.g += inG * ok;
    P.edge = min(P.edge, max(min(min(ray, ring), R - r), 0.0));
    P.id = floor(th / seg) + (r > R * 0.45 ? 20.0 : 0.0);
    P.v = clamp(0.5 + p.y / (2.0 * R), 0.0, 1.0);
  } else {
    float d = uOpen * (hi.x - lo.x) * 0.46, mid = 0.5 * (lo.x + hi.x);
    sash(p, lo, vec2(mid + sw * 0.5, hi.y), sw, sw, uCols, uRows, 1.0, P);
    sash(p, vec2(mid - sw * 0.5 - d, lo.y), vec2(hi.x - d, hi.y), sw, sw, uCols, uRows, 2.0, P);
  }
  P.m *= aa(so);
  P.g = min(P.g, 2.0);
  P.e2 = min(P.e2, vec2(P.edge));
  return P;
}
`;
/* Pass 1: the layers drawn in the window plane. Out 0: frame mask, glass,
   blinds, curtains (direct transmission). Out 1: glass coverage, light
   turned diffuse (for the soft glow it throws). */
const FS_WINL = HEAD + `
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
uniform vec2 uRes;
` + COMMON.split('uniform vec2 uRes;')[1] + WIN_GLSL + `
uniform float uDm, uDist, uTp, uDistort, uGrime, uSmudge, uSpots, uRain, uFog, uScreenT, uT, uLoopT;
uniform float uRainSz, uRainDens, uRainRun, uRainLens, uRainSpd;
uniform int uGlass, uScreen, uBlind, uCurt;
uniform float uTilt, uLower, uImperf, uCOpen, uFull, uBreeze;
uniform vec3 uBF;
// glass relief (m) for the caustic calculation
float relief(vec2 p, float id){
  vec2 o = vec2(id * 3.17, id * 1.71);
  if (uGlass == 1) return 1.4e-5 * uDistort * (fbm(vec2(p.x * 9.0, p.y * 38.0) + o, 4, 21u) - 0.5) + 0.25e-5 * uDistort * (fbm(vec2(p.x * 30.0, p.y * 90.0) + o, 2, 22u) - 0.5);
  if (uGlass == 0 || uGlass == 2 || uGlass == 6) return 1.5e-6 * uDistort * sin(p.y * 21.0 + 3.0 * fbm(p * 3.0, 2, 23u));
  return 0.0;
}
float dropField(vec2 p, float cs, float prob, float rmin, float rmax, uint s, out float ring){
  vec2 c = floor(p / cs); float best = 0.0; ring = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 cc = c + vec2(i, j);
    if (h2(cc, s) > prob) continue;
    vec2 ctr = (cc + vec2(h2(cc, s + 1u), h2(cc, s + 2u))) * cs;
    float r = mix(rmin, rmax, pow(h2(cc, s + 3u), 2.0));
    vec2 d = (p - ctr) / vec2(1.0, 1.15);
    float q = length(d) / r;
    if (q < 1.0){ best = max(best, 1.0 - q); ring = max(ring, smoothstep(0.55, 0.95, q) * (1.0 - smoothstep(0.95, 1.0, q))); }
  }
  return best;
}
float glassT(vec2 p, Pane P, out float scat){
  scat = 0.0;
  float T = pow(uTp, P.g);
  // caustics from thickness ripples: intensity = 1 / |det(I + L (n-1) Hessian)|
  if (uGlass <= 2 || uGlass == 6){
    float e = max(uPx, 0.0012), k = uDist * 0.52 / (e * e);
    float h0 = relief(p, P.id);
    float hxx = relief(p + vec2(e, 0), P.id) + relief(p - vec2(e, 0), P.id) - 2.0 * h0;
    float hyy = relief(p + vec2(0, e), P.id) + relief(p - vec2(0, e), P.id) - 2.0 * h0;
    float hxy = 0.25 * (relief(p + vec2(e, e), P.id) - relief(p + vec2(e, -e), P.id) - relief(p + vec2(-e, e), P.id) + relief(p - vec2(e, e), P.id));
    float a = 1.0 + k * hxx, b = k * hxy, d = 1.0 + k * hyy;
    float det = a * d - b * b, F = max(abs(k * hxx), abs(k * hyy));
    float over = smoothstep(1.5, 4.0, F);
    float I = clamp(1.0 / max(abs(det), 0.18), 0.0, 5.0);
    T *= mix(I, 0.0, over); scat += over * 0.9;
  }
  if (uGlass == 2){ float rg; float b = dropField(p, 0.007, 0.22 * uDistort + 0.08, 0.0003, 0.0012, 31u, rg); T *= 1.0 - 0.8 * step(0.001, b); }
  if (uGlass == 6){
    vec2 w = abs(fract(p / 0.0127 + 0.5) - 0.5) * 0.0127;
    T *= aa(min(w.x, w.y) - 0.00025);
  }
  // dust and grime: settles in corners and along the bottom of each pane
  if (uGrime > 0.0){
    float n1 = fbm(p * 7.0 + P.id, 4, 41u), n2 = fbm(p * 85.0, 3, 42u), n3 = fbm(vec2(p.x * 55.0, p.y * 2.5) + P.id, 3, 44u);
    float g = uGrime, w = 0.01 + 0.055 * g * (0.7 + 0.6 * n1);
    vec2 e2 = P.e2;
    float ex = exp(-e2.x / w), ey = exp(-e2.y / (w * (P.v < 0.5 ? 1.8 : 1.0)));
    float corner = ex * ey, bottom = smoothstep(0.35, 0.0, P.v) * ey;
    float a = g * (0.06 + 0.22 * smoothstep(0.3, 0.8, n1) + 0.1 * n2)          // film over the whole pane
            + g * (0.45 * max(ex, ey) + 1.3 * corner + 0.6 * bottom) * (0.45 + n2)   // packed into edges and corners
            + g * g * 0.25 * smoothstep(0.55, 0.85, n3);                           // streaks washed down by rain
    a = clamp(a, 0.0, 0.985); T *= 1.0 - a; scat += 0.25 * a;
  }
  // hand smears and circular wipe marks, mostly at reaching height
  if (uSmudge > 0.0){
    float cs = 0.32, a = 0.0; vec2 c = floor(p / cs);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 cc = c + vec2(i, j);
      vec2 ctr = (cc + vec2(h2(cc, 51u), h2(cc, 52u))) * cs;
      float r = 0.07 + 0.16 * h2(cc, 53u), dd = length(p - ctr);
      float ang = atan(p.y - ctr.y, p.x - ctr.x), a0 = h2(cc, 54u) * TAU;
      float arc = (1.0 - smoothstep(0.004, 0.012, abs(dd - r))) * smoothstep(0.2, 0.9, 0.5 + 0.5 * cos(ang - a0)) * step(h2(cc, 55u), 0.6);
      float blob = (1.0 - smoothstep(0.02, 0.055, length((p - ctr - vec2(0.05, -0.08)) / vec2(1.0, 1.5)))) * step(0.55, h2(cc, 56u));
      a += arc * (0.5 + 0.5 * fbm(p * 140.0, 2, 57u)) + blob * (0.4 + 0.6 * fbm(p * 220.0, 2, 58u));
    }
    a *= uSmudge * 0.2 * (0.4 + 0.6 * smoothstep(0.6, -0.2, p.y));
    T *= 1.0 - a; scat += 0.8 * a;
  }
  if (uSpots > 0.0){
    float rg, b = dropField(p, 0.011, 0.55 * uSpots, 0.0008, 0.003, 61u, rg);
    float a = 0.55 * rg + 0.08 * step(0.001, b); T *= 1.0 - a; scat += 0.5 * a;
  }
  if (uRain > 0.0 && P.g > 0.0){
    // Raindrops are tiny lenses: each throws a dark rim with a bright focused core.
    float top = uWin.y * 0.5 + 0.05, span = uWin.y + 0.1;
    float loopT = uLoopT > 0.0 ? uLoopT : 20.0;
    // running drops: they grow until they break loose, then run down, meandering and
    // leaving a wet trail of little beads behind them, sweeping the glass clean along their path
    float sp = 0.035 / (0.4 + uRain) / max(1.0, uRainRun), clear = 0.0, run = 1.0, runS = 0.0;
    float c0 = floor(p.x / sp);
    for (int j = -1; j <= 1; j++){
      float c = c0 + float(j);
      if (h2(vec2(c, 11), 91u) > clamp((0.35 + 0.55 * min(uRain, 1.0)) * min(uRainRun, 1.0), 0.0, 0.98)) continue;
      float n = floor((1.0 + 2.5 * h2(vec2(c, 12), 91u)) * uRainSpd + 0.5); if (n < 1.0) n = 1.0;   // drops per loop
      float ph = h2(vec2(c, 13), 91u);
      float cyc = uT * n / loopT + ph, kc = floor(cyc), u = cyc - kc;
      // A drop sits as a bead, growing, until it is heavy enough to break loose; then it runs down without
      // stopping, quickening and easing as it meets and picks up the water already on the glass.
      float wait = 0.2 + 0.35 * h2(vec2(c, 18.0 + kc), 91u);
      float yStart = top - span * (0.05 + 0.45 * h2(vec2(c, 19.0 + kc), 91u));
      float yD, grow = 1.0;
      if (u < wait) { yD = yStart; grow = 0.55 + 0.45 * u / wait; }
      else {
        float uu = (u - wait) / (1.0 - wait), k1 = 1.7 + 1.3 * h2(vec2(c, 20.0 + kc), 91u), q0 = h2(vec2(c, 21.0 + kc), 91u) * TAU;
        float sl = uu * uu * (0.35 + 0.65 * uu) * 0.6 + uu * 0.4;                              // breaks loose gently, then runs
        sl += 0.05 * (sin(TAU * k1 * uu + q0) - sin(q0)) / (TAU * k1 * 0.25) * uu;           // speed varies, never stops
        yD = yStart - sl * span * 1.25;
      }
      float fx = 0.006 * sin(p.y * 17.0 + c * 3.1) + 0.003 * sin(p.y * 43.0 + c * 1.7);
      float x0 = (c + 0.25 + 0.5 * h2(vec2(c, 15), 91u)) * sp;
      float dx = p.x - (x0 + fx);
      float rD = (0.0018 + 0.0018 * h2(vec2(c, 16), 91u) * (0.5 + uRain)) * uRainSz * grow;
      vec2 q = vec2(dx, (p.y - yD) * 0.7) / rD;
      float dd = length(q);
      if (dd < 1.0) { run *= 1.0 + uRainLens * (-0.75 + 1.3 * smoothstep(0.55, 0.0, dd) + 0.2 * smoothstep(0.55, 1.0, dd)); runS += 0.4 * uRainLens; }
      // trail behind it (above): a thin wet line that breaks into beads and slowly dries
      if (p.y > yD && p.y < yStart + rD){
        float age = (p.y - yD) / (span * n / loopT);
        float fade = exp(-age / 4.0);
        clear = max(clear, (1.0 - smoothstep(rD * 1.4, rD * 2.2, abs(dx))) * exp(-age / 12.0));
        // the beads it leaves stay put on the glass
        float bead = fract(p.y / 0.0055 + h2(vec2(c, 17), 91u));
        float bR = 0.0006 * uRainSz * step(0.45, h2(vec2(c, floor(p.y / 0.0055 + h2(vec2(c, 17), 91u)) + kc * 7.0), 92u));
        float bd = length(vec2(dx, (bead - 0.5) * 0.0055));
        float line = 1.0 - smoothstep(0.0003, 0.0007, abs(dx));
        float bb = 1.0 - smoothstep(bR * 0.6, bR, bd);
        run *= mix(1.0, 0.6 + 0.4 * (1.0 - line), fade * min(uRainLens, 1.5)) * mix(1.0, 0.35, clamp(bb * fade * uRainLens, 0.0, 1.0));
      }
    }
    // beaded drops from new impacts appear all the time and stay until a runner sweeps them away
    float cs = 0.006 * uRainSz / sqrt(max(uRainDens, 0.2)), best = 0.0; vec2 cc0 = floor(p / cs);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 cc = cc0 + vec2(i, j);
      if (h2(cc, 93u) > clamp(0.7 * uRain * min(uRainDens, 1.4), 0.0, 0.97)) continue;
      float born = h2(cc, 94u), life = 0.3 + 0.6 * h2(cc, 95u);
      float a = fract(uT / loopT - born);
      if (a > life) continue;
      vec2 ctr = (cc + vec2(h2(cc, 96u), h2(cc, 97u))) * cs;
      float r = (0.0004 + 0.0014 * pow(h2(cc, 98u), 2.0)) * (0.6 + min(uRain, 1.0)) * uRainSz;
      float q = length((p - ctr) / vec2(1.0, 1.1)) / r;
      if (q < 1.0) best = max(best, 1.0 - q);
    }
    float inB = step(0.001, best) * (1.0 - clear);
    T *= max(1.0 + (-0.7 + 1.1 * smoothstep(0.45, 1.0, best)) * inB * uRainLens, 0.0) * max(run, 0.0);
    scat += 0.35 * inB * uRainLens + runS;
  }
  if (uFog > 0.0 && P.g > 0.0){
    float top = uFog * (0.55 + 0.3 * (fbm(vec2(p.x * 6.0, 0.0) + P.id, 3, 81u) - 0.5));
    float fog = smoothstep(top + 0.06, top - 0.06, P.v) * (0.75 + 0.25 * fbm(p * 400.0, 2, 82u));
    float col = floor(p.x / 0.022), x0 = (col + 0.2 + 0.6 * h2(vec2(col, 1), 83u)) * 0.022;
    float drip = step(h2(vec2(col, 2), 83u), 0.5) * (1.0 - smoothstep(0.0008, 0.0016, abs(p.x - x0 - 0.0015 * sin(p.y * 40.0 + col))));
    fog *= 1.0 - drip;
    T *= 1.0 - 0.85 * fog * min(P.g, 1.0); scat += 0.75 * fog * min(P.g, 1.0);
  }
  return T;
}
// slat shadow: a slat of width w and thickness t at height yk, tilted by ti, seen along the sun (sr = tan of profile angle)
float slat(float y, float yk, float w, float t, float ti, float sr){
  float h = 0.5 * w * abs(sin(ti) - cos(ti) * sr) + 0.5 * t * abs(cos(ti) + sin(ti) * sr);
  return aa(abs(y - yk) - h);
}
float blinds(vec2 p, out float scat){
  scat = 0.0;
  if (uBlind == 0) return 1.0;
  float W = uWin.x * 0.5 - 0.005, top = uWin.y * 0.5 - 0.004, H = uWin.y - 0.008;
  float inX = aa(W - abs(p.x));
  float T = 1.0;
  if (uBlind == 1 || uBlind == 2){
    bool wood = uBlind == 2;
    float w = wood ? 0.05 : 0.025, pitch = wood ? 0.043 : 0.021, th = wood ? 0.003 : 0.0003, stk = wood ? 0.0065 : 0.0028;
    float sr = uSunW.y / uSunW.z;
    float head = 0.045, rail = 0.025;
    float span = H - head - rail;
    float yb = top - head - uLower * span - rail;          // bottom of the bottom rail
    float nUp = floor((1.0 - uLower) * span / pitch);
    float sTop = top - head - nUp * stk;                    // raised slats stack under the headrail
    float hdr = aa(p.y - (top - head));
    float stack = aa(p.y - sTop) * (1.0 - hdr);
    float bot = aa(p.y - yb) * (1.0 - aa(p.y - yb - rail));
    float tb = 1.0;
    if (p.y > yb + rail - 0.02 && p.y < sTop + 0.02){
      float k0 = floor((sTop - p.y) / pitch);
      for (int j = -2; j <= 2; j++){
        float k = k0 + float(j);
        if (k < 0.0 || (sTop - (k + 0.5) * pitch) < yb + rail) continue;
        float sag = uImperf * 0.002 * (1.0 - pow(p.x / W, 2.0)) + uImperf * 0.0015 * (h2(vec2(k, 9), 91u) - 0.5);
        float ti = radians(uTilt) + uImperf * 0.12 * (h2(vec2(k, 1), 92u) - 0.5) + uImperf * 0.03 * (p.x / W) * (h2(vec2(k, 2), 92u) - 0.5);
        tb *= slat(p.y, sTop - (k + 0.5) * pitch + sag, w, th, ti, sr);
      }
    }
    T = tb * (1.0 - hdr) * (1.0 - stack) * (1.0 - bot);
    // ladder cords (front and back) or cloth tapes, and lift cords
    float n = max(2.0, floor(uWin.x / 0.55) + 1.0);
    float zone = aa(p.y - yb) * (1.0 - aa(p.y - (top - head)));
    for (int i = 0; i < 8; i++){
      if (float(i) >= n) break;
      float xl = -W + 0.09 + float(i) * (2.0 * W - 0.18) / (n - 1.0);
      float off = w * cos(radians(uTilt)) * uSunW.x / uSunW.z;
      if (wood){
        float tape = (1.0 - aa(abs(p.x - xl) - 0.019)) ;
        float tape2 = (1.0 - aa(abs(p.x - xl - off) - 0.019));
        T *= 1.0 - zone * max(tape, tape2) * 0.9;
      } else {
        T *= 1.0 - zone * (1.0 - aa(abs(p.x - xl) - 0.0006)) * 0.9;
        T *= 1.0 - zone * (1.0 - aa(abs(p.x - xl - off) - 0.0006)) * 0.9;
      }
      T *= 1.0 - zone * (1.0 - aa(abs(p.x - xl - 0.012) - 0.0008)) * 0.85;
    }
    T = mix(1.0, T, inX);
  } else if (uBlind == 3){
    float w = 0.089, pitch = 0.08, sr = uSunW.x / uSunW.z;
    float head = 0.05, xr = -W + uLower * 2.0 * W;            // drawn from the left
    float hdr = aa(p.y - (top - head));
    float nStack = floor((1.0 - uLower) * 2.0 * W / pitch);
    float stack = 1.0 - aa(p.x - (-W + nStack * 0.012));
    float tb = 1.0;
    float x0 = -W + nStack * 0.012;
    if (p.x > x0 - 0.05 && p.x < xr + 0.05){
      float k0 = floor((p.x - x0) / pitch);
      for (int j = -2; j <= 2; j++){
        float k = k0 + float(j), xk = x0 + (k + 0.5) * pitch;
        if (k < 0.0 || xk > xr) continue;
        float ti = radians(uTilt) + uImperf * 0.12 * (h2(vec2(k, 3), 93u) - 0.5);
        tb *= mix(0.14, 1.0, slat(p.x, xk, w, 0.0008, ti, sr));
      }
      float chain = 1.0 - aa(abs(p.y - (-uWin.y * 0.5 + 0.04)) - 0.0012);
      tb *= 1.0 - chain * step(p.x, xr) * 0.8;
    }
    T = tb * (1.0 - hdr) * mix(1.0, 0.0, stack * (1.0 - hdr));
    scat = (1.0 - tb) * 0.3;
  } else if (uBlind == 4){
    // two shutter panels: stiles, rails, a divider rail and 63 mm louvres with a tilt rod
    float st = 0.05, rl = 0.07, w = 0.063, pitch = 0.055, th = 0.009, sr = uSunW.y / uSunW.z;
    float pw = W;
    float px = abs(p.x) - pw * 0.5;                       // centred in each panel
    float lx = pw * 0.5 - st;
    float inL = aa(lx - abs(px));
    float bands = aa(top - rl - p.y) * aa(p.y - (-top + rl)) * aa(abs(p.y) - 0.035);
    float tb = 1.0;
    float yref = p.y > 0.0 ? top - rl : -0.035;
    float k0 = floor((yref - p.y) / pitch);
    for (int j = -2; j <= 2; j++){
      float k = k0 + float(j);
      float ti = radians(uTilt) + uImperf * 0.06 * (h2(vec2(k, p.y > 0.0 ? 1.0 : 2.0), 94u) - 0.5);
      tb *= slat(p.y, yref - (k + 0.5) * pitch, w, th, ti, sr);
    }
    float rod = 1.0 - aa(abs(px + 0.005 * sin(radians(uTilt))) - 0.006);
    T = inL * bands * tb * (1.0 - rod * bands);
  } else if (uBlind == 5){
    float yb = top - 0.07 - uLower * (H - 0.07);
    float inS = aa(p.y - yb) * aa(W - 0.012 - abs(p.x));
    float hem = aa(p.y - yb) * (1.0 - aa(p.y - yb - 0.025));
    float tube = aa(p.y - (top - 0.07));
    float fab = 0.045 * (0.85 + 0.3 * fbm(p * vec2(900.0, 900.0), 2, 95u));
    T = mix(1.0, fab, inS) * (1.0 - hem * aa(W - 0.012 - abs(p.x))) * (1.0 - tube);
    scat = inS * 0.35;
  } else if (uBlind == 6){
    float yb = top - 0.04 - uLower * (H - 0.04);
    float inS = aa(p.y - yb) * aa(W - 0.006 - abs(p.x));
    float head = aa(p.y - (top - 0.04));
    float pl = abs(fract((p.y - yb) / 0.025) - 0.5);
    float fab = 0.02 + 0.03 * smoothstep(0.05, 0.0, pl);
    float n = max(2.0, floor(uWin.x / 0.45) + 1.0), hole = 0.0;
    for (int i = 0; i < 8; i++){
      if (float(i) >= n) break;
      float xl = -W + 0.08 + float(i) * (2.0 * W - 0.16) / (n - 1.0);
      vec2 d = vec2(p.x - xl, (fract((p.y - yb) / 0.025) - 0.5) * 0.025);
      hole = max(hole, (1.0 - aa(length(d) - 0.0016)) * aa(abs(p.x - xl) - 0.0007));
    }
    T = mix(1.0, mix(fab, 0.6, hole), inS) * (1.0 - head);
    scat = inS * 0.3;
  }
  return T;
}
// gathered fabric: folds whose depth comes from the fullness, drifting and billowing in the breeze
float curtains(vec2 p, out float scat){
  scat = 0.0;
  if (uCurt == 0) return 1.0;
  float W = uWin.x * 0.5, H = uWin.y * 0.5;
  bool cafe = uCurt == 5;
  float rodY = cafe ? 0.0 : H + 0.17, botY = cafe ? -H - 0.03 : -H - 0.35;
  float ext = W + 0.22;
  float cov = cafe ? ext + 0.02 : ext * (1.0 - 0.8 * uCOpen) + 0.02;
  float side = sign(p.x + 1e-6);
  float s = cov - (ext - abs(p.x));                                    // 0 at the leading edge, cov at the outer edge
  float fabricW = ext * uFull;
  float N = max(3.0, floor(fabricW / 0.2 + 0.5));
  float lam = cov / N;
  float amp = min((lam / PI) * sqrt(max(fabricW / cov - 1.0, 0.0)), 0.1);
  float dy = clamp((rodY - p.y) / (rodY - botY), 0.0, 1.0);
  float w = uBreeze * pow(dy, 1.4);
  float tt = uT;
  float drift = w * (0.045 * sin(TAU * uBF.x * tt + 4.0 * dy + side) + 0.025 * sin(TAU * uBF.y * tt + 9.0 * s + 2.0 * side) + 0.012 * sin(TAU * uBF.z * tt + 23.0 * s - 6.0 * dy));
  float T = 1.0, sc = 0.0;
  // find the point on the cloth whose shadow lands here (fold depth shifts it along the sun)
  float ss = s + drift;
  for (int it = 0; it < 2; it++){
    float ph = TAU * ss / lam + 1.3 * (fbm(vec2(ss / lam * 0.6, dy * 1.2 + side * 5.0), 3, 101u) - 0.5) * TAU * 0.35;
    float z = amp * (1.0 + 0.3 * dy) * sin(ph);
    ss = s + drift + z * uSunW.x / uSunW.z * side;
  }
  float ph = TAU * ss / lam + 1.3 * (fbm(vec2(ss / lam * 0.6, dy * 1.2 + side * 5.0), 3, 101u) - 0.5) * TAU * 0.35;
  float A = amp * (1.0 + 0.3 * dy) * (1.0 + 0.6 * w);
  float dzds = A * cos(ph) * TAU / lam;
  float dzdy = amp * 0.3 * sin(ph) / (rodY - botY) + w * 0.4 * cos(TAU * uBF.x * tt + 3.0 * dy);
  vec3 n = normalize(vec3(-dzds * side, dzdy, 1.0));
  float c = max(abs(dot(n, uSunW)), 0.05);
  float inC = aa(cov - ss) * aa(ss) * aa(rodY - p.y) * aa(p.y - botY);
  float fu = ss * fabricW / cov, fv = p.y;                     // fabric coordinates
  float tau;
  if (uCurt == 1 || uCurt == 5) tau = 0.55 * (0.9 + 0.2 * fbm(vec2(fu * 40.0, fv * 600.0), 2, 102u));
  else if (uCurt == 3) tau = 3.2 * (0.75 + 0.5 * fbm(vec2(fu * 25.0, fv * 900.0), 3, 103u));   // linen slubs
  else if (uCurt == 4) tau = 14.0;
  else {
    // lace: open net with dense rosettes, connecting tendrils and a scalloped border
    vec2 g = vec2(fu, fv) / 0.09; vec2 gi = floor(g + 0.5); vec2 l = (g - gi) * 0.09;
    float r = length(l), a = atan(l.y, l.x);
    float pet = 0.5 + 0.5 * cos(6.0 * a + gi.x);
    float ros = (1.0 - aa(r - 0.03 * (0.55 + 0.45 * pet))) * aa(r - 0.006) + (1.0 - aa(abs(r - 0.038) - 0.0018));
    vec2 l2 = (fract(g) - 0.5) * 0.09;
    float tend = 1.0 - aa(min(abs(l2.x - l2.y), abs(l2.x + l2.y)) * 0.707 - 0.0012);
    float border = aa(botY + 0.11 + 0.02 * abs(sin(fu / 0.06 * PI)) - p.y);
    float dens = clamp(max(max(ros, tend * 0.8), border * 0.9), 0.0, 1.0);
    float net = 0.55;
    tau = -log(mix(1.0 - net, 0.1, dens));
  }
  float hemT = (1.0 - aa(p.y - botY - 0.07)) + (1.0 - aa(rodY - 0.09 - p.y)) + (1.0 - aa(ss - 0.03));
  tau *= 1.0 + min(hemT, 1.0);
  T = exp(-tau / c);
  float rod = cafe ? 1.0 - aa(abs(p.y - rodY) - 0.008) : 0.0;
  float tr = mix(1.0, T, inC) * (1.0 - rod);
  float diff = uCurt == 4 ? 0.0 : uCurt == 3 ? 0.08 : 0.12;
  scat = inC * (1.0 - T) * diff;
  return tr;
}
uniform float uZB, uZC;
void main(){
  vec2 p = (gl_FragCoord.xy / uRes - 0.5) * uDm;
  Pane P = frame(p);
  float s1, s2, s3;
  float g = glassT(p, P, s1);
  // the screen (outside the glass) and its frame
  float scr = 1.0;
  if (uScreen > 0){
    float so = sdOpen(p), topY = uScreen == 2 ? 0.0 : uWin.y * 0.5;
    float inSc = aa(so - uFW * 0.5) * aa(topY - uFW * 0.5 - p.y);
    float fr = aa(so - uFW * 0.5 - 0.022) * aa(topY - uFW * 0.5 - 0.022 - p.y);
    scr = mix(1.0, uScreenT, fr) * (1.0 - (inSc - fr));
  }
  // blinds and curtains sit deeper: shift for their depth along the sun
  vec2 pb = p, pc = p;
  float b = blinds(pb, s2), c = curtains(pc, s3);
  oA = vec4(P.m, g * scr, b, c);
  oB = vec4(min(P.g, 1.0), P.m * (s1 * scr + g * scr * (s2 + s3)), 0.0, 1.0);
}`;
/* Pass 2: trace each gobo pixel back toward the sun through every layer. */
const FS_WIN = COMMON + WIN_GLSL + `
uniform sampler2D uL0, uL1, uTree;
uniform vec3 uR, uU, uS;
uniform vec2 uQ0; uniform float uCover, uDm, uZo, uZi, uFD, uZB, uZC, uDist, uSunR, uPxG, uSmear, uGlowLod, uGlowK, uTreeL;
uniform int uTaps, uSmearDir, uTreeOn, uFDn; uniform float uTexel, uEave, uEaveY;
// mip level that matches the spacing of the sun-disk samples on a layer this far from the lit surface
float lodAt(float L){ return max(0.0, log2(max(2.0 * L * uSunR / sqrt(float(uTaps)) / uTexel, 1e-6)) - 0.3); }
vec2 toWin(vec2 q, float z){ float t = (z - q.x * uR.z - q.y * uU.z) / uS.z; return vec2(q.x * uR.x + q.y * uU.x + t * uS.x, q.x * uR.y + q.y * uU.y + t * uS.y); }
vec2 wuv(vec2 xy){ return xy / uDm + 0.5; }
float aaG(float d){ return clamp(d / uPxG + 0.5, 0.0, 1.0); }
// an edge seen through one sun-disk sample, softened to the spacing between samples, so a wide penumbra
// (the lintel and reveals, far from where the light lands) comes out smooth instead of as a stack of steps
float aaT(float d, float L){ return clamp(d / max(uPxG, 1.8 * L * uSunR / sqrt(float(uTaps))) + 0.5, 0.0, 1.0); }
void main(){
  vec2 q = uQ0 + (gl_FragCoord.xy / uRes - 0.5) * uCover;
  // light spread by reeded, textured or frosted glass, sampled around the central ray
  float smear = 0.0;
  if (uSmear > 0.0){
    vec2 c0 = toWin(q, 0.0);
    float ls = max(0.0, log2(uSmear * (uSmearDir == 1 ? 2.0 / 24.0 : 0.36) / uTexel));
    for (int i = 0; i < 24; i++){
      vec2 o;
      if (uSmearDir == 1) o = vec2(((float(i) + 0.5) / 24.0 * 2.0 - 1.0) * uSmear, 0.0);
      else { float rho = sqrt((float(i) + 0.5) / 24.0), th = float(i) * 2.39996; o = uSmear * rho * vec2(cos(th), sin(th)); }
      vec2 x = c0 + o;
      vec4 a = textureLod(uL0, wuv(x), ls); float gc = textureLod(uL1, wuv(x), ls).r;
      smear += a.r * a.g * gc * aaG(sdOpen(x));
    }
    smear /= 24.0;
  }
  float acc = 0.0, ws = 0.0;
  float lF = lodAt(uDist), lB = lodAt(uDist + uZB / uS.z), lC = lodAt(uDist + uZC / uS.z);
  for (int i = 0; i < 256; i++){
    if (i >= uTaps) break;
    float rho = sqrt((float(i) + 0.5) / float(uTaps)), th = float(i) * 2.39996323;
    vec2 d = uSunR * rho * vec2(cos(th), sin(th));
    float w = 1.0 - 0.6 * (1.0 - sqrt(max(0.0, 1.0 - rho * rho)));
    ws += w;
    // wall reveal: outer and inner faces
    float Lo = uDist + uZo / uS.z, Li = uDist + uZi / uS.z;
    float v = aaT(sdOpen(toWin(q + Lo * d, uZo)), Lo) * aaT(sdOpen(toWin(q + Li * d, uZi)), Li);
    // roof eave above the window: rays toward the sun that rise past its outer edge are blocked
    if (uEave > 0.0){ float ze = uZo + uEave, Le = uDist + ze / uS.z; v *= aaT(uEaveY - toWin(q + Le * d, ze).y, Le); }
    if (v <= 0.0) continue;
    vec2 xg = toWin(q + uDist * d, 0.0);
    // frame members have depth: their shadow is the union of their slices from front to back
    vec4 c = textureLod(uL0, wuv(xg), lF);
    float f1 = c.r, f2 = 1.0;
    for (int k = 0; k < 8; k++){
      if (k >= uFDn) break;
      float z = uFD * (2.0 * (float(k) + 0.5) / float(uFDn) - 1.0);
      f1 = min(f1, textureLod(uL0, wuv(toWin(q + (uDist + z / uS.z) * d, z)), lF).r);
    }
    float gl;
    if (uSmear > 0.0){ float gc = texture(uL1, wuv(xg)).r; gl = min(f1, f2) * c.g * (1.0 - gc); }
    else gl = min(f1, f2) * c.g;
    float bl = textureLod(uL0, wuv(toWin(q + (uDist + uZB / uS.z) * d, uZB)), lB).b;
    float cu = textureLod(uL0, wuv(toWin(q + (uDist + uZC / uS.z) * d, uZC)), lC).a;
    acc += w * v * gl * bl * cu;
  }
  float T = acc / ws;
  // light spread by the glass leaves it in all directions, so the window outline no longer crops it; blinds and curtains still do
  if (uSmear > 0.0) T += smear * textureLod(uL0, wuv(toWin(q, uZB)), lodAt(uDist + uZB / uS.z) + 2.0).b * textureLod(uL0, wuv(toWin(q, uZC)), lodAt(uDist + uZC / uS.z) + 2.0).a;
  // light turned diffuse by the glass, shades or curtains spreads into a broad glow
  vec2 c0 = toWin(q, 0.0);
  float glow = 0.0;
  for (int i = 0; i < 6; i++){
    float th = float(i) * 1.0472;
    glow += textureLod(uL1, wuv(c0 + uDist * 0.25 * vec2(cos(th), sin(th))), uGlowLod).g;
  }
  // diffused light only shows where the opening lets light through, so nothing appears outside the window
  float open0 = aaG(sdOpen(toWin(q, uZo))) * aaG(sdOpen(toWin(q, uZi)));
  T += glow / 6.0 * uGlowK * open0;
  if (uTreeOn == 1) T *= texture(uTree, q / uTreeL + 0.5).r;
  // the faint scattered glow fades out before the frame edge so the gobo has a clean black border
  vec2 e2 = abs(gl_FragCoord.xy / uRes - 0.5);
  T *= 1.0 - smoothstep(0.42, 0.5, max(e2.x, e2.y)) * smoothstep(0.35, 0.15, T);
  fragColor = vec4(vec3(T), 1.0);
}`;
PR.winL = program(VS_FULL, FS_WINL, 'window layers');
PR.win = program(VS_FULL, FS_WIN, 'window composite');

function winMRT(name, w, h) {
  let t = targets[name];
  if (t && t.w === w && t.h === h) return t;
  if (t) { gl.deleteTexture(t.tex); gl.deleteTexture(t.tex2); gl.deleteFramebuffer(t.fb); }
  const a = makeTex(w, h, 'f16', true), b = makeTex(w, h, 'f16', true);
  for (const x of [a, b]) {
    gl.bindTexture(gl.TEXTURE_2D, x);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  t = targets[name] = {tex:a, tex2:b, fb, w, h};
  return t;
}
const loopF = (f, tl) => tl.loop ? Math.max(1, Math.round(f * tl.len)) / tl.len : f;
function renderWindows(P, res, t, tl) {
  const Q = QUAL[S.quality];
  const tt = tl.loop ? ((t % tl.len) + tl.len) % tl.len : t;
  const e = clamp(P.sunElev, 1, 85) * DEG, a = clamp(P.sunAz, -80, 80) * DEG;
  const s = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];          // toward the sun, window coords (z out)
  const B = basis(v3.mul(s, -1));
  const sunR = Math.tan(0.5 * (P.srcSize || 0.53) * DEG);
  const D = P.recv;
  // depths (z out of the wall): wall faces, frame, blinds in the reveal, curtains in the room
  const zo = P.inset * P.wallT, zi = zo - P.wallT;
  // half-depth of the frame members: lead came is shallow, steel sections thin, timber sashes deep
  const fd = [0.022, 0.022, 0.022, 0.022, 0.024, 0.014, 0.003, 0.022, 0.02, 0.022][P.style | 0] || 0.022;
  const bl = P.blind | 0, slatW = bl === 2 ? 0.05 : bl === 4 ? 0.063 : bl === 3 ? 0.089 : 0.025;
  const zB = Math.min(-0.03, zi + 0.03 + slatW * 0.5);
  const zC = zi - 0.1;
  // framing: project the opening's corners (both wall faces) into light space
  const W2 = P.W / 2, H2 = P.H / 2;
  const qs = [];
  for (const z of [0]) for (const [x, y] of [[-W2, -H2], [W2, -H2], [-W2, H2], [W2, H2]]) qs.push([v3.dot([x, y, z], B.r), v3.dot([x, y, z], B.u)]);
  const xs = qs.map(q => q[0]), ys = qs.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const smear = (P.glass === 3 ? 0.5 * D * 0.52 * 0.35 : P.glass === 4 ? 0.5 * D * 0.52 * 0.12 : P.glass === 5 ? D * 0.33 : 0) * ((P.glass === 3 || P.glass === 4) ? P.distort : 1);
  const cover = (ext * 1.08 + 4 * D * sunR + 0.06 + 1.6 * smear) * P.zoom;
  WIN.cover = cover;
  // layer domain covers the opening plus the sideways shift of deep layers
  const slope = Math.max(Math.abs(s[0]), Math.abs(s[1])) / s[2];
  const Dm = Math.max(P.W, P.H) + 2 * (Math.abs(zC) + 0.12) * Math.min(slope, 3) + 0.12;
  const LR = clamp(Math.round(Math.min(Dm / 0.0007, res * Q.ss * 1.5)), 512, 2048);
  const Fp = 1 - fresnel(s[2], 1.52);
  const Tp = Math.pow(Fp * Fp * 0.985, [1, 2, 3][P.glazing | 0]);
  // insect screen: 18 × 16 mesh of 0.28 mm wire, thicker in projection at oblique angles
  const sx = Math.abs(s[0] / s[2]), sy = Math.abs(s[1] / s[2]);
  const scrT = Math.max(0, 1 - 0.28 / 1.41 * Math.sqrt(1 + sx * sx)) * Math.max(0, 1 - 0.28 / 1.59 * Math.sqrt(1 + sy * sy));
  const L = winMRT('winL', LR, LR);
  // the layers only change with the settings, or every frame while curtains move in a breeze
  const lsig = JSON.stringify([P, s, LR, Dm, D, ((P.curtain && P.breeze > 0) || P.rain > 0) ? tt : 0]);
  const st = WIN_STYLE_DEF[P.style | 0] ? P.style | 0 : 0;
  if (lsig !== WIN.lsig) {
    WIN.lsig = lsig;
    pass(PR.winL, L, p => {
      f2(p, 'uWin', P.W, P.H); f1(p, 'uFW', P.fw); f1(p, 'uBW', P.bw); f1(p, 'uBorder', P.border); f1(p, 'uOpen', P.open || 0); f1(p, 'uPx', Dm / LR);
      i1(p, 'uStyle', st); i1(p, 'uCols', P.cols | 0); i1(p, 'uRows', P.rows | 0); i1(p, 'uCols2', P.cols2 | 0); i1(p, 'uRows2', P.rows2 | 0);
      f3(p, 'uSunW', ...s); u1(p, 'uSeed', P.seed | 0);
      f1(p, 'uDm', Dm); f1(p, 'uDist', D); f1(p, 'uTp', Tp); f1(p, 'uDistort', P.distort); f1(p, 'uGrime', P.grime); f1(p, 'uSmudge', P.smudge);
      f1(p, 'uSpots', P.spots); f1(p, 'uRain', P.rain); f1(p, 'uRainSz', P.rainSize ?? 1); f1(p, 'uRainDens', P.rainDrops ?? 1); f1(p, 'uRainRun', P.rainRun ?? 1); f1(p, 'uRainLens', P.rainLens ?? 1); f1(p, 'uRainSpd', P.rainSpeed ?? 1); f1(p, 'uFog', P.fog); f1(p, 'uScreenT', scrT); f1(p, 'uT', tt); f1(p, 'uLoopT', tl.loop ? tl.len : 0);
      i1(p, 'uGlass', P.glass | 0); i1(p, 'uScreen', P.screen | 0); i1(p, 'uBlind', bl); i1(p, 'uCurt', P.curtain | 0);
      f1(p, 'uTilt', P.tilt); f1(p, 'uLower', P.lower); f1(p, 'uImperf', P.imperf); f1(p, 'uCOpen', P.cOpen); f1(p, 'uFull', P.full); f1(p, 'uBreeze', P.breeze);
      f3(p, 'uBF', loopF(0.21, tl), loopF(0.37, tl), loopF(0.83, tl));
    });
    gl.bindTexture(gl.TEXTURE_2D, L.tex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, L.tex2); gl.generateMipmap(gl.TEXTURE_2D);
  }
  // trees outside: a real canopy rendered in the same light space, at its own distance
  let treeTex = null, treeL = 3, tinfo = '';
  if (P.trees) {
    const pr = MODES.trees.presets.filter(x => !/white frame/.test(x.name))[(P.trees | 0) - 1];
    if (pr) {
      const Pt = {...DEFAULTS.trees, ...pr.v, seed:P.seed, framing:0, trunks:false, sunElev:Math.max(P.sunElev, 8), recvHeight:0, cover:P.treeCover, windSpeed:P.treeWind, sunDisk:P.srcSize || 0.53};
      const depth = Pt.canopyDepth;
      Pt.canopyTop = clamp((D + P.treeDist + depth * 0.5) * Math.sin(Math.max(P.sunElev, 8) * DEG), depth + 0.5, 40);
      const keep = info;
      const tOut = renderTrees(Pt, Math.min(res, 1024), t, tl);
      info = keep;
      treeTex = tOut.tex; treeL = Pt.tileSize;
      tinfo = `Outside: ${pr.name.toLowerCase()} canopy ${P.treeDist.toFixed(1)} m out, its shadow edges soften by ${(2 * (D + P.treeDist) * sunR * 100).toFixed(1)} cm`;
    }
  }
  const out = tgt('winOut', res, res, 'f16');
  pass(PR.win, out, p => {
    tex(p, 'uL0', L.tex, 0); tex(p, 'uL1', L.tex2, 1); tex(p, 'uTree', treeTex || L.tex, 2);
    f3(p, 'uR', ...B.r); f3(p, 'uU', ...B.u); f3(p, 'uS', ...s);
    f2(p, 'uQ0', cx, cy); f1(p, 'uCover', cover); f1(p, 'uDm', Dm);
    i1(p, 'uFDn', clamp(Math.ceil(2 * fd * Math.hypot(s[0], s[1]) / s[2] / Math.max(P.bw * 0.6, 0.004)) + 1, 2, 8)); f1(p, 'uZo', zo); f1(p, 'uZi', zi); f1(p, 'uFD', fd); f1(p, 'uZB', zB); f1(p, 'uZC', zC); f1(p, 'uDist', D);
    f1(p, 'uSunR', sunR); f1(p, 'uEave', P.eave || 0); f1(p, 'uEaveY', P.H / 2 + (P.eaveH ?? 0.3)); f1(p, 'uTexel', Dm / LR); f1(p, 'uPxG', cover / res); f1(p, 'uSmear', smear); i1(p, 'uSmearDir', P.glass === 3 ? 1 : 0);
    f1(p, 'uGlowLod', Math.max(0, Math.log2(Math.max(D * 0.5 / Dm * LR, 1)))); f1(p, 'uGlowK', 0.5);
    i1(p, 'uTaps', Q.treeTaps); i1(p, 'uTreeOn', treeTex ? 1 : 0); f1(p, 'uTreeL', treeL);
    f2(p, 'uWin', P.W, P.H); f1(p, 'uFW', P.fw); i1(p, 'uStyle', st); f1(p, 'uPx', cover / res);
  });
  const blur = mm => (2 * mm * sunR * 1000).toFixed(0);
  const az = P.sunAz;
  info = [`${WIN_STYLES[st]} ${P.W.toFixed(2)} × ${P.H.toFixed(2)} m in a ${(P.wallT * 100).toFixed(0)} cm wall · light space: the gobo spans ${cover.toFixed(2)} m across the beam`,
          `Sun ${P.sunElev.toFixed(1)}° up, ${Math.abs(az).toFixed(1)}° ${az >= 0 ? 'right' : 'left'} of square · ${(Tp * 100).toFixed(0)}% through the glass (${['one pane', 'two panes', 'three panes'][P.glazing | 0]} at ${(Math.acos(s[2]) / DEG).toFixed(0)}° incidence)`,
          `Shadow edges soften with depth: frame ${blur(D)} mm${bl ? ' · blinds ' + blur(D + zB / s[2]) + ' mm' : ''}${P.curtain ? ' · curtains ' + blur(D + zC / s[2]) + ' mm' : ''} · wall reveal ${blur(D + zi / s[2])}–${blur(D + zo / s[2])} mm`,
          ...(tinfo ? [tinfo] : []),
          ...(P.eave > 0 ? [`Eave ${P.eave.toFixed(2)} m deep, ${(P.eaveH ?? 0.3).toFixed(2)} m above the window: its shadow edge softens by ${blur(D + (zo + P.eave) / s[2])} mm`] : []),
          `Project along the sun: point the light ${P.sunElev.toFixed(1)}° down through the window${Math.abs(az) > 0.5 ? `, ${Math.abs(az).toFixed(1)}° off square` : ''}`,
          ].join('\n') + (tl.loop && (P.curtain && P.breeze > 0 || P.trees) ? `\nEvery motion completes whole cycles in ${fmtLen(tl.len)}` : '');
  return out;
}
