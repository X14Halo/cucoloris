/* =====================================================================
   SCENE PREVIEW
   A small ray-traced set (grey floor, back wall, optional test sphere)
   lit by one light that carries the current gobo, the way a texture is
   assigned to a light's colour in a renderer. The gobo used is the exact
   output-levels image shown in the Gobo view.
   ===================================================================== */
const FS_SCENE = COMMON + `
uniform sampler2D uGobo;
uniform vec3 uCamPos, uCamF, uCamR, uCamU; uniform float uTanF;
uniform int uType, uShape, uSingle, uSphere, uGizmo, uSet;
uniform vec3 uLPos, uLF, uLR, uLU, uAim, uLCol;
uniform float uTanC, uSoft, uRep, uBlur, uBlurLod, uI, uSunSize, uSrcR;
uniform vec4 uSph;
uniform float uAlb, uAmb, uHaze, uExpo, uGoboRes, uT;
const vec2 FX = vec2(-8.0, 8.0); const float FZ = 10.0, WY = 6.0, DY = 1.5;
// ray / axis-aligned box
float box(vec3 ro, vec3 rd, vec3 lo, vec3 hi, out vec3 n){
  vec3 iv = 1.0 / rd, t0 = (lo - ro) * iv, t1 = (hi - ro) * iv, tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  if (b < max(a, 0.0) || a <= 0.0) return 1e9;
  n = a == tn.x ? vec3(-sign(rd.x), 0, 0) : a == tn.y ? vec3(0, -sign(rd.y), 0) : vec3(0, 0, -sign(rd.z));
  return a;
}
// vertical cylinder
float cyl(vec3 ro, vec3 rd, vec2 c, float r, float y0, float y1, out vec3 n){
  vec2 o = ro.xz - c, d = rd.xz;
  float a = dot(d, d), b = dot(o, d), cc = dot(o, o) - r * r, h = b * b - a * cc;
  if (h < 0.0 || a < 1e-8) return 1e9;
  float t = (-b - sqrt(h)) / a; float y = ro.y + t * rd.y;
  if (t <= 0.0 || y < y0 || y > y1) return 1e9;
  n = normalize(vec3(o.x + t * d.x, 0.0, o.y + t * d.y));
  return t;
}
// a timber dock: deck boards with gaps, joists, end caps and pilings
float hitDock(vec3 ro, vec3 rd, out vec3 n){
  float t = 1e9; vec3 nn;
  if (abs(rd.y) > 1e-5){
    float tt = (DY - ro.y) / rd.y; vec3 p = ro + tt * rd;
    if (tt > 0.0 && p.x > -4.0 && p.x < 4.0 && p.z > -1.0 && p.z < 5.0){ t = tt; n = vec3(0.0, -sign(rd.y), 0.0); }
  }
  for (int k = 0; k < 2; k++){
    float z = k == 0 ? -0.92 : 4.92;
    float tt = box(ro, rd, vec3(-4.0, DY - 0.16, z - 0.08), vec3(4.0, DY, z + 0.08), nn);
    if (tt < t){ t = tt; n = nn; }
    for (int j = 0; j < 3; j++){
      float tc = cyl(ro, rd, vec2(-3.9 + 3.9 * float(j), z), 0.15, -2.0, DY + 0.25, nn);
      if (tc < t){ t = tc; n = nn; }
    }
  }
  float tc = cyl(ro, rd, vec2(-3.9, 2.0), 0.15, -2.0, DY, nn); if (tc < t){ t = tc; n = nn; }
  tc = cyl(ro, rd, vec2(3.9, 2.0), 0.15, -2.0, DY, nn); if (tc < t){ t = tc; n = nn; }
  return t;
}
float occl(vec3 p, vec3 l, float dl){
  if (uSet != 2) return 1.0;
  vec3 n; float t = hitDock(p + l * 2e-3, l, n);
  return t < dl ? 0.0 : 1.0;
}

vec3 gobo(vec2 uv, float lod){
  if (uSingle == 3){ if (uv.y < 0.0 || uv.y > 1.0) return vec3(0.0); }   // tiles sideways only (hulls and walls)
  else if (uSingle > 0 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) return vec3(uSingle == 1 ? 1.0 : 0.0);
  if (uBlur <= 0.0) return textureLod(uGobo, uv, lod).rgb;
  vec3 s = vec3(0.0);
  for (int i = 0; i < 12; i++){
    float rho = sqrt((float(i) + 0.5) / 12.0), th = float(i) * 2.39996323;
    s += textureLod(uGobo, uv + uBlur * rho * vec2(cos(th), sin(th)), max(lod, uBlurLod)).rgb;
  }
  return s / 12.0;
}
// distance along the shadow ray to the sphere's silhouette, softened by the source size
float sphShadow(vec3 p, vec3 l, float dl, float srcAng){
  if (uSphere == 0) return 1.0;
  vec3 oc = uSph.xyz - p; float tca = dot(oc, l);
  if (tca <= 0.0 || tca > dl) return 1.0;
  float d = sqrt(max(dot(oc, oc) - tca * tca, 0.0));
  float pen = max(tca * srcAng, 0.002);
  return smoothstep(uSph.w - pen, uSph.w + pen, d);
}
// light arriving at p (before the cosine): rgb irradiance on a surface facing the light
vec3 lightAt(vec3 p, out vec3 l, float lod, float pixW){
  if (uType == 1){
    l = -uLF;
    vec2 q = vec2(dot(p - uAim, uLR), dot(p - uAim, uLU)) / uSunSize;
    lod = max(lod, log2(max(pixW / uSunSize * uGoboRes, 1e-6)));
    return uI * uLCol * gobo(q + 0.5, lod) * sphShadow(p, l, 1e9, 0.00465) * occl(p, l, 1e9);
  }
  vec3 v = p - uLPos; float d2 = max(dot(v, v), 0.04), d = sqrt(d2);
  l = -v / d;
  float z = dot(v, uLF);
  if (z <= 1e-4) return vec3(0.0);
  vec2 q = vec2(dot(v, uLR), dot(v, uLU)) / (z * uTanC);
  float m;
  float s = max(uSoft, 1e-3);
  if (uShape == 0) m = 1.0 - smoothstep(1.0 - s, 1.0, length(q));
  else m = (1.0 - smoothstep(1.0 - s, 1.0, abs(q.x))) * (1.0 - smoothstep(1.0 - s, 1.0, abs(q.y)));
  if (m <= 0.0) return vec3(0.0);
  vec2 uv = 0.5 + 0.5 * q * uRep;
  lod = max(lod, log2(max(pixW * uRep / (2.0 * z * uTanC) * uGoboRes, 1e-6)));
  float dl = d;
  return uI * uLCol * m * gobo(uv, lod) / d2 * sphShadow(p, l, dl, uSrcR / max(d, 0.1)) * occl(p, l, dl);
}
float hitScene(vec3 ro, vec3 rd, out vec3 n, out int id){
  float t = 1e9; id = -1;
  if (rd.y < 0.0){
    float tt = -ro.y / rd.y; vec3 p = ro + tt * rd;
    if (uSet == 0 && max(abs(p.x), abs(p.z)) < 12.0){ t = tt; n = vec3(0, 1, 0); id = 0; }
    if (uSet == 1 && p.x > FX.x && p.x < FX.y && p.z > 0.0 && p.z < FZ){ t = tt; n = vec3(0, 1, 0); id = 0; }
    if (uSet >= 2 && max(abs(p.x), abs(p.z - 4.0)) < 40.0 && (uSet == 2 || p.z > 0.0)){ t = tt; n = vec3(0, 1, 0); id = 3; }
  }
  if ((uSet == 1 || uSet == 3) && rd.z < 0.0){
    float tt = -ro.z / rd.z; vec3 p = ro + tt * rd;
    if (tt < t && p.x > FX.x && p.x < FX.y && p.y > (uSet == 3 ? -1.0 : 0.0) && p.y < (uSet == 3 ? 4.0 : WY)){ t = tt; n = vec3(0, 0, 1); id = 1; }
  }
  if (uSet == 2){ vec3 nn; float tt = hitDock(ro, rd, nn); if (tt < t){ t = tt; n = nn; id = 4; } }
  if (uSphere == 1){
    vec3 oc = ro - uSph.xyz; float b = dot(oc, rd), c = dot(oc, oc) - uSph.w * uSph.w, h = b * b - c;
    if (h > 0.0){ float tt = -b - sqrt(h); if (tt > 0.0 && tt < t){ t = tt; n = normalize(ro + tt * rd - uSph.xyz); id = 2; } }
  }
  return t;
}
float ao(vec3 p, vec3 n, int id){
  float a = 1.0;
  if (id == 0 && uSet == 1) a *= 1.0 - 0.45 * exp(-p.z / 0.35);
  if (id == 1 && uSet == 1) a *= 1.0 - 0.45 * exp(-p.y / 0.35);
  if (id == 4) a *= 0.6 + 0.4 * max(-n.y, 0.0);
  if (id == 2) a *= 0.55 + 0.45 * (0.5 + 0.5 * n.y);
  if (uSphere == 1 && id != 2){
    vec3 v = uSph.xyz - p; float d = length(v);
    a *= 1.0 - clamp(uSph.w * uSph.w / (d * d) * max(dot(n, v / d), 0.0), 0.0, 1.0);
  }
  return a;
}
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 srgb(vec3 c){ return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 s = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 rd = normalize(uCamF + uTanF * (s.x * uCamR + s.y * uCamU));
  vec3 ro = uCamPos, n; int id;
  float t = hitScene(ro, rd, n, id);
  vec3 col;
  vec3 sky = uSet >= 2 ? vec3(0.55, 0.68, 0.85) * (0.4 + 2.5 * uAmb) : vec3(0.012, 0.013, 0.015);
  if (id < 0) col = sky * (uSet >= 2 ? 0.7 + 0.5 * max(rd.y, 0.0) : 1.0 + 0.6 * rd.y);
  else if (id == 3){
    // open water: dark body, sky (or dock underside) seen in reflection
    float c = max(-rd.y, 0.0), F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
    vec3 rr = reflect(rd, vec3(0, 1, 0)), nn; vec3 refl = sky;
    if (uSet == 2){ vec3 pw = ro + t * rd; vec3 pd = pw + rr * (DY - pw.y) / max(rr.y, 1e-3); if (abs(pd.x) < 4.1 && pd.z > -1.1 && pd.z < 5.1) refl = vec3(0.03) * uAlb; }
    col = mix(vec3(0.004, 0.012, 0.014) * (1.0 + 4.0 * uAmb), refl, F);
  } else {
    vec3 p = ro + t * rd, l;
    // texture footprint for filtering the projected gobo
    float pixW = t * 2.0 * uTanF / uRes.y / max(abs(dot(n, rd)), 0.15);
    vec3 e = lightAt(p, l, 0.0, pixW);
    float ndl = max(dot(n, l), 0.0);
    vec3 alb = id == 4 ? uAlb * vec3(1.0, 0.95, 0.88) : vec3(uAlb);
    col = alb * (e * ndl + uAmb * ao(p, n, id) * vec3(0.92, 0.96, 1.0));
  }
  float tEnd = min(t, 30.0);
  // light gizmo
  if (uGizmo == 1 && uType == 0){
    vec3 oc = ro - uLPos; float b = dot(oc, rd), c = dot(oc, oc) - 0.0064, h = b * b - c;
    if (h > 0.0 && -b - sqrt(h) < t && -b - sqrt(h) > 0.0){
      float k = max(dot(normalize(ro + (-b - sqrt(h)) * rd - uLPos), uLF), 0.0);
      col = mix(vec3(0.08), uLCol * 6.0, smoothstep(0.3, 0.8, k)); tEnd = -b - sqrt(h);
    }
  }
  // atmospheric haze: single scattering through the beam
  if (uHaze > 0.0){
    float sig = uHaze * 0.12, Tr = 1.0; vec3 ins = vec3(0.0);
    const int NS = 32;
    float dt = tEnd / float(NS), j = h12(gl_FragCoord.xy + fract(uT) * 91.0);
    for (int i = 0; i < NS; i++){
      vec3 p = ro + rd * (float(i) + j) * dt, l;
      vec3 e = lightAt(p, l, uBlurLod + 1.0, 0.0);
      float g = 0.45, mu = dot(rd, -l);
      float ph = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
      ins += Tr * sig * dt * e * ph * 4.0 + Tr * sig * dt * uAmb * 0.25;
      Tr *= exp(-sig * dt);
    }
    col = col * Tr + ins;
  }
  col *= exp2(uExpo);
  fragColor = vec4(srgb(aces(col)) + (h12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}`;
