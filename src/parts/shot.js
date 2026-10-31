/* =====================================================================
   YOUR SHOT
   Load the utility passes of a rendered shot (world position, normals,
   optionally depth, surface colour and alpha; one frame or a sequence).
   Everything is read in this browser tab; nothing is uploaded. The shot
   camera is solved from the position pass alone (a direct linear
   transform: every pixel is a known 3D point seen at a known 2D spot),
   and the pixels become a rough 3D mesh of what the camera sees. The
   gobo light then lights that mesh, with shadows cast by the shot's own
   geometry (a shadow map rendered from the light), seen either through
   the shot camera or orbiting freely.
   ===================================================================== */
const SHOT = {src:null, frames:[], cache:new Map(), frame:null, loading:null, status:'', tex:null};
if (!S.shot) S.shot = {};
S.shot = {view:0, detail:1, disp:0, ...S.shot};
S.shotSel = S.shotSel || ''; S.shotLights = S.shotLights || {}; S.shotCams = S.shotCams || {}; S.tlBackup = S.tlBackup || {};
const DETAIL = [1, 2, 4];
const shotReady = () => !!(SHOT.frame && SHOT.tex);
const shotActive = () => !!S.shotSel && !!SHOT.src;

/* ---------- The shot list ----------
   In production this list would come from the pipeline (show / sequence / shot), and picking a shot would read
   that shot's utility passes from disk. Here it holds placeholder shots of a little scene built for this mockup:
   their utility passes are rendered on the fly, then go through exactly the same steps a real shot's would
   (camera solved from the position pass, pixels turned into a rough model). */
const SHOTS = [
  {id:'ph_court_mid', placeholder:true, seq:'court010', shot:'sh0020', mode:'trees', scene:0, label:'court010 / sh0020 · person in a courtyard, mid shot (tree dapple)', first:1001, last:1001,
   cam:{eye:[0.8, 1.48, 2.15], at:[0.0, 1.3, 0.0], vfov:30},
   // one big tree overhead, framed in open sunlight, so its shadow covers the person
   preset:{mode:'trees', name:'Oak canopy overhead', v:{framing:1, tileSize:15.5, leafDensity:0.45, elemSize:0.75}},
   lights:{trees:{ltype:1, follow:true, aim:[0, 1.35, 0], amb:0.2}}},
  {id:'ph_room', placeholder:true, seq:'house030', shot:'sh0010', mode:'windows', scene:2, label:'house030 / sh0010 · living room, faked window light', first:1001, last:1001,
   cam:{eye:[1.35, 1.45, 2.3], at:[-0.7, 0.62, -1.3], vfov:50}, preset:{mode:'windows', name:'Tall French window'},
   // the window is behind the camera, off screen: only the gobo says it is there
   anchors:{windows:{at:[0.1, 1.25, 2.85], azOff:0}}, lights:{windows:{ltype:1, follow:true, amb:0.14, ev:1}}},
];
// the shots the host offers (the placeholders on the web); filled in when the host answers
let SHOTLIST = [];
const shotDef = id => SHOTLIST.find(x => x.id === id);
// where a pattern's own light geometry sits in a shot: the window opening, or the hull at the waterline
const shotAnchor = m => (shotActive() && (shotDef(S.shotSel).anchors || {})[m]) || null;
// the per-shot light for a pattern, and the shared orbit camera; both are made on first use from the shot itself
function shotLight(m) {
  const k = S.shotSel, all = (S.shotLights[k] = S.shotLights[k] || {});
  if (all[m]) return all[m];
  const d = {...sceneDefaults(m), sphere:false, follow:false, amb:0.22};
  if (!SHOT.frame) return ((SHOT.tmpL = SHOT.tmpL || {})[m] = SHOT.tmpL[m] || d);
  shotDefaultLight(d, SHOT.frame);
  // each placeholder shot comes with a light already set up for the pattern it was made for
  const o = (shotDef(k).lights || {})[m];
  if (o) { const {aim, ...rest} = o; Object.assign(d, rest); if (aim) [d.aimX, d.aimY, d.aimZ] = aim; }
  const an = shotAnchor(m); if (an) [d.aimX, d.aimY, d.aimZ] = an.at;
  return (all[m] = d);
}
function shotCam() {
  const k = S.shotSel;
  if (S.shotCams[k]) return S.shotCams[k];
  const oc = shotOrbitCam();
  if (!oc) return (SHOT.tmpCam = SHOT.tmpCam || {...SET_CAMS[1]});
  return (S.shotCams[k] = oc);
}
// aim at the middle of the shot, with the light up and to one side of the camera
function shotDefaultLight(sc, fr) {
  sc.aimX = fr.mid[0]; sc.aimY = fr.mid[1]; sc.aimZ = fr.mid[2];
  const d = v3.sub(fr.Cm, fr.mid);
  sc.az = Math.round(((Math.atan2(d[0], d[2]) / DEG + 35 + 540) % 360) - 180);
  sc.el = sc.ltype === 1 ? 45 : 55;
  // a spot pool at least one gobo tile wide, and about 40% of the frame where it is aimed
  const seen = 2 * Math.hypot(...d) * Math.tan(fr.cam.vfov * DEG / 2) * fr.W / fr.H;
  sc.dist = clamp(+(Math.max(0.4 * seen, sceneTile()) / (2 * Math.tan(sc.cone * DEG / 2))).toFixed(2), 0.5, 40);
  // and bright enough there: an irradiance of 1 at the aim point, as the simple sets have at 5 m
  sc.ev = sc.ltype === 0 ? +clamp(Math.log2(sc.dist * sc.dist / 25), -6, 6).toFixed(1) : 0;
  return sc;
}
function selectShot(id, fromMenu) {
  const def = shotDef(id);
  SHOT.cache = new Map(); SHOT.frame = null; SHOT.loading = null; SHOT.tmpL = null; SHOT.tmpCam = null;
  if (SHOT.tex) { Object.values(SHOT.tex).forEach(t => gl.deleteTexture(t)); SHOT.tex = null; }
  if (!def) {
    S.shotSel = ''; SHOT.src = null; SHOT.frames = [];
    // the patterns get their own timeline lengths back
    for (const [m, len] of Object.entries(S.tlBackup)) if (S.tl[m]) S.tl[m].len = len;
    S.tlBackup = {};
  } else {
    S.shotSel = id; SHOT.src = HOST.openShot(def);
    SHOT.frames = []; for (let n = def.first; n <= def.last; n++) SHOT.frames.push(n);
    SHOT.status = `Building ${def.seq} / ${def.shot} from its utility passes…`;
    SHOT.panelBuilt = false; S.shot.view = 0;
    // picking a shot from the menu switches to the pattern it was set up for
    if (fromMenu && def.mode && MODES[def.mode]) { S.mode = def.mode; buildModes(); }
    if (fromMenu && def.preset) {
      const ps = MODES[def.preset.mode].presets.find(x => x.name === def.preset.name);
      if (ps) S.p[def.preset.mode] = {...DEFAULTS[def.preset.mode], ...ps.v, ...(def.preset.v || {}), seed:S.p[def.preset.mode].seed};
    }
    if (S.view !== 'scene') setView('scene');
  }
  const sel = $('shotSel'); if (sel) sel.value = S.shotSel;
  document.body.classList.toggle('has-shot', !!S.shotSel);
  document.body.classList.toggle('ph-shot', !!(def && def.placeholder));
  syncShotTimeline(); buildTimeline(); buildPanel(); dirty = true; viewDirty = true; save();
}
// while a shot is selected the timeline runs over its frame range
function syncShotTimeline() {
  if (!shotActive() || SHOT.frames.length < 2) {
    // a single frame shot leaves the pattern's own timeline alone
    if (S.tlBackup[S.mode] !== undefined) { TL().len = S.tlBackup[S.mode]; delete S.tlBackup[S.mode]; if ($('timeline')) buildTimeline(); }
    return;
  }
  const L = SHOT.frames.length / S.fps;
  if (Math.abs(TL().len - L) < 1e-9) return;
  if (!(S.mode in S.tlBackup)) S.tlBackup[S.mode] = TL().len;
  TL().len = L; S.t = S.t % L;
  if (typeof buildTimeline === 'function' && $('timeline')) buildTimeline();
}
/* How a real shot is read: its utility EXRs (position, normals, surface colour), found by the pipeline.
   filesByFrame: Map(frame number → [objects with arrayBuffer(), e.g. File or a fetch Response]);
   layers: the EXR layer names, {pos, nrm?, col?}; opts: {units, upZ, camera(frame)} as in HOST.openShot.
   The web version only uses the placeholder source below; a production host returns one of these. */
function exrSource(filesByFrame, layers, opts = {}) {
  return {units:opts.units || 0, upZ:!!opts.upZ, camera:opts.camera || null, async read(n, step) {
    const got = {};
    for (const file of filesByFrame.get(n) || []) {
      const e = EXR.open(await file.arrayBuffer()), L = EXR.layers(e);
      for (const k of ['pos', 'nrm', 'col']) {
        if (got[k] || !layers[k]) continue;
        const l = L.find(x => x.name === layers[k]); if (!l) continue;
        const names = l.comps.map(c => c.comp.toLowerCase());
        const pick = ks => { for (const q of ks) { const i = names.indexOf(q); if (i >= 0) return l.comps[i].full; } return null; };
        got[k] = await EXR.read(e, l.part, [pick(['r', 'x']), pick(['g', 'y']), pick(['b', 'z'])], step);
      }
    }
    return got;
  }};
}
// each frame is decoded once; asking again while it is being read waits for that read
function decodeFrame(n) {
  const key = [S.shotSel, n, S.shot.detail].join('|');
  if (!SHOT.cache.has(key)) {
    const pr = decodeFrameNow(n, key);
    SHOT.cache.set(key, pr);
    pr.catch(() => SHOT.cache.delete(key));
    if (SHOT.cache.size > 8) SHOT.cache.delete(SHOT.cache.keys().next().value);
  }
  return SHOT.cache.get(key);
}
async function decodeFrameNow(n, key) {
  const step = DETAIL[S.shot.detail | 0] || 2;
  const src = SHOT.src, got = await src.read(n, step);
  if (!got.pos) throw new Error(`Frame ${n} has no position pass.`);
  const W = got.pos.W, H = got.pos.H, N = W * H;
  const [px, py, pz] = got.pos.data;
  const A = got.a ? got.a.data[0] : null, MT = got.matte ? got.matte.data[0] : null;
  // which pixels hold geometry
  const valid = new Uint8Array(N);
  for (let i = 0; i < N; i++) valid[i] = (!A || A[i] > 0.002) && isFinite(px[i] + py[i] + pz[i]) && (px[i] !== 0 || py[i] !== 0 || pz[i] !== 0) ? 1 : 0;
  // the shot camera: from the pipeline when the host has it, otherwise solved from the raw positions (scale-free)
  const hc = src.camera ? await src.camera(n) : null;
  const cam = hc ? cameraFromHost(hc, W, H) : solveCamera(px, py, pz, valid, W, H);
  // pixels whose position does not project back onto themselves blend two surfaces (or a surface and the sky): drop them
  { const Pm = cam.P;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!valid[i]) continue;
      const q0 = Pm[0][0] * px[i] + Pm[0][1] * py[i] + Pm[0][2] * pz[i] + Pm[0][3], q1 = Pm[1][0] * px[i] + Pm[1][1] * py[i] + Pm[1][2] * pz[i] + Pm[1][3], q2 = Pm[2][0] * px[i] + Pm[2][1] * py[i] + Pm[2][2] * pz[i] + Pm[2][3];
      if (q2 === 0 || Math.abs(q0 / q2 - x - 0.5) > 1.5 || Math.abs(q1 / q2 - y - 0.5) > 1.5) valid[i] = 0;
    } }
  let um = src.units || 0;
  if (!um) {
    const ds = []; for (let i = 0; i < N; i += 97) if (valid[i]) ds.push(Math.hypot(px[i] - cam.C[0], py[i] - cam.C[1], pz[i] - cam.C[2]));
    ds.sort((a, b) => a - b); const med = ds[ds.length >> 1] || 1;
    um = med > 2500 ? 0.001 : med > 60 ? 0.01 : 1;       // a shot's typical distance is 1–60 m
  }
  const upZ = !!src.upZ;
  const tr = (x, y, z) => upZ ? [x * um, z * um, -y * um] : [x * um, y * um, z * um];
  const Cm = tr(...cam.C);
  const P = new Float32Array(N * 4), Nn = new Float32Array(N * 4), C = new Uint8Array(N * 4);
  let bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
  for (let i = 0; i < N; i++) {
    if (!valid[i]) continue;
    const q = tr(px[i], py[i], pz[i]);
    P[i * 4] = q[0]; P[i * 4 + 1] = q[1]; P[i * 4 + 2] = q[2]; P[i * 4 + 3] = MT && MT[i] > 0.5 ? 0.75 : 1;
    for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], q[k]); bmax[k] = Math.max(bmax[k], q[k]); }
  }
  // normals: the layer if there is one, else from the shape of the position pass
  if (got.nrm) {
    const [nx, ny, nz] = got.nrm.data;
    for (let i = 0; i < N; i++) { const q = upZ ? [nx[i], nz[i], -ny[i]] : [nx[i], ny[i], nz[i]]; const l = Math.hypot(...q) || 1; Nn[i * 4] = q[0] / l; Nn[i * 4 + 1] = q[1] / l; Nn[i * 4 + 2] = q[2] / l; }
  } else {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!P[i * 4 + 3]) continue;
      const r = x + 1 < W && P[(i + 1) * 4 + 3] ? i + 1 : i - 1, d = y + 1 < H && P[(i + W) * 4 + 3] ? i + W : i - W;
      if (r < 0 || d < 0) continue;
      const a = [0, 1, 2].map(k => P[r * 4 + k] - P[i * 4 + k]), b = [0, 1, 2].map(k => P[d * 4 + k] - P[i * 4 + k]);
      let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const tc = [0, 1, 2].map(k => Cm[k] - P[i * 4 + k]);
      if (n[0] * tc[0] + n[1] * tc[1] + n[2] * tc[2] < 0) n = n.map(v => -v);
      const l = Math.hypot(...n) || 1; Nn[i * 4] = n[0] / l; Nn[i * 4 + 1] = n[1] / l; Nn[i * 4 + 2] = n[2] / l;
    }
  }
  if (got.col) {
    const [r, g, b] = got.col.data;
    for (let i = 0; i < N; i++) { const s = v => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2)); C[i * 4] = s(r[i]); C[i * 4 + 1] = s(g[i]); C[i * 4 + 2] = s(b[i]); C[i * 4 + 3] = 255; }
  } else C.fill(150);
  // robust extent of the shot (a few far background pixels should not set the scale)
  const smp = [[], [], []], dist = [];
  for (let i = 0; i < N; i += 7) if (P[i * 4 + 3]) { for (let k = 0; k < 3; k++) smp[k].push(P[i * 4 + k]); dist.push(Math.hypot(P[i * 4] - Cm[0], P[i * 4 + 1] - Cm[1], P[i * 4 + 2] - Cm[2])); }
  const pct = (v, q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  smp.forEach(v => v.sort((x, y) => x - y)); dist.sort((x, y) => x - y);
  const lo = smp.map(v => pct(v, 0.03)), hi = smp.map(v => pct(v, 0.97));
  const fr = {n, W, H, P, N:Nn, C, cam, Cm, um, bmin, bmax, hasNrm:!!got.nrm, hasCol:!!got.col,
              R:Math.max(0.5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2), ctr:[0, 1, 2].map(k => (lo[k] + hi[k]) / 2), dMed:pct(dist, 0.5) || 5};
  // default aim: in the middle of the frame, at the shot's typical distance (where the action usually is)
  let mid = null, best = 1e30;
  for (let y = Math.floor(H * 0.4); y < H * 0.85; y += 2) for (let x = Math.floor(W * 0.3); x < W * 0.7; x += 2) {
    const i = y * W + x; if (!P[i * 4 + 3]) continue;
    const dd = Math.hypot(P[i * 4] - Cm[0], P[i * 4 + 1] - Cm[1], P[i * 4 + 2] - Cm[2]);
    const sc = Math.abs(Math.log(dd / fr.dMed)) + 0.6 * Math.hypot(x / W - 0.5, y / H - 0.6);
    if (sc < best) { best = sc; mid = [P[i * 4], P[i * 4 + 1], P[i * 4 + 2]]; }
  }
  fr.mid = mid || fr.ctr;
  // orbit around a point on the camera's centre line at the typical distance
  const fwd = upZ ? [cam.fwd[0], cam.fwd[2], -cam.fwd[1]] : cam.fwd;
  fr.pivot = Cm.map((v, k) => v + fwd[k] * fr.dMed);
  return fr;
}
function shotUpload(fr) {
  const mk = (data, ifmt, fmt, type) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, fr.W, fr.H, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  if (SHOT.tex) Object.values(SHOT.tex).forEach(t => gl.deleteTexture(t));
  SHOT.tex = {P:mk(fr.P, gl.RGBA32F, gl.RGBA, gl.FLOAT), N:mk(fr.N, gl.RGBA32F, gl.RGBA, gl.FLOAT), C:mk(fr.C, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)};
  SHOT.frame = fr;
}
async function shotShowFrame(n) {
  SHOT.loading = n;
  const sel = S.shotSel;
  try {
    const fr = await decodeFrame(n);
    if (SHOT.loading !== n || S.shotSel !== sel) return;
    shotUpload(fr);
    SHOT.vfov = clamp(fr.cam.vfov, 10, 100);
    const c = fr.cam, def = shotDef(sel);
    SHOT.status = `${def.placeholder ? 'PLACEHOLDER SHOT' : 'Shot'} ${def.seq} / ${def.shot} · frame ${n} (${def.first}–${def.last}) · ${fr.W}×${fr.H}\n` +
                  (c.given ? `Shot camera from the ${def.placeholder ? 'placeholder scene' : 'pipeline'}: ${c.vfov.toFixed(1)}° vertical field of view`
                           : `Camera solved from the position pass: ${c.vfov.toFixed(1)}° vertical field of view, ${c.err.toFixed(2)} px error`);
  } catch (e) { console.error(e); SHOT.status = String(e.message || e); }
  SHOT.loading = null; viewDirty = true; dirty = true;
  // build the next frame of the sequence while this one is on screen
  const at = SHOT.frames.indexOf(n);
  if (SHOT.frames.length > 1 && at >= 0 && SHOT.cache.size < 8) decodeFrame(SHOT.frames[(at + 1) % SHOT.frames.length]).catch(() => {});
  if (S.view === 'scene' && !SHOT.panelBuilt) { SHOT.panelBuilt = true; buildPanel(); }
}
/* A camera handed over by the host (in the passes' own units and axes), turned into the same form the solve gives:
   P maps a point to pixel coordinates (x right, y down, pixel centres at +0.5), C is the eye. */