PR.scene = program(VS_FULL, FS_SCENE, 'scene preview');

const SCENE_DEFAULTS = {
  set:1, ltype:0, cone:90, soft:0.15, shape:0, rep:1, sunScale:1, blur:0,
  dist:5, az:25, el:40, roll:0, ev:0, color:'#ffffff',
  aimX:0, aimY:0.8, aimZ:0.8,
  sphere:true, gizmo:true, haze:0, amb:0.12, alb:0.5, expo:0, follow:true, real:true,
};
const SETS = ['Floor', 'Floor & wall', 'Dock, seen from below', 'Wall at the waterline'];
const SET_CAMS = [
  {az:30, el:38, dist:10, tx:0, ty:0, tz:0},
  {az:30, el:15, dist:11, tx:0, ty:1.3, tz:1.6},
  {az:18, el:-16, dist:4.2, tx:0, ty:1.35, tz:2.0},
  {az:32, el:10, dist:9, tx:0, ty:1.0, tz:0.6},
  {az:30, el:15, dist:11, tx:0, ty:1.3, tz:1.6},
];
// a 0.9 m ball (about 3 ft) stands in for a character, with the light framed around it
const MODE_SPHERE = {windows:[0.5, 0.22, 1.25, 0.22], trees:[0, 0.45, 1.5, 0.45], shapes:[0, 0.45, 1.5, 0.45]};
const SET_SPHERE = [[1.1, 0.45, 0.9, 0.45], [-1.3, 0.5, 1.7, 0.5], [0, -9, 0, 0.01], [0, -9, 0, 0.01], [-1.3, 0.5, 1.7, 0.5]];
// each pattern gets a set and a light placed the way that pattern is used
const MODE_SCENE = {
  under:  {set:0, ltype:0, cone:90, dist:4, el:90, az:0, aimX:0, aimY:0, aimZ:0, sphere:true},
  over:   {set:2, ltype:0, cone:90, dist:4, el:-68, az:0, aimX:0, aimY:1.5, aimZ:2, sphere:false, amb:0.08, ev:1.3},
  hull:   {set:3, ltype:1, follow:true, el:-30, az:0, aimX:0, aimY:1.0, aimZ:0, sphere:false, amb:0.1, ev:0.5},
  trees:  {set:1, ltype:0, cone:70, dist:6, el:62, az:18, aimX:0, aimY:0.45, aimZ:1.5, sphere:true},
  shapes: {set:1, ltype:0, cone:60, dist:6, el:55, az:18, aimX:0, aimY:0.45, aimZ:1.5, sphere:true},
  windows:{set:1, ltype:1, el:35, az:-28, aimX:0, aimY:0.12, aimZ:0.75, sphere:true, amb:0.06, color:'#fff4e6'},
};
// spotlights start with the gobo at its real size where they are aimed
const MODE_CAMS = {windows:{az:24, el:22, dist:3.6, tx:0.15, ty:0.35, tz:0.75}, trees:{az:28, el:20, dist:7.5, tx:0, ty:0.7, tz:1.2}, shapes:{az:28, el:20, dist:7.5, tx:0, ty:0.7, tz:1.2}};
function camDefault(m) { const set = S.scenes[m].set | 0; return {...(MODE_CAMS[m] && MODE_SCENE[m].set === set ? MODE_CAMS[m] : SET_CAMS[set])}; }
const sceneDefaults = m => {
  const d = {...SCENE_DEFAULTS, ...(MODE_SCENE[m] || {})};
  const tile = S.p[m] && S.p[m].tileSize;
  if (d.ltype === 0 && tile && !['windows', 'shapes'].includes(MODES[m].kind)) d.rep = clamp(+(2 * d.dist * Math.tan(d.cone * 0.5 * DEG) / tile).toFixed(2), 1, 12);
  return d;
};
const canFollow = () => S.p[S.mode].sunElev !== undefined && (MODES[S.mode].kind || (S.mode === 'hull' && (!shotActive() || !!shotAnchor('hull'))));
const followsSun = () => SC().follow && SC().ltype === 1 && canFollow();
// v4 changed the default set-up of several scenes, so older saved scenes start fresh
if (!S.scenes || !(S.savedVer >= 5)) S.scenes = {};
if (!S.cams || !(S.savedVer >= 5)) S.cams = {};
for (const m of Object.keys(MODES)) {
  S.scenes[m] = {...sceneDefaults(m), ...(S.scenes[m] || {})};
  // a loaded shot lives only in the tab it was opened in
  if ((S.scenes[m].set | 0) === 4) { const d = sceneDefaults(m); Object.assign(S.scenes[m], {set:d.set, aimX:d.aimX, aimY:d.aimY, aimZ:d.aimZ, az:d.az, sphere:d.sphere}); S.cams[m] = null; }
  if (!S.cams[m]) S.cams[m] = camDefault(m);
}