function cameraFromHost(c, W, H) {
  let eye, f, up;
  if (c.matrix) {
    const m = c.matrix;                      // rows: x axis, y axis, z axis, translation (camera looks down -z)
    eye = [m[3][0], m[3][1], m[3][2]]; f = v3.norm([-m[2][0], -m[2][1], -m[2][2]]); up = [m[1][0], m[1][1], m[1][2]];
  } else {
    eye = c.eye; f = v3.norm(c.forward || v3.sub(c.at, c.eye)); up = c.up || [0, 1, 0];
  }
  const r = v3.norm(v3.cross(f, up)), u = v3.cross(r, f);
  const fp = (H / 2) / Math.tan((c.vfov || 40) * DEG / 2);
  const t = [-v3.dot(r, eye), -v3.dot(u, eye), -v3.dot(f, eye)];
  const R = [[...r, t[0]], [...u, t[1]], [...f, t[2]]];
  const P = [0, 1, 2].map(i => [0, 1, 2, 3].map(j => i === 0 ? fp * R[0][j] + W / 2 * R[2][j] : i === 1 ? -fp * R[1][j] + H / 2 * R[2][j] : R[2][j]));
  const inv = inv3(P.map(row => row.slice(0, 3)));
  return {P, C:[...eye], inv, err:0, n:0, vfov:c.vfov || 40, fwd:f, up:u, given:true};
}
/* The shot camera from the position pass: a direct linear transform, solved with
   normalised coordinates (Hartley) and the eigenvector of AᵀA with the smallest eigenvalue. */
function solveCamera(px, py, pz, valid, W, H) {
  // sample pixels well inside surfaces: edge pixels of a filtered render blend two depths (or the sky) and lie on no surface
  const ok = k => valid[k] && valid[k - 1] && valid[k + 1] && valid[k - W] && valid[k + W];
  const flat = k => {
    // the point should sit between its neighbours, as on a smooth surface
    const e = Math.abs(px[k - 1] + px[k + 1] - 2 * px[k]) + Math.abs(py[k - 1] + py[k + 1] - 2 * py[k]) + Math.abs(pz[k - 1] + pz[k + 1] - 2 * pz[k]);
    const s = Math.hypot(px[k + 1] - px[k - 1], py[k + 1] - py[k - 1], pz[k + 1] - pz[k - 1]);
    return e <= 0.25 * s + 1e-9;
  };
  let pts = [];
  const gx = 48, gy = 32;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) for (let t = 0; t < 8; t++) {
    const x = clamp(Math.floor((i + (t ? Math.random() : 0.5)) / gx * W), 1, W - 2), y = clamp(Math.floor((j + (t ? Math.random() : 0.5)) / gy * H), 1, H - 2);
    const k = y * W + x; if (ok(k) && flat(k)) { pts.push([x + 0.5, y + 0.5, k]); break; }
  }
  if (pts.length < 12) throw new Error('Too little geometry in the position pass to solve the camera.');
  // solve, then drop the points that disagree and solve again
  let cam = null;
  for (let it = 0; it < 5; it++) {
    cam = dlt(pts, px, py, pz);
    const res = pts.map(([u, v, k]) => { const q = cam.P.map(r => r[0] * px[k] + r[1] * py[k] + r[2] * pz[k] + r[3]); return Math.hypot(q[0] / q[2] - u, q[1] / q[2] - v); });
    const srt = [...res].sort((a, b) => a - b), med = srt[srt.length >> 1];
    cam.err = med;
    const lim = Math.max(med * 3, 0.75);
    const keep = pts.filter((_, i) => res[i] <= lim);
    if (keep.length === pts.length || keep.length < 12) break;
    pts = keep;
  }
  const {P, inv, C} = cam;
  const ray = (u, v) => inv.map(r => r[0] * u + r[1] * v + r[2]);
  const [u0, v0, k0] = pts[0];
  let sg = 1; { const d = ray(u0, v0); if (d[0] * (px[k0] - C[0]) + d[1] * (py[k0] - C[1]) + d[2] * (pz[k0] - C[2]) < 0) sg = -1; }
  const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l * sg); };
  const rt = nrm(ray(W / 2, 0)), rb = nrm(ray(W / 2, H)), rc = nrm(ray(W / 2, H / 2));
  const vfov = Math.acos(clamp(rt[0] * rb[0] + rt[1] * rb[1] + rt[2] * rb[2], -1, 1)) / DEG;
  return {P, C, inv, err:cam.err, n:pts.length, vfov, fwd:rc, up:[rt[0] - rb[0], rt[1] - rb[1], rt[2] - rb[2]]};
}
/* Direct linear transform with normalised coordinates (Hartley): the eigenvector of AᵀA with the smallest eigenvalue. */
function dlt(idx, px, py, pz) {
  const n = idx.length;
  let m2 = [0, 0], m3 = [0, 0, 0];
  idx.forEach(([u, v, k]) => { m2[0] += u / n; m2[1] += v / n; m3[0] += px[k] / n; m3[1] += py[k] / n; m3[2] += pz[k] / n; });
  let d2 = 0, d3 = 0;
  idx.forEach(([u, v, k]) => { d2 += Math.hypot(u - m2[0], v - m2[1]) / n; d3 += Math.hypot(px[k] - m3[0], py[k] - m3[1], pz[k] - m3[2]) / n; });
  const s2 = Math.SQRT2 / d2, s3 = Math.sqrt(3) / d3;
  const M = Array.from({length:12}, () => new Float64Array(12));
  idx.forEach(([u0, v0, k]) => {
    const u = (u0 - m2[0]) * s2, v = (v0 - m2[1]) * s2;
    const X = [(px[k] - m3[0]) * s3, (py[k] - m3[1]) * s3, (pz[k] - m3[2]) * s3, 1];
    const r1 = [...X, 0, 0, 0, 0, ...X.map(a => -u * a)], r2 = [0, 0, 0, 0, ...X, ...X.map(a => -v * a)];
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) M[a][b] += r1[a] * r1[b] + r2[a] * r2[b];
  });
  const h = smallestEigvec(M);
  const Pn = [h.slice(0, 4), h.slice(4, 8), h.slice(8, 12)];
  const T3 = [[s3, 0, 0, -s3 * m3[0]], [0, s3, 0, -s3 * m3[1]], [0, 0, s3, -s3 * m3[2]], [0, 0, 0, 1]];
  const T2i = [[1 / s2, 0, m2[0]], [0, 1 / s2, m2[1]], [0, 0, 1]];
  const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)));
  const P = mul(mul(T2i, Pn), T3);
  const inv = inv3(P.map(r => r.slice(0, 3))), p4 = P.map(r => r[3]);
  const C = inv.map(r => -(r[0] * p4[0] + r[1] * p4[1] + r[2] * p4[2]));
  return {P, inv, C};
}
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C2 = d * h - e * g, det = a * A + b * B + c * C2;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C2 / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
function smallestEigvec(M0) {
  const n = 12, A = M0.map(r => Float64Array.from(r)), V = Array.from({length:n}, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  let best = 0; for (let i = 1; i < n; i++) if (A[i][i] < A[best][best]) best = i;
  return V.map(r => r[best]);
}

/* ---------- rendering ---------- */
const SHOT_LIGHT = `
uniform sampler2D uGobo, uShadow;
uniform int uType, uShape, uSingle;
uniform vec3 uLPos, uLF, uLR, uLU, uAim, uLCol;
uniform float uTanC, uSoft, uRep, uBlur, uBlurLod, uI, uSunSize, uGoboRes, uShT, uShHalf, uShFar, uShRes;
vec3 gobo(vec2 uv){
  if (uSingle == 3){ if (uv.y < 0.0 || uv.y > 1.0) return vec3(0.0); }
  else if (uSingle > 0 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) return vec3(uSingle == 1 ? 1.0 : 0.0);
  if (uBlur <= 0.0) return texture(uGobo, uv).rgb;
  vec3 s = vec3(0.0);
  for (int i = 0; i < 12; i++){ float rho = sqrt((float(i) + 0.5) / 12.0), th = float(i) * 2.39996323; s += textureLod(uGobo, uv + uBlur * rho * vec2(cos(th), sin(th)), uBlurLod).rgb; }
  return s / 12.0;
}
// where a point falls in the light's shadow map, and its depth there
vec3 shadowCoord(vec3 p){
  if (uType == 0){ vec3 v = p - uLPos; float z = dot(v, uLF); if (z <= 1e-4) return vec3(-1.0); return vec3(0.5 + 0.5 * vec2(dot(v, uLR), dot(v, uLU)) / (z * uShT), z); }
  vec3 v = p - uAim; return vec3(0.5 + 0.5 * vec2(dot(v, uLR), dot(v, uLU)) / uShHalf, dot(v, uLF) + 0.5 * uShFar);
}
float shadowAt(vec3 p, vec3 n){
  // world size of a shadow-map texel here sets the offsets that keep surfaces from shadowing themselves
  float tx = (uType == 0 ? 2.0 * uShT * dot(p - uLPos, uLF) : 2.0 * uShHalf) / uShRes;
  vec3 sc = shadowCoord(p + n * tx * 1.5);
  if (sc.x < 0.0 || sc.y < 0.0 || sc.x > 1.0 || sc.y > 1.0) return 1.0;
  float bias = tx * 2.0 + 0.005, s = 0.0, r = 1.0 / uShRes;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) s += sc.z - bias <= texture(uShadow, sc.xy + vec2(i, j) * r).r ? 1.0 : 0.0;
  return s / 9.0;
}
vec3 lightAt(vec3 p, vec3 n, out vec3 l){
  if (uType == 1){
    l = -uLF;
    vec2 q = vec2(dot(p - uAim, uLR), dot(p - uAim, uLU)) / uSunSize;
    return uI * uLCol * gobo(q + 0.5) * shadowAt(p, n);
  }
  vec3 v = p - uLPos; float d2 = max(dot(v, v), 0.04), d = sqrt(d2);
  l = -v / d;
  float z = dot(v, uLF);
  if (z <= 1e-4) return vec3(0.0);
  vec2 q = vec2(dot(v, uLR), dot(v, uLU)) / (z * uTanC);
  float s = max(uSoft, 1e-3), m;
  if (uShape == 0) m = 1.0 - smoothstep(1.0 - s, 1.0, length(q));
  else m = (1.0 - smoothstep(1.0 - s, 1.0, abs(q.x))) * (1.0 - smoothstep(1.0 - s, 1.0, abs(q.y)));
  if (m <= 0.0) return vec3(0.0);
  return uI * uLCol * m * gobo(0.5 + 0.5 * q * uRep) / d2 * shadowAt(p, n);
}
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 srgb(vec3 c){ return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// the utility passes themselves, for checking what the scene was built from
uniform int uDisp; uniform vec3 uSC, uCtr; uniform float uRad, uDMed;
vec3 passView(vec3 p, vec3 n, vec3 c){
  if (uDisp == 1) return c;
  if (uDisp == 2) return 0.5 + 0.5 * n;
  if (uDisp == 3) return clamp(0.5 + 0.5 * (p - uCtr) / uRad, 0.0, 1.0);
  return vec3(1.0 - clamp(distance(p, uSC) / (uDMed * 2.5), 0.0, 1.0));
}
`;
// the pixels as a mesh: two triangles per cell, dropped where they would bridge a depth jump
const VS_SHOTMESH = HEAD + `
uniform sampler2D uP, uN; uniform ivec2 uGrid; uniform int uStep, uMode; uniform mat4 uVP; uniform vec3 uSC; uniform float uPixAng;
uniform int uType; uniform vec3 uLPos, uLF, uLR, uLU, uAim; uniform float uShT, uShHalf, uShFar;
out vec3 vP; out vec2 vUV; out float vD;
vec4 fetchP(ivec2 g){ ivec2 s = textureSize(uP, 0); return texelFetch(uP, clamp(g * uStep, ivec2(0), s - 1), 0); }
vec3 fetchN(ivec2 g){ ivec2 s = textureSize(uN, 0); vec3 n = texelFetch(uN, clamp(g * uStep, ivec2(0), s - 1), 0).xyz; return dot(n, n) > 1e-8 ? normalize(n) : vec3(0.0); }
// depth along the shot camera's rays
float dep(ivec2 g){ vec4 p = fetchP(g); return p.w > 0.5 ? distance(p.xyz, uSC) : -1.0; }
// two neighbouring pixels belong to one surface when the depth step between them is in line with the steps
// on either side (ground seen at a grazing angle grows smoothly); a jump far bigger than its neighbours is the
// edge of one object in front of another, and no triangle should bridge it
bool joined(ivec2 g0, ivec2 g1){
  ivec2 o = g1 - g0;
  float d0 = dep(g0), d1 = dep(g1);
  float jump = abs(d1 - d0), lim = min(d0, d1) * uPixAng * 4.0 + 0.005;
  if (jump <= lim) return true;
  // one surface seen at a grazing angle: the same facing at both ends, and the edge runs along it
  vec3 p0 = fetchP(g0).xyz, p1 = fetchP(g1).xyz, n0 = fetchN(g0), n1 = fetchN(g1), e = normalize(p1 - p0);
  if (dot(n0, n1) > 0.8 && abs(dot(e, n0)) < 0.3 && abs(dot(e, n1)) < 0.3 && jump < lim * 25.0) return true;
  // or a smooth ramp: the steps on both sides go the same way and are about as big
  float dm = dep(g0 - o), dp = dep(g1 + o);
  if (dm < 0.0 || dp < 0.0) return false;
  float s0 = d0 - dm, s1 = d1 - d0, s2 = dp - d1;
  if (s0 * s1 <= 0.0 || s1 * s2 <= 0.0) return false;
  return jump <= min(abs(s0), abs(s2)) * 1.7 + lim;
}
void main(){
  int cell = gl_VertexID / 6, k = gl_VertexID - cell * 6;
  ivec2 c = ivec2(cell % uGrid.x, cell / uGrid.x);
  ivec2 o0 = k < 3 ? ivec2(0, 0) : ivec2(1, 0), o1 = k < 3 ? ivec2(1, 0) : ivec2(1, 1), o2 = ivec2(0, 1);
  ivec2 me = c + (k % 3 == 0 ? o0 : k % 3 == 1 ? o1 : o2);
  vec4 a = fetchP(c + o0), b = fetchP(c + o1), d = fetchP(c + o2), p = fetchP(me);
  if (a.w * b.w * d.w < 0.3 || (uMode == 1 && min(a.w, min(b.w, d.w)) < 0.9) || !joined(c + o0, c + o1) || !joined(c + o1, c + o2) || !joined(c + o0, c + o2)){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vP = p.xyz; vUV = (vec2(me * uStep) + 0.5) / vec2(textureSize(uP, 0));
  if (uMode == 1){
    // shadow map from the light: linear depth, perspective for a spot, orthographic for the sun
    if (uType == 0){ vec3 v = p.xyz - uLPos; float z = dot(v, uLF); vD = z; gl_Position = vec4(dot(v, uLR) / uShT, dot(v, uLU) / uShT, (z / (uShFar + 1.0)) * 2.0 * z - z, z); }
    else { vec3 v = p.xyz - uAim; float z = dot(v, uLF) + 0.5 * uShFar; vD = z; gl_Position = vec4(dot(v, uLR) / uShHalf, dot(v, uLU) / uShHalf, z / uShFar * 2.0 - 1.0, 1.0); }
    return;
  }
  gl_Position = uVP * vec4(p.xyz, 1.0);
}`;
const FS_SHOTMESH = HEAD + SHOT_LIGHT + `
uniform sampler2D uN, uC; uniform int uMode; uniform float uAlb, uAmb, uExpo; uniform vec3 uCam;
in vec3 vP; in vec2 vUV; in float vD;
layout(location=0) out vec4 o0;
void main(){
  if (uMode == 1){ o0 = vec4(vD, 0.0, 0.0, 1.0); return; }
  if (uMode == 2){ o0 = vec4(vP, 1.0); return; }
  vec3 n = texture(uN, vUV).xyz;
  n = dot(n, n) > 1e-8 ? normalize(n) : normalize(uCam - vP);
  if (dot(n, uCam - vP) < 0.0) n = -n;
  if (uDisp > 0){ o0 = vec4(passView(vP, texture(uN, vUV).xyz, texture(uC, vUV).rgb), 1.0); return; }
  vec3 alb = pow(texture(uC, vUV).rgb, vec3(2.2)) * uAlb * 2.0, l;
  vec3 e = lightAt(vP, n, l);
  vec3 col = alb * (e * max(dot(n, l), 0.0) + uAmb * (0.6 + 0.4 * n.y));
  o0 = vec4(srgb(aces(col * exp2(uExpo))), 1.0);
}`;
// through the shot camera: every screen pixel is a pixel of the shot, lit exactly
const FS_SHOTIMG = COMMON + SHOT_LIGHT + `
uniform sampler2D uP, uN, uC; uniform vec4 uFit; uniform float uAlb, uAmb, uExpo; uniform vec3 uCam, uLImg; uniform int uGizmo;
void main(){
  vec2 f = (gl_FragCoord.xy - uFit.xy) / uFit.zw;
  if (f.x < 0.0 || f.y < 0.0 || f.x > 1.0 || f.y > 1.0){ fragColor = vec4(0.03, 0.035, 0.04, 1.0); return; }
  ivec2 s = textureSize(uP, 0);
  ivec2 px = clamp(ivec2(f.x * float(s.x), (1.0 - f.y) * float(s.y)), ivec2(0), s - 1);
  vec4 p = texelFetch(uP, px, 0);
  vec3 col;
  if (p.w < 0.5) col = vec3(0.012, 0.014, 0.018);
  else {
    vec3 n = texelFetch(uN, px, 0).xyz;
    n = dot(n, n) > 1e-8 ? normalize(n) : normalize(uCam - p.xyz);
    if (dot(n, uCam - p.xyz) < 0.0) n = -n;
    if (uDisp > 0){ fragColor = vec4(passView(p.xyz, texelFetch(uN, px, 0).xyz, texelFetch(uC, px, 0).rgb), 1.0); return; }
    vec3 alb = pow(texelFetch(uC, px, 0).rgb, vec3(2.2)) * uAlb * 2.0, l;
    vec3 e = lightAt(p.xyz, n, l);
    col = alb * (e * max(dot(n, l), 0.0) + uAmb * (0.6 + 0.4 * n.y));
  }
  // the light itself, where the camera can see it
  if (uGizmo == 1 && uLImg.z > 0.0){
    float d = length(gl_FragCoord.xy - uLImg.xy);
    if (d < 7.0 && (p.w < 0.5 || uLImg.z < distance(p.xyz, uCam))) col = mix(col, uLCol * 4.0, 1.0 - smoothstep(4.0, 7.0, d));
  }
  fragColor = vec4(srgb(aces(col * exp2(uExpo))), 1.0);
}`;
const VS_GIZMO = HEAD + `uniform mat4 uVP; uniform vec3 uA, uB; uniform float uSize;
void main(){ gl_Position = uVP * vec4(gl_VertexID == 0 ? uA : uB, 1.0); gl_PointSize = uSize; }`;
const FS_GIZMO = HEAD + `uniform vec3 uCol; out vec4 o; void main(){ vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; o = vec4(uCol, 1.0); }`;
PR.shotMesh = program(VS_SHOTMESH, FS_SHOTMESH, 'shot mesh');
PR.shotImg = program(VS_FULL, FS_SHOTIMG, 'shot view');
PR.gizmo = program(VS_GIZMO, FS_GIZMO, 'light gizmo');

function shadowTarget(n) {
  let t = SHOT.sm;
  if (t && t.w === n) return t;
  const tx = makeTex(n, n, 'f32', false);
  gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, n, n);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  return (SHOT.sm = {tex:tx, fb, rb, w:n, h:n});
}
const m4 = {
  persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
  look(e, c, up) {
    const z = v3.norm(v3.sub(e, c)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3.dot(x, e), -v3.dot(y, e), -v3.dot(z, e), 1];
  },
  mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; },
};
function shotLightUniforms(p, c, L, fin, ext) {
  const fr = SHOT.frame;
  i1(p, 'uDisp', S.shot.disp | 0); f3(p, 'uSC', ...fr.Cm); f3(p, 'uCtr', ...fr.ctr); f1(p, 'uRad', fr.R); f1(p, 'uDMed', fr.dMed);
  tex(p, 'uGobo', fin.tex, 0); tex(p, 'uShadow', SHOT.sm.tex, 1);
  i1(p, 'uType', c.ltype); i1(p, 'uShape', c.shape); i1(p, 'uSingle', ext.single);
  f3(p, 'uLPos', ...L.pos); f3(p, 'uLF', ...L.f); f3(p, 'uLR', ...L.r); f3(p, 'uLU', ...L.u); f3(p, 'uAim', ...L.aim); f3(p, 'uLCol', ...hex3(c.color));
  f1(p, 'uTanC', ext.tanC); f1(p, 'uSoft', c.soft); f1(p, 'uRep', ext.rep); f1(p, 'uBlur', ext.blur); f1(p, 'uBlurLod', ext.lod);
  f1(p, 'uI', Math.pow(2, c.ev) * (c.ltype === 1 ? 1 : 25)); f1(p, 'uSunSize', ext.sunSize); f1(p, 'uGoboRes', fin.w);
  f1(p, 'uShT', ext.shT); f1(p, 'uShHalf', ext.shHalf); f1(p, 'uShFar', ext.shFar); f1(p, 'uShRes', SHOT.sm.w);
}
const meshStep = () => (S.shot.detail | 0) === 0 ? 2 : 1;
function meshDraw(pm, mode, fr) {
  const stp = meshStep(), grid = [Math.ceil(fr.W / stp) - 1, Math.ceil(fr.H / stp) - 1];
  tex(pm, 'uP', SHOT.tex.P, 2); tex(pm, 'uN', SHOT.tex.N, 3); tex(pm, 'uC', SHOT.tex.C, 4);
  gl.uniform2i(pm.u('uGrid'), grid[0], grid[1]); i1(pm, 'uStep', stp); i1(pm, 'uMode', mode);
  f1(pm, 'uPixAng', fr.cam.vfov * DEG / fr.H * stp); f3(pm, 'uSC', ...fr.Cm);
  gl.drawArrays(gl.TRIANGLES, 0, grid[0] * grid[1] * 6);
}
function drawShot(fin, c, L, ext) {
  const fr = SHOT.frame;
  // the shadow map covers what the light can reach: the spot's cone, or the shot around the sun's aim point
  const toCtr = Math.hypot(...v3.sub(fr.ctr, L.aim));
  ext.shT = ext.tanC * (c.shape === 1 ? 1.45 : 1.05);
  ext.shHalf = Math.min(fr.R + toCtr, Math.max(ext.sunSize * 3, 25));
  ext.shFar = 6 * (fr.R + toCtr);
  if (c.ltype === 0) ext.shFar = Math.max(v3.dot(v3.sub(fr.ctr, L.pos), L.f) + fr.R * 3, 1);
  const sm = shadowTarget(2048);
  const pm = PR.shotMesh;
  gl.useProgram(pm.p); gl.bindVertexArray(vao);
  // keep the shadow map off every sampler while it is being drawn
  tex(pm, 'uGobo', fin.tex, 0); tex(pm, 'uShadow', fin.tex, 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sm.fb); gl.viewport(0, 0, sm.w, sm.h);
  gl.clearColor(1e9, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  i1(pm, 'uType', c.ltype); f3(pm, 'uLPos', ...L.pos); f3(pm, 'uLF', ...L.f); f3(pm, 'uLR', ...L.r); f3(pm, 'uLU', ...L.u); f3(pm, 'uAim', ...L.aim);
  f1(pm, 'uShT', ext.shT); f1(pm, 'uShHalf', ext.shHalf); f1(pm, 'uShFar', ext.shFar); f3(pm, 'uCam', ...fr.Cm);
  meshDraw(pm, 1, fr);
  gl.disable(gl.DEPTH_TEST);
  if ((S.shot.view | 0) === 0) {
    // through the shot camera, letterboxed into the preview
    const sc = Math.min(cv.width / fr.W, cv.height / fr.H), fw = fr.W * sc, fh = fr.H * sc;
    const fit = [(cv.width - fw) / 2, (cv.height - fh) / 2, fw, fh];
    SHOT.fit = fit;
    { const P = fr.cam.P, um = fr.um, up = S.shot.upZ, f = up ? [fr.cam.fwd[0], fr.cam.fwd[2], -fr.cam.fwd[1]] : fr.cam.fwd;
      const u0 = up ? [fr.cam.up[0], fr.cam.up[2], -fr.cam.up[1]] : fr.cam.up, r = v3.norm(v3.cross(f, u0)), u = v3.cross(r, f);
      VIEWCAM = {pos:fr.Cm, f, r, u, project:X => { const z = v3.dot(v3.sub(X, fr.Cm), f); if (z <= 1e-3) return null;
        const raw = up ? [X[0] / um, -X[2] / um, X[1] / um] : X.map(v => v / um), q = P.map(rw => rw[0] * raw[0] + rw[1] * raw[1] + rw[2] * raw[2] + rw[3]);
        return [fit[0] + q[0] / q[2] / fr.W * fw, fit[1] + (1 - q[1] / q[2] / fr.H) * fh, z]; },
        // the ray through a canvas pixel (device pixels, y up), from the solved camera
        ray:(fx, fy) => { const px = (fx - fit[0]) / fw * fr.W, py = (1 - (fy - fit[1]) / fh) * fr.H, I = fr.cam.inv;
          let d = I.map(rw => rw[0] * px + rw[1] * py + rw[2]); if (v3.dot(d, fr.cam.fwd) < 0) d = d.map(v => -v);
          return {ro:fr.Cm, rd:v3.norm(up ? [d[0], d[2], -d[1]] : d)}; }}; }
    let li = [0, 0, -1];
    if (c.ltype === 0) {
      const P = fr.cam.P, um = fr.um, up = S.shot.upZ;
      const raw = up ? [L.pos[0] / um, -L.pos[2] / um, L.pos[1] / um] : L.pos.map(v => v / um);
      const q = P.map(r => r[0] * raw[0] + r[1] * raw[1] + r[2] * raw[2] + r[3]);
      const fwd = up ? [fr.cam.fwd[0], fr.cam.fwd[2], -fr.cam.fwd[1]] : fr.cam.fwd;
      if (v3.dot(v3.sub(L.pos, fr.Cm), fwd) > 0) li = [fit[0] + q[0] / q[2] / fr.W * fw, fit[1] + (1 - q[1] / q[2] / fr.H) * fh, Math.hypot(...v3.sub(L.pos, fr.Cm))];
    }
    pass(PR.shotImg, null, p => {
      shotLightUniforms(p, c, L, fin, ext);
      tex(p, 'uP', SHOT.tex.P, 2); tex(p, 'uN', SHOT.tex.N, 3); tex(p, 'uC', SHOT.tex.C, 4);
      gl.uniform4f(p.u('uFit'), ...fit); f1(p, 'uAlb', c.alb); f1(p, 'uAmb', c.amb); f1(p, 'uExpo', c.expo); f3(p, 'uCam', ...fr.Cm);
      f3(p, 'uLImg', ...li); i1(p, 'uGizmo', c.gizmo ? 1 : 0);
    });
    return;
  }
  // orbiting the rough 3D model
  const {p:cpos, t0} = camPos(CAM());
  const near = Math.max(0.02, CAM().dist * 0.01);
  const vp = m4.mul(m4.persp((SHOT.vfov || 40) * DEG, cv.width / cv.height, near, near * 1e5), m4.look(cpos, t0, [0, 1, 0]));
  SHOT.vp = vp; SHOT.cpos = cpos;
  { const f = v3.norm(v3.sub(t0, cpos)), b = basis(f);
    VIEWCAM = {pos:cpos, f, r:b.r, u:b.u, project:X => { const c4 = [0, 1, 2, 3].map(i => vp[i] * X[0] + vp[4 + i] * X[1] + vp[8 + i] * X[2] + vp[12 + i]); if (c4[3] <= 1e-4) return null;
      return [(c4[0] / c4[3] * 0.5 + 0.5) * cv.width, (c4[1] / c4[3] * 0.5 + 0.5) * cv.height, c4[3]]; },
      ray:(fx, fy) => { const tv = Math.tan((SHOT.vfov || 40) * DEG / 2), sx = (fx / cv.width * 2 - 1) * cv.width / cv.height, sy = fy / cv.height * 2 - 1;
        return {ro:cpos, rd:v3.norm(v3.add(f, v3.add(v3.mul(b.r, tv * sx), v3.mul(b.u, tv * sy))))}; }}; }
  bindTarget(null);
  gl.clearColor(0.03, 0.035, 0.04, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(pm.p);
  shotLightUniforms(pm, c, L, fin, ext);
  gl.uniformMatrix4fv(pm.u('uVP'), false, vp); f3(pm, 'uCam', ...cpos);
  f1(pm, 'uAlb', c.alb); f1(pm, 'uAmb', c.amb); f1(pm, 'uExpo', c.expo);
  meshDraw(pm, 0, fr);
  if (c.gizmo) {
    const g = PR.gizmo; gl.useProgram(g.p);
    gl.uniformMatrix4fv(g.u('uVP'), false, vp);
    // the shot camera, the light and its aim point
    f3(g, 'uA', ...fr.Cm); f1(g, 'uSize', 9); f3(g, 'uCol', 0.35, 0.7, 1); gl.drawArrays(gl.POINTS, 0, 1);
    f3(g, 'uA', ...L.aim); f1(g, 'uSize', 8); f3(g, 'uCol', 1, 0.6, 0.2); gl.drawArrays(gl.POINTS, 0, 1);
    if (c.ltype === 0) {
      f3(g, 'uA', ...L.pos); f1(g, 'uSize', 13); f3(g, 'uCol', ...hex3(c.color)); gl.drawArrays(gl.POINTS, 0, 1);
      f3(g, 'uA', ...L.pos); f3(g, 'uB', ...L.aim); f3(g, 'uCol', 0.8, 0.8, 0.8); gl.drawArrays(gl.LINES, 0, 2);
    }
  }
  gl.disable(gl.DEPTH_TEST);
}
// the shot frame for the current time (sequences follow the timeline at its frame rate)
function shotSync() {
  if (!SHOT.frames.length) return;
  const n = SHOT.frames.length > 1 ? SHOT.frames[Math.min(SHOT.frames.length - 1, Math.floor(S.t * S.fps + 1e-6) % SHOT.frames.length)] : SHOT.frames[0];
  if ((!SHOT.frame || SHOT.frame.n !== n) && SHOT.loading === null) shotShowFrame(n);
}
// pick the 3D point under the cursor, to aim the light there
function shotPick(e) {
  const fr = SHOT.frame; if (!fr) return null;
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  const x = (e.clientX - r.left) * dpr, y = (r.bottom - e.clientY) * dpr;
  if (S.shot.view === 0) {
    const f = SHOT.fit; if (!f) return null;
    const u = (x - f[0]) / f[2], v = (y - f[1]) / f[3];
    if (u < 0 || v < 0 || u > 1 || v > 1) return null;
    const px = Math.min(fr.W - 1, Math.floor(u * fr.W)), py = Math.min(fr.H - 1, Math.floor((1 - v) * fr.H)), i = py * fr.W + px;
    return fr.P[i * 4 + 3] ? [fr.P[i * 4], fr.P[i * 4 + 1], fr.P[i * 4 + 2]] : null;
  }
  // orbit view: render positions and read the one under the cursor
  const t = tgt('shotPick', cv.width, cv.height, 'f32');
  if (!SHOT.pickRb || SHOT.pickRb.w !== cv.width || SHOT.pickRb.h !== cv.height) {
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, cv.width, cv.height);
    SHOT.pickRb = {rb, w:cv.width, h:cv.height};
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, SHOT.pickRb.rb);
  gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  const pm = PR.shotMesh; gl.useProgram(pm.p); gl.bindVertexArray(vao);
  tex(pm, 'uShadow', SHOT.tex.C, 1); tex(pm, 'uGobo', SHOT.tex.C, 0);
  f3(pm, 'uCam', ...SHOT.cpos); gl.uniformMatrix4fv(pm.u('uVP'), false, SHOT.vp);
  meshDraw(pm, 2, fr);
  gl.disable(gl.DEPTH_TEST);
  const px = new Float32Array(4); gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.FLOAT, px);
  return px[3] > 0.5 ? [px[0], px[1], px[2]] : null;
}
function shotOrbitCam() {
  const fr = SHOT.frame; if (!fr) return null;
  const tg = fr.pivot, d = v3.sub(fr.Cm, tg), dist = Math.hypot(...d);
  return {az:Math.atan2(d[0], d[2]) / DEG, el:Math.asin(clamp(d[1] / dist, -1, 1)) / DEG, dist, tx:tg[0], ty:tg[1], tz:tg[2]};
}
function shotDefs() {
  const def = shotDef(S.shotSel), fr = SHOT.frame;
  return [
    def.placeholder ? {type:'note', l:`PLACEHOLDER: ${def.seq} / ${def.shot} is a little set made up for this mockup, not one of your shots. Its utility passes (world position, normals, surface colour and a water matte) were rendered from the shot camera, and the scene you see was rebuilt from those passes and the camera. The real tool does the same with your shot's utility passes and camera from the pipeline.`}
                    : {type:'note', l:`${def.seq} / ${def.shot}, rebuilt from its utility passes (${HOST.label}).`},
    {k:'view', l:'View', opts:['Through the shot camera', 'Orbit the scene']},
    ...((S.shot.view | 0) === 1 ? [{type:'buttons', items:[['Back to the shot camera', () => { S.shot.view = 0; buildPanel(); viewDirty = true; save(); }], ['Frame the light\'s aim point', () => frameAim()]]}] : []),
    {k:'disp', l:'Show', opts:['Lit preview', 'Surface colour pass', 'Normal pass', 'Position pass', 'Depth (from position)'], h:'The utility passes the scene was built from.'},
    {k:'detail', l:'Model detail', opts:['Full resolution', 'Half (faster)', 'Quarter (fastest)']},
    {type:'note', l:'Maya controls: Alt + left drag tumbles, Alt + middle drag tracks, Alt + right drag dollies, and the scroll wheel zooms. Plain drags work too. F frames the aim point. Click the scene to aim the light.' + (fr ? ` Built from ${fr.W}×${fr.H} passes.` : '')},
  ];
}
// point the orbit camera at the light's aim point
function frameAim() {
  if (S.view !== 'scene') return;
  if (inShot() && (S.shot.view | 0) === 0) { S.shotCams[S.shotSel] = shotOrbitCam(); S.shot.view = 1; }
  const L = sceneLight(), cam = CAM(), d = Math.max(0.5, Math.min(cam.dist, sceneTile() * 2.5));
  Object.assign(cam, {tx:L.aim[0], ty:L.aim[1], tz:L.aim[2], dist:inShot() ? d : clamp(d, 1, 30)});
  buildPanel(); viewDirty = true; save();
}
document.addEventListener('keydown', e => {
  const ae = document.activeElement;
  if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !(ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) frameAim();
});
function shotParamChanged(k) {
  if (k === 'view') { if (S.shot.view === 1) S.shotCams[S.shotSel] = shotOrbitCam(); buildPanel(); viewDirty = true; save(); return; }
  if (k === 'disp') { viewDirty = true; save(); return; }
  if (SHOT.frame) { SHOT.cache.clear(); shotShowFrame(SHOT.frame.n); }
  save();
}
// the Shot menu at the top of the page
(() => {
  const sel = $('shotSel');
  if (sel) {
    sel.innerHTML = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
    add('', 'None · simple stand-in sets');
    sel.onchange = () => selectShot(sel.value, true);
  }
  const want = S.shotSel; S.shotSel = '';
  Promise.resolve().then(() => HOST.shots()).then(list => {
    SHOTLIST = Array.isArray(list) ? list : [];
    if (sel) {
      // grouped by sequence; the mockup's made-up shots say so in the menu
      const groups = new Map();
      for (const d of SHOTLIST) { const g = d.placeholder ? 'Placeholder shots (mockup)' : d.seq || 'Shots'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(d); }
      for (const [g, ds] of groups) {
        const og = document.createElement('optgroup'); og.label = g;
        for (const d of ds) { const o = document.createElement('option'); o.value = d.id; o.textContent = (d.placeholder ? 'PLACEHOLDER · ' : '') + (d.label || `${d.seq} / ${d.shot}`); og.append(o); }
        sel.append(og);
      }
    }
    if (want && shotDef(want)) selectShot(want);
    else if (sel) sel.value = '';
  }).catch(e => { console.error(e); showErr('The shot list could not be read: ' + (e && e.message || e)); });
})();
(() => {
  // click (not drag) to aim the light
  let down = null;
  cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', e => {
    if (!down || S.view !== 'scene' || !inShot() || scenePaintOn()) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const p = shotPick(e);
    if (p) { const c = SC(); c.aimX = p[0]; c.aimY = p[1]; c.aimZ = p[2]; viewDirty = true; save(); }
  });
})();