// with a shot selected, each pattern has its own light in that shot, and the shot has one orbit camera
const SC = () => shotActive() ? shotLight(S.mode) : S.scenes[S.mode];
const CAM = () => shotActive() ? shotCam() : S.cams[S.mode];
const inShot = () => shotActive() && shotReady();
const SCENE_GROUPS = () => {
  const sun = SC().ltype === 1, shot = inShot();
  const light = [
    {k:'ltype', l:'Light', opts:['Spotlight', 'Sun (distant light)'], h:'A spotlight projects the gobo through its cone and falls off with distance. The sun is a parallel light: the gobo is laid across the set at its real-world size.'},
    {k:'real', l:'Keep real-world scale', type:'chk', h:'Sizes the gobo automatically so the pattern lands at its true size: a canopy tile is its real width, a single branch or light pool fills the projection.'},
  ];
  const real = SC().real;
  if (!sun) light.push(
    {k:'cone', l:'Projection angle', min:5, max:160, step:0.5, u:'°', h:real && sceneFramed() ? 'Full angle the gobo is projected across. A framed gobo (single element, light pool, window) fills this angle edge to edge, so a wider angle spreads it over more of the set.' : 'Full angle the gobo is projected across (the cone angle). The square image fills this angle edge to edge; with real-world scale on, the tile repeats inside it at its true size.'},
    {k:'shape', l:'Beam shape', opts:['Round cone', 'Square (whole image)'], h:'Round: the cone trims the gobo to a circle inscribed in the image, as most spotlights do. Square: the full image is projected.'},
    {k:'soft', l:'Edge softness', min:0, max:1, step:0.01, h:'Fraction of the beam radius over which the cone edge fades out.'},
    ...(real ? [] : [{k:'rep', l:'Gobo tiling', min:1, max:12, step:0.05, fmt:v => v.toFixed(2) + '×', h:'How many copies of the tile fit across the projection.'}]),
  ); else if (!real) light.push(
    {k:'sunScale', l:'Pattern scale', min:0.25, max:4, step:0.01, log:true, fmt:v => v.toFixed(2) + '× real size', h:'1× lays one tile over its true size in metres (as measured across the beam).'},
  );
  light.push(
    {k:'blur', l:'Gobo blur', min:0, max:5, step:0.05, u:'%', h:'Defocus of the gobo image, as a percentage of the image width. Real projectors throw a slightly soft image; these gobos already contain the sun\'s own blur.'},
    {k:'roll', l:'Gobo rotation', min:-180, max:180, step:1, u:'°', h:'Rotates the image around the light\'s axis.'},
    {k:'ev', l:'Intensity', min:-6, max:6, step:0.1, fmt:v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' EV', h:sun ? 'Irradiance in stops.' : 'Stops. At 0 EV the light gives an irradiance of 1 at 5 m; it falls off with the inverse square of distance.'},
    {k:'color', l:'Light colour', type:'color', h:'The gobo multiplies the light\'s colour, as when a texture is assigned to the light colour.'},
  );
  const place = [];
  if (!sun) place.push({k:'dist', l:'Distance to aim point', min:0.5, max:40, step:0.05, log:true, u:'m'});
  const fol = sun && canFollow();
  if (fol) place.push({k:'follow', l:'Use the pattern\'s sun angle', type:'chk', h:'Points the scene sun the way the pattern was made, so the shadow lands with its true shape.'});
  place.push(
    ...(fol && SC().follow ? [] : [{k:'az', l:sun ? 'Sun azimuth' : 'Placement azimuth', min:shot ? -180 : -85, max:shot ? 180 : 85, step:0.5, u:'°', h:shot ? 'Around the aim point, measured in the shot\'s world axes.' : 'Around the aim point; 0° is straight out from the wall.'},
    {k:'el', l:sun ? 'Sun elevation' : 'Placement elevation', min:sun && S.mode !== 'hull' ? 2 : -89, max:90, step:0.5, u:'°', h:sun ? 'Height of the sun above the horizon.' : 'Angle of the light above the aim point; negative puts it below, pointing up (as for light reflected off water).'}]),
    ...(shot ? [{type:'note', l:fol && SC().follow && shotAnchor(S.mode) ? `The pattern's sun is lined up with the shot's ${S.mode === 'hull' ? 'hull at the waterline' : 'window'}, so the light comes in where it would. Turn off "Use the pattern's sun angle" to place the light freely.` : `${sun ? 'Pattern centre' : 'Aimed at'} ${[SC().aimX, SC().aimY, SC().aimZ].map(v => v.toFixed(2)).join(', ')} m. Click anywhere in the shot to aim there.`}] : [
    {k:'aimX', l:sun ? 'Pattern centre X' : 'Aim point X', min:-6, max:6, step:0.05, u:'m', h:'Left/right.'},
    {k:'aimY', l:sun ? 'Pattern centre Y' : 'Aim point Y', min:0, max:5, step:0.05, u:'m', h:'Height above the floor or water.'},
    {k:'aimZ', l:sun ? 'Pattern centre Z' : 'Aim point Z', min:-1, max:8, step:0.05, u:'m', h:'Distance out from the wall.'}]),
  );
  const sa = shotActive();
  const set = [
    ...(sa ? [] : [{k:'set', l:'Set', opts:SETS, h:'Simple stand-in sets. Pick a shot in the Shot menu at the top to light a shot instead.'}, {k:'sphere', l:'Test sphere', type:'chk'}]),
    {k:'gizmo', l:'Show light', type:'chk'},
    ...(sa ? [] : [{k:'haze', l:'Atmospheric haze', min:0, max:1, step:0.01, h:'Single scattering in the air, so the projected beam becomes visible.'}]),
    {k:'amb', l:'Fill light', min:0, max:1, step:0.01, h:'Soft ambient fill so unlit areas are not black.'},
    {k:'alb', l:shot && SHOT.frame.hasCol ? 'Surface colour gain' : 'Surface grey', min:0.05, max:0.9, step:0.01, h:shot && SHOT.frame.hasCol ? 'Scales the shot\'s surface colour; 0.5 uses it as rendered.' : 'Albedo of the set.'},
    {k:'expo', l:'Camera exposure', min:-4, max:4, step:0.1, fmt:v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' EV'},
  ];
  const out = [{name:'Scene light', params:light}, {name:'Light placement', params:place}, {name:sa ? 'Display' : 'Set & camera', params:set}];
  return sa ? [{name:'Shot', params:shotDefs(), shot:true}, ...out] : out;
};
const hex3 = h => { const n = parseInt((h || '#ffffff').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); };
const v3 = {
  sub:(a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add:(a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul:(a, s) => [a[0] * s, a[1] * s, a[2] * s], dot:(a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross:(a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm:a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
function basis(f, roll = 0) {
  const up = Math.abs(f[1]) > 0.995 ? [0, 0, -1] : [0, 1, 0];
  let r = v3.norm(v3.cross(f, up)), u = v3.cross(r, f);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [r, u] = [v3.add(v3.mul(r, c), v3.mul(u, s)), v3.sub(v3.mul(u, c), v3.mul(r, s))]; }
  return {r, u};
}
const sceneTile = () => MODES[S.mode].kind === 'windows' ? (WIN.cover || 3) : MODES[S.mode].kind === 'trees' && TR.frame && TR.frame.fit < 1 ? S.p[S.mode].tileSize * TR.frame.fit : (S.p[S.mode].tileSize || 3);
function sceneLight() {
  const c = SC(), aim = [c.aimX, c.aimY, c.aimZ];
  const P = S.p[S.mode], fol = followsSun();
  const hull = S.mode === 'hull' && fol && !shotActive();
  // hulls and walls are lit by the sun mirrored in the water: from below, with the pattern starting at the waterline
  const az = (hull ? 0 : fol ? (P.sunAz !== undefined ? P.sunAz : c.az) : c.az) * DEG, el = (fol ? (hull ? -P.sunElev : P.sunElev) : c.el) * DEG;
  if (hull) { aim[1] = 0.5 * sceneTile() * c.sunScale; aim[2] = 0; }
  // in a shot, the pattern's sun is turned to match the shot's own window or hull, and centred on it
  const an = fol && shotAnchor(S.mode);
  if (an) {
    if (S.mode === 'hull') {
      const az2 = an.azOff * DEG, el2 = -P.sunElev * DEG, a = [an.at[0], an.at[1] + 0.5 * sceneTile() * c.sunScale, an.at[2]];
      const dir = [Math.cos(el2) * Math.sin(az2), Math.sin(el2), Math.cos(el2) * Math.cos(az2)], f = v3.mul(dir, -1);
      return {aim:a, pos:v3.add(a, v3.mul(dir, c.dist)), f, ...basis(f, c.roll * DEG)};
    }
    const az2 = (an.azOff + (P.sunAz !== undefined ? P.sunAz : c.az)) * DEG, el2 = P.sunElev * DEG;
    const dir = [Math.cos(el2) * Math.sin(az2), Math.sin(el2), Math.cos(el2) * Math.cos(az2)], f = v3.mul(dir, -1);
    return {aim:[...an.at], pos:v3.add(an.at, v3.mul(dir, c.dist)), f, ...basis(f, c.roll * DEG)};
  }
  const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];   // aim → light
  const pos = v3.add(aim, v3.mul(dir, c.dist));
  const f = v3.mul(dir, -1);
  return {aim, pos, f, ...basis(f, c.roll * DEG)};
}
function camPos(cam) {
  const ca = cam.az * DEG, ce = cam.el * DEG;
  const t0 = [cam.tx, cam.ty, cam.tz];
  const p = v3.add(t0, v3.mul([Math.cos(ce) * Math.sin(ca), Math.sin(ce), Math.cos(ce) * Math.cos(ca)], cam.dist));
  if (!inShot()) p[1] = Math.max(p[1], 0.08);
  return {p, t0};
}
let LASTSCENE = null, VIEWCAM = null;
function drawScene(fin) {
  const c = SC(), L = sceneLight(), cam = CAM();
  if (c.ltype === 1 && c.el < 2) c.el = 2;
  const {p:cpos, t0} = camPos(cam);
  const cf = v3.norm(v3.sub(t0, cpos)), cb = basis(cf);
  const tile0 = sceneTile();
  // a framed gobo (single element, light pool, a window) fills the projection angle; when the framing first
  // switches to one, the spot opens up to about twice the gobo's real width, so it reaches the ground and wall around the subject
  const framed = sceneFramed();
  if (c._framed !== framed) {
    c._framed = framed;
    if (framed && c.ltype === 0 && c.real) { c.cone = clamp(+(2 * Math.atan(tile0 / c.dist) / DEG).toFixed(1), 50, 100); setTimeout(buildPanel, 0); }
  }
  const G = goboProjection(c), {cone, rep, tanC, single, sunSize, sunScale} = G, kind = MODES[S.mode].kind;
  const blur = c.blur / 100 * (c.ltype === 1 ? 1 : rep);
  const lod = c.blur > 0 ? lodFor(blur, fin.w, 12, 1) : 0;
  const tile = sceneTile(), what = kind === 'windows' ? 'the gobo' : 'one tile';
  const lightLines = () => c.ltype === 1 ? [`Scene: sun at ${(followsSun() ? S.p[S.mode].sunElev : c.el).toFixed(1)}° elevation · ${what} spans ${(tile * sunScale).toFixed(2)} m across the beam (real size ${tile.toFixed(2)} m)`]
    : [`Scene: spotlight ${c.dist.toFixed(2)} m from the aim point · the ${cone.toFixed(1)}° projection is ${(2 * c.dist * tanC).toFixed(2)} m wide there`,
       `${what[0].toUpperCase() + what.slice(1)} spans ${(2 * c.dist * tanC / rep).toFixed(2)} m at the aim point (real size ${tile.toFixed(2)} m${Math.abs(2 * c.dist * tanC / rep - tile) / tile < 0.03 ? ', matched' : ''})`];
  LASTSCENE = {L, tanC, rep, sunSize, ltype:c.ltype, cpos, cf, cb};
  // how the preview camera maps world points to the screen (for the light manipulator)
  { const tf = Math.tan(20 * DEG);
    VIEWCAM = {pos:cpos, f:cf, r:cb.r, u:cb.u, project:X => { const v = v3.sub(X, cpos), z = v3.dot(v, cf); if (z <= 1e-3) return null;
      const sx = v3.dot(v, cb.r) / (z * tf), sy = v3.dot(v, cb.u) / (z * tf); return [(sx * cv.height + cv.width) / 2, (sy * cv.height + cv.height) / 2, z]; },
      ray:(fx, fy) => { const sx = (fx * 2 - cv.width) / cv.height, sy = (fy * 2 - cv.height) / cv.height; return {ro:cpos, rd:v3.norm(v3.add(cf, v3.add(v3.mul(cb.r, tf * sx), v3.mul(cb.u, tf * sy))))}; }}; }
  if (shotActive()) {
    shotSync();
    if (shotReady()) { drawShot(fin, c, L, {tanC, rep, blur, lod, single, sunSize}); return [SHOT.status, ...lightLines()]; }
    bindTarget(null); gl.clearColor(0.03, 0.035, 0.04, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return [SHOT.status || 'Building the shot…'];
  }
  pass(PR.scene, null, p => {
    tex(p, 'uGobo', fin.tex, 0);
    f3(p, 'uCamPos', ...cpos); f3(p, 'uCamF', ...cf); f3(p, 'uCamR', ...cb.r); f3(p, 'uCamU', ...cb.u); f1(p, 'uTanF', Math.tan(20 * DEG));
    i1(p, 'uType', c.ltype); i1(p, 'uShape', c.shape); i1(p, 'uSingle', single); i1(p, 'uSet', c.set | 0);
    i1(p, 'uSphere', c.sphere && c.set < 2 ? 1 : 0); i1(p, 'uGizmo', c.gizmo ? 1 : 0);
    f3(p, 'uLPos', ...L.pos); f3(p, 'uLF', ...L.f); f3(p, 'uLR', ...L.r); f3(p, 'uLU', ...L.u); f3(p, 'uAim', ...L.aim);
    f3(p, 'uLCol', ...hex3(c.color));
    f1(p, 'uTanC', tanC); f1(p, 'uSoft', c.soft); f1(p, 'uRep', rep); f1(p, 'uBlur', blur); f1(p, 'uBlurLod', lod);
    f1(p, 'uI', Math.pow(2, c.ev) * (c.ltype === 1 ? 1 : 25)); f1(p, 'uSunSize', sunSize); f1(p, 'uSrcR', 0.04);
    gl.uniform4f(p.u('uSph'), ...(MODE_SPHERE[S.mode] && (MODE_SCENE[S.mode] || {}).set === (c.set | 0) ? MODE_SPHERE[S.mode] : SET_SPHERE[c.set | 0]));
    f1(p, 'uAlb', c.alb); f1(p, 'uAmb', c.amb); f1(p, 'uHaze', c.haze); f1(p, 'uExpo', c.expo); f1(p, 'uT', S.t); f1(p, 'uGoboRes', fin.w);
  });
  return lightLines();
}
/* How the scene light projects the gobo: shared by the preview, the light rig export and any host.
   Spotlight: a point in light space (x right, y up, z forward) lands on gobo uv = 0.5 + 0.5 * (x, y) / (z * tanC) * rep.
   Sun: a point p lands on uv = 0.5 + (dot(p - aim, right), dot(p - aim, up)) / sunSize.
   wrap: 0 repeat, 1 white outside the image, 2 black outside, 3 repeat across but black above and below. */
function goboProjection(c = SC()) {
  const framed = sceneFramed(), tile0 = sceneTile(), kind = MODES[S.mode].kind;
  let cone = c.cone, rep = c.rep, sunScale = c.sunScale;
  if (c.real) {
    sunScale = 1;
    if (c.ltype === 0) rep = framed ? 1 : Math.max(1, 2 * c.dist * Math.tan(cone * 0.5 * DEG) / tile0);
  }
  const single = S.mode === 'hull' ? (S.p.hull.fade > 0 && !shotActive() ? 2 : 3) : kind === 'windows' || usesPool() || (kind === 'shapes' && !SHAPE_SEAMLESS[S.p.shapes.shape | 0]) ? 2 : kind === 'trees' && (S.p[S.mode].framing | 0) === 1 ? 1 : 0;
  const sunSize = tile0 * sunScale * (S.mode === 'hull' && followsSun() ? Math.cos(S.p.hull.sunElev * DEG) : 1);
  return {cone, tanC:Math.tan(cone * 0.5 * DEG), rep, sunScale, sunSize, single, framed, tile:tile0};
}
// gobos that are a single framed image rather than a repeating tile
function sceneFramed() {
  const k = MODES[S.mode].kind, P = S.p[S.mode];
  return k === 'windows' || usesPool() || (k === 'trees' && (P.framing | 0) === 1) || (k === 'shapes' && !SHAPE_SEAMLESS[P.shape | 0]) || (S.mode === 'hull' && P.fade > 0);
}
function matchScale() {
  const c = SC();
  if (c.ltype === 1) c.sunScale = 1;
  else {
    const w = 2 * c.dist * Math.tan(c.cone * 0.5 * DEG), tile = sceneTile();
    if (MODES[S.mode].kind === 'windows') c.cone = clamp(+(2 * Math.atan(tile / (2 * c.dist)) / DEG).toFixed(1), 5, 160), c.rep = 1;
    else c.rep = clamp(+(w / tile).toFixed(2), 1, 12);
  }
}

/* camera: Maya controls (Alt + left tumble, Alt + middle track, Alt + right dolly, wheel zoom), plus plain
   left drag to orbit and right, middle or shift drag to pan; double-click resets. Dragging or zooming while
   looking through a shot camera leaves it for the orbit view, starting exactly where the shot camera is. */
(() => {
  let drag = null;
  cv.addEventListener('contextmenu', e => { if (S.view === 'scene') e.preventDefault(); });
  cv.addEventListener('mousedown', e => { if (S.view === 'scene' && e.button === 1) e.preventDefault(); });
  const shotCamView = () => inShot() && (S.shot.view | 0) === 0;
  const leaveShotCam = () => { S.shotCams[S.shotSel] = shotOrbitCam(); S.shot.view = 1; buildPanel(); };
  cv.addEventListener('pointerdown', e => {
    if (S.view !== 'scene' || (scenePaintOn() && !e.altKey && e.button === 0)) return;
    const mode = e.altKey ? ['orbit', 'pan', 'dolly'][e.button] || 'orbit' : e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
    drag = {x:e.clientX, y:e.clientY, mode, cam:null};
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 1 / cv.clientHeight;
    if (!drag.cam) {
      if (Math.hypot(dx, dy) < 3) return;
      if (shotCamView()) leaveShotCam();
      drag.cam = {...CAM()};
    }
    const cam = CAM(), sh = inShot();
    if (drag.mode === 'pan') {
      const ca = drag.cam.az * DEG, ce = drag.cam.el * DEG;
      const f = v3.mul([Math.cos(ce) * Math.sin(ca), Math.sin(ce), Math.cos(ce) * Math.cos(ca)], -1), b = basis(f);
      const s = 2 * Math.tan((sh ? (SHOT.vfov || 40) / 2 : 20) * DEG) * drag.cam.dist * k;
      const m = v3.add(v3.mul(b.r, -dx * s), v3.mul(b.u, dy * s));
      if (sh) { cam.tx = drag.cam.tx + m[0]; cam.ty = drag.cam.ty + m[1]; cam.tz = drag.cam.tz + m[2]; }
      else { cam.tx = clamp(drag.cam.tx + m[0], -8, 8); cam.ty = clamp(drag.cam.ty + m[1], 0, 6); cam.tz = clamp(drag.cam.tz + m[2], -1, 10); }
    } else if (drag.mode === 'dolly') {
      const d = drag.cam.dist * Math.exp(-(dx + dy) * k * 2.5);
      cam.dist = sh ? clamp(d, 0.2, 5000) : clamp(d, 1, 30);
    } else if (sh) {
      cam.az = drag.cam.az - dx * k * 180;
      cam.el = clamp(drag.cam.el + dy * k * 120, -89, 89);
    } else {
      cam.az = clamp(drag.cam.az - dx * k * 180, -85, 85);
      cam.el = clamp(drag.cam.el + dy * k * 120, -40, 89);
    }
    viewDirty = true;
  });
  const end = () => { if (drag) { if (drag.cam) save(); drag = null; } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    if (S.view !== 'scene') return;
    e.preventDefault();
    if (shotCamView()) leaveShotCam();
    CAM().dist = inShot() ? clamp(CAM().dist * Math.exp(e.deltaY * 0.0012), 0.2, 5000) : clamp(CAM().dist * Math.exp(e.deltaY * 0.0012), 1, 30); viewDirty = true; save();
  }, {passive:false});
  cv.addEventListener('dblclick', () => { if (S.view !== 'scene' || scenePaintOn()) return; if (shotActive()) { delete S.shotCams[S.shotSel]; } else S.cams[S.mode] = camDefault(S.mode); viewDirty = true; save(); });
})();