/* =====================================================================
   PLACEHOLDER SHOTS: three small sets made up for this mockup. Each is
   rendered here into utility passes (world position, normals, surface
   colour, and a water matte) from its shot camera, one frame each, and
   those passes then go through exactly the steps a real shot's would.
   ===================================================================== */
const FS_PLACE = COMMON + `
uniform vec3 uEye, uF, uR, uU; uniform float uTan, uAsp; uniform int uOut, uScene;
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p, b - r) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdCylY(vec3 p, vec2 c, float r, float y0, float y1){ float d = length(p.xz - c) - r; return max(d, max(y0 - p.y, p.y - y1)); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
float sdTorusZ(vec3 p, float R, float r){ vec2 q = vec2(length(p.xy) - R, p.z); return length(q) - r; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 un(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
float h1(float x){ return fract(sin(x * 78.233 + 12.9898) * 43758.5453); }
// a person, about 1.75 m tall, standing at the origin and facing +z
vec2 person(vec3 p, vec2 d){
  vec3 q = vec3(abs(p.x), p.y, p.z);
  d = un(d, vec2(sdRBox(vec3(q.x - 0.1, q.y - 0.05, q.z - 0.05), vec3(0.055, 0.05, 0.13), 0.03), 20.0));
  d = un(d, vec2(sdCapsule(q, vec3(0.1, 0.12, 0.0), vec3(0.11, 0.88, 0.0), 0.075), 21.0));
  d = un(d, vec2(sdRBox(p - vec3(0.0, 0.93, 0.0), vec3(0.18, 0.1, 0.11), 0.07), 21.0));
  d = un(d, vec2(sdRBox(p - vec3(0.0, 1.22, 0.0), vec3(0.2, 0.24, 0.12), 0.09), 22.0));
  d = un(d, vec2(min(sdCapsule(q, vec3(0.25, 1.4, 0.0), vec3(0.31, 1.13, 0.03), 0.06), sdCapsule(q, vec3(0.31, 1.13, 0.03), vec3(0.3, 0.9, 0.1), 0.05)), 22.0));
  d = un(d, vec2(length(q - vec3(0.3, 0.86, 0.11)) - 0.05, 23.0));
  d = un(d, vec2(sdCapsule(p, vec3(0.0, 1.44, 0.0), vec3(0.0, 1.56, 0.01), 0.05), 23.0));
  d = un(d, vec2(sdEll(p - vec3(0.0, 1.65, 0.02), vec3(0.09, 0.115, 0.1)) * 0.8, 23.0));
  d = un(d, vec2(max(sdEll(p - vec3(0.0, 1.67, 0.0), vec3(0.1, 0.112, 0.11)) * 0.8, 1.66 - p.y + 0.6 * max(p.z, 0.0)), 24.0));
  return d;
}
// ---- 0: a courtyard with a person standing in it ----
vec2 courtyard(vec3 p){
  vec2 d = vec2(p.y, 30.0);
  float wall = sdBox(p - vec3(0.0, 4.5, -7.5), vec3(20.0, 4.5, 0.5));
  wall = min(wall, sdBox(p - vec3(-8.5, 4.5, 1.0), vec3(0.5, 4.5, 9.0)));
  // a door and rows of windows, set into the walls
  float rec = sdBox(p - vec3(1.8, 1.15, -7.0), vec3(0.65, 1.15, 0.2));
  for (int i = 0; i < 4; i++){ float x = -6.0 + 4.0 * float(i); rec = min(rec, sdBox(p - vec3(x + (i > 1 ? 2.0 : 0.0), 3.8, -7.0), vec3(0.55, 0.75, 0.15))); rec = min(rec, sdBox(p - vec3(x + (i > 1 ? 2.0 : 0.0), 6.8, -7.0), vec3(0.55, 0.75, 0.15))); }
  for (int i = 0; i < 3; i++){ float z = -4.0 + 4.0 * float(i); rec = min(rec, sdBox(p - vec3(-8.0, 3.8, z), vec3(0.15, 0.75, 0.55))); rec = min(rec, sdBox(p - vec3(-8.0, 1.4, z), vec3(0.15, 0.7, 0.5))); }
  wall = max(wall, -rec);
  d = un(d, vec2(wall, 31.0));
  d = un(d, vec2(sdBox(p - vec3(1.8, 1.15, -7.13), vec3(0.62, 1.12, 0.03)), 32.0));
  float glass = 1e9;
  for (int i = 0; i < 4; i++){ float x = -6.0 + 4.0 * float(i) + (i > 1 ? 2.0 : 0.0); glass = min(glass, sdBox(p - vec3(x, 3.8, -7.08), vec3(0.52, 0.72, 0.02))); glass = min(glass, sdBox(p - vec3(x, 6.8, -7.08), vec3(0.52, 0.72, 0.02))); }
  for (int i = 0; i < 3; i++){ float z = -4.0 + 4.0 * float(i); glass = min(glass, sdBox(p - vec3(-7.92, 3.8, z), vec3(0.02, 0.72, 0.52))); glass = min(glass, sdBox(p - vec3(-7.92, 1.4, z), vec3(0.02, 0.67, 0.47))); }
  d = un(d, vec2(glass, 33.0));
  d = un(d, vec2(sdBox(p - vec3(0.0, 0.2, -6.85), vec3(20.0, 0.2, 0.1)), 34.0));
  // planter with a shrub, a bench, a lamp post
  d = un(d, vec2(sdRBox(p - vec3(-3.6, 0.3, -4.6), vec3(1.1, 0.3, 0.45), 0.03), 34.0));
  vec3 s = p - vec3(-3.6, 0.95, -4.6);
  d = un(d, vec2(min(sdEll(s, vec3(0.9, 0.55, 0.42)), min(sdEll(s - vec3(0.55, 0.2, 0.05), vec3(0.45, 0.45, 0.35)), sdEll(s + vec3(0.5, -0.1, 0.0), vec3(0.4, 0.4, 0.33)))) * 0.8, 35.0));
  vec3 b = p - vec3(3.3, 0.0, -3.4);
  d = un(d, vec2(min(sdBox(b - vec3(0.0, 0.45, 0.0), vec3(0.85, 0.03, 0.22)), sdBox(b - vec3(0.0, 0.72, -0.2), vec3(0.85, 0.12, 0.02))), 36.0));
  d = un(d, vec2(min(sdBox(vec3(abs(b.x) - 0.72, b.y - 0.22, b.z), vec3(0.03, 0.22, 0.2)), sdCylY(p, vec2(-5.2, 1.6), 0.06, 0.0, 3.6)), 37.0));
  d = un(d, vec2(sdEll(p - vec3(-5.2, 3.75, 1.6), vec3(0.22, 0.28, 0.22)), 33.0));
  vec3 f = p; f.xz = rot(0.35) * f.xz;
  return person(f, d);
}
// ---- 2: a living room; its window is behind the camera, so only the gobo brings the window in ----
vec2 room(vec3 p){
  vec2 d = vec2(p.y, 60.0);
  float walls = min(sdBox(p - vec3(0.0, 1.4, -2.65), vec3(3.4, 1.4, 0.15)), sdBox(p - vec3(3.15, 1.4, 0.0), vec3(0.15, 1.4, 3.2)));
  walls = min(walls, sdBox(p - vec3(-3.15, 1.4, 0.0), vec3(0.15, 1.4, 3.2)));
  d = un(d, vec2(walls, 61.0));
  d = un(d, vec2(sdBox(p - vec3(0.0, 2.85, 0.0), vec3(3.4, 0.05, 3.2)), 62.0));
  // skirting boards
  d = un(d, vec2(min(sdBox(p - vec3(0.0, 0.05, -2.48), vec3(3.0, 0.05, 0.02)), min(sdBox(p - vec3(2.98, 0.05, 0.0), vec3(0.02, 0.05, 3.0)), sdBox(p - vec3(-2.98, 0.05, 0.0), vec3(0.02, 0.05, 3.0)))), 63.0));
  // sofa against the back wall, with two cushions and a throw pillow
  vec3 s = p - vec3(-0.3, 0.0, -2.0);
  float sofa = min(sdRBox(s - vec3(0.0, 0.22, 0.0), vec3(1.3, 0.22, 0.45), 0.06), sdRBox(s - vec3(0.0, 0.62, -0.33), vec3(1.3, 0.25, 0.12), 0.06));
  sofa = min(sofa, sdRBox(vec3(abs(s.x) - 1.2, s.y - 0.55, s.z), vec3(0.12, 0.13, 0.45), 0.05));
  sofa = min(sofa, sdRBox(vec3(abs(s.x) - 0.55, s.y - 0.5, s.z + 0.02), vec3(0.53, 0.07, 0.4), 0.06));
  d = un(d, vec2(sofa, 64.0));
  d = un(d, vec2(sdRBox(s - vec3(0.75, 0.72, -0.16), vec3(0.22, 0.2, 0.07), 0.06), 75.0));
  // coffee table on a rug, with a bowl
  vec3 t = p - vec3(-0.25, 0.0, -0.75);
  d = un(d, vec2(min(sdBox(t - vec3(0.0, 0.4, 0.0), vec3(0.6, 0.02, 0.33)), sdBox(vec3(abs(t.x) - 0.54, t.y - 0.2, abs(t.z) - 0.27), vec3(0.025, 0.2, 0.025))), 65.0));
  d = un(d, vec2(max(sdEll(t - vec3(0.15, 0.48, 0.05), vec3(0.16, 0.09, 0.16)), -(t.y - 0.5)), 72.0));
  d = un(d, vec2(sdBox(p - vec3(-0.2, 0.006, -0.6), vec3(1.8, 0.006, 1.3)), 66.0));
  // armchair angled toward the sofa, a side table beside it
  vec3 a = p - vec3(-2.15, 0.0, 0.25); a.xz = rot(-1.0) * a.xz;
  float ch = min(sdRBox(a - vec3(0.0, 0.24, 0.0), vec3(0.42, 0.24, 0.42), 0.06), sdRBox(a - vec3(0.0, 0.62, -0.34), vec3(0.42, 0.3, 0.1), 0.06));
  ch = min(ch, sdRBox(vec3(abs(a.x) - 0.38, a.y - 0.55, a.z), vec3(0.08, 0.1, 0.4), 0.04));
  d = un(d, vec2(ch, 67.0));
  d = un(d, vec2(min(sdCylY(p, vec2(-2.45, -0.75), 0.25, 0.55, 0.58), sdCylY(p, vec2(-2.45, -0.75), 0.03, 0.0, 0.56)), 65.0));
  // floor lamp, plant, picture, bookshelf
  d = un(d, vec2(min(sdCylY(p, vec2(1.55, -2.15), 0.18, 0.0, 0.03), sdCylY(p, vec2(1.55, -2.15), 0.02, 0.0, 1.55)), 68.0));
  d = un(d, vec2(max(sdCylY(p, vec2(1.55, -2.15), 0.25 - 0.1 * (p.y - 1.5), 1.45, 1.75), -sdCylY(p, vec2(1.55, -2.15), 0.2, 1.44, 1.74)), 69.0));
  d = un(d, vec2(sdCylY(p, vec2(-2.55, -2.1), 0.2, 0.0, 0.42), 70.0));
  vec3 g = p - vec3(-2.55, 0.85, -2.1);
  d = un(d, vec2(min(sdEll(g, vec3(0.32, 0.45, 0.32)), min(sdEll(g - vec3(0.2, 0.3, 0.1), vec3(0.22, 0.3, 0.2)), sdEll(g - vec3(-0.15, 0.4, -0.05), vec3(0.2, 0.32, 0.2)))) * 0.8, 71.0));
  d = un(d, vec2(sdBox(p - vec3(-0.3, 1.6, -2.48), vec3(0.7, 0.4, 0.02)), 72.0));
  vec3 bs = p - vec3(2.82, 1.0, -0.9);
  float shelf = sdBox(bs, vec3(0.18, 1.0, 0.75));
  float slots = 1e9; for (int i = 0; i < 4; i++) slots = min(slots, sdBox(bs - vec3(-0.05, -0.62 + 0.46 * float(i), 0.0), vec3(0.2, 0.19, 0.7)));
  d = un(d, vec2(max(shelf, -slots), 73.0));
  float books = 1e9; for (int i = 0; i < 4; i++) books = min(books, sdBox(bs - vec3(0.02, -0.66 + 0.46 * float(i), 0.0), vec3(0.15, 0.14 + 0.03 * float(i % 2), 0.66)));
  d = un(d, vec2(books, 74.0));
  return d;
}
vec2 map(vec3 p){ return uScene == 0 ? courtyard(p) : room(p); }
vec3 albedo(float id, vec3 p){
  int k = int(id + 0.5);
  if (k == 0) return vec3(0.03, 0.06, 0.065);
  if (k == 20) return vec3(0.07, 0.06, 0.06);
  if (k == 21) return vec3(0.17, 0.2, 0.28);
  if (k == 22) return vec3(0.72, 0.69, 0.62);
  if (k == 23) return vec3(0.6, 0.43, 0.34);
  if (k == 24) return vec3(0.08, 0.06, 0.05);
  if (k == 30){ vec2 c = floor(p.xz / vec2(0.6, 0.4) + vec2(0.0, floor(p.x / 0.6) * 0.5)); vec2 f = fract(p.xz / vec2(0.6, 0.4) + vec2(0.0, floor(p.x / 0.6) * 0.5));
    float grout = step(0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 0.6 / 0.6); return vec3(0.5, 0.47, 0.42) * (0.85 + 0.3 * h1(c.x * 17.0 + c.y)) * mix(0.6, 1.0, grout); }
  if (k == 31) return vec3(0.68, 0.6, 0.48);
  if (k == 32) return vec3(0.28, 0.17, 0.1);
  if (k == 33) return vec3(0.05, 0.06, 0.07);
  if (k == 34) return vec3(0.5, 0.48, 0.44);
  if (k == 35) return vec3(0.12, 0.22, 0.08);
  if (k == 36) return vec3(0.4, 0.27, 0.16);
  if (k == 37) return vec3(0.12, 0.13, 0.13);
  if (k == 40) return vec3(0.45, 0.44, 0.41);
  if (k == 41) return vec3(0.1, 0.1, 0.11);
  if (k == 42) return vec3(0.42, 0.45, 0.5);
  if (k == 43) return vec3(0.25, 0.26, 0.28);
  if (k == 44){ float yd = 3.0 + 1.1 * smoothstep(3.0, 12.4, p.x);
    if (p.y < 0.35) return p.y < 0.0 ? vec3(0.4, 0.06, 0.05) : vec3(0.03);
    if (p.y > yd - 0.3) return vec3(0.08, 0.17, 0.4);
    return vec3(0.8, 0.8, 0.78); }
  if (k == 45) return vec3(0.82, 0.82, 0.8);
  if (k == 46) return p.y > 7.8 ? vec3(0.03) : vec3(0.5, 0.08, 0.06);
  if (k == 47) return vec3(0.55, 0.55, 0.52);
  if (k == 48) return vec3(0.35, 0.33, 0.3);
  if (k == 49) return vec3(0.85, 0.3, 0.08);
  if (k == 50) return vec3(0.04, 0.05, 0.06);
  if (k == 60){ float b = floor(p.x / 0.18); return vec3(0.5, 0.34, 0.2) * (0.8 + 0.35 * h1(b + floor(p.z / 1.4 + h1(b) * 3.0) * 7.0)); }
  if (k == 61) return vec3(0.74, 0.71, 0.65);
  if (k == 62) return vec3(0.85, 0.85, 0.83);
  if (k == 63) return vec3(0.88, 0.87, 0.84);
  if (k == 64) return vec3(0.3, 0.36, 0.45);
  if (k == 65) return vec3(0.32, 0.2, 0.12);
  if (k == 66){ vec2 r = abs(p.xz - vec2(-0.2, -0.6)) - vec2(1.6, 1.1); float inb = step(max(r.x, r.y), 0.0); return mix(vec3(0.55, 0.22, 0.15), vec3(0.75, 0.68, 0.55), inb * (0.7 + 0.3 * step(0.5, fract((p.x + p.z) * 3.0)))); }
  if (k == 67) return vec3(0.55, 0.42, 0.28);
  if (k == 68) return vec3(0.1, 0.1, 0.1);
  if (k == 69) return vec3(0.85, 0.8, 0.7);
  if (k == 70) return vec3(0.6, 0.35, 0.22);
  if (k == 71) return vec3(0.1, 0.25, 0.08);
  if (k == 72) return vec3(0.2, 0.32, 0.45);
  if (k == 73) return vec3(0.82, 0.8, 0.76);
  if (k == 75) return vec3(0.75, 0.55, 0.3);
  if (k == 74){ float b = floor(p.z / 0.045); return vec3(0.2 + 0.5 * h1(b), 0.15 + 0.35 * h1(b + 3.0), 0.12 + 0.4 * h1(b + 7.0)); }
  return vec3(0.5);
}
void main(){
  vec2 s = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 rd = normalize(uF + uTan * (s.x * uAsp * uR + s.y * uU)), ro = uEye;
  float tw = uScene == 1 && rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float t = 0.02, id = -1.0;
  for (int i = 0; i < 300; i++){
    if (t > min(tw, 300.0)) break;
    vec2 h = map(ro + rd * t);
    if (h.x < 0.0004 * t){ id = h.y; break; }
    t += max(h.x * 0.9, 0.0015);
  }
  if (id < 0.0 && tw < 300.0){ t = tw; id = 0.0; }
  if (id < 0.0){ fragColor = vec4(0.0); return; }
  vec3 p = ro + rd * t;
  // water is marked in the matte (alpha 0.5): it shows in the shot but casts no shadow
  if (uOut == 0){ fragColor = vec4(p, id < 0.5 ? 0.5 : 1.0); return; }
  vec3 n = vec3(0.0, 1.0, 0.0);
  if (id > 0.5){ const vec2 e = vec2(0.0012, 0.0); n = normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }
  fragColor = uOut == 1 ? vec4(n, 1.0) : vec4(albedo(id, p), 1.0);
}`;
PR.place = program(VS_FULL, FS_PLACE, 'placeholder shot');
function placeholderSource(def) {
  return {units:1, upZ:false, camera:n => ({eye:def.cam.eye, at:def.cam.at, up:[0, 1, 0], vfov:def.cam.vfov}), async read(n, step) {
    const W = Math.round(1920 / step), H = Math.round(1080 / step), N = W * H;
    const c = def.cam;
    const f = v3.norm(v3.sub(c.at, c.eye)), r = v3.norm(v3.cross(f, [0, 1, 0])), u = v3.cross(r, f);
    const t = tgt('placeOut', W, H, 'f32'), buf = new Float32Array(N * 4), out = {};
    for (const [k, mode] of [['pos', 0], ['nrm', 1], ['col', 2]]) {
      pass(PR.place, t, p => { f3(p, 'uEye', ...c.eye); f3(p, 'uF', ...f); f3(p, 'uR', ...r); f3(p, 'uU', ...u); f1(p, 'uTan', Math.tan(c.vfov * DEG / 2)); f1(p, 'uAsp', W / H); i1(p, 'uOut', mode); i1(p, 'uScene', def.scene); });
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, buf);
      // rows top-down, as an EXR stores them
      const ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)], m = k === 'pos' ? new Float32Array(N) : null;
      for (let y = 0; y < H; y++) { const src = (H - 1 - y) * W, dst = y * W; for (let x = 0; x < W; x++) { const i = (src + x) * 4; ch[0][dst + x] = buf[i]; ch[1][dst + x] = buf[i + 1]; ch[2][dst + x] = buf[i + 2]; if (m) m[dst + x] = buf[i + 3] > 0.25 && buf[i + 3] < 0.75 ? 1 : 0; } }
      out[k] = {W, H, data:ch};
      if (m) out.matte = {W, H, data:[m]};
    }
    await new Promise(res => setTimeout(res, 0));
    return out;
  }};
}
