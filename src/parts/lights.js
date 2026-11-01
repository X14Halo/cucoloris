/* =====================================================================
   LIGHTS
   A scene can hold several gobo lights. Each light is a whole gobo of
   its own: its pattern and every setting (for every pattern type), its
   output levels, timeline, paint layers and its placement in the set or
   in each shot. The panel always edits the selected light: selecting
   another swaps that light's state and caches in (cheap: references
   only), so every other part of the tool keeps working on "the" light.
   The Scene view draws the other lights by swapping each in briefly,
   re-rendering its gobo only when the time or resolution moved on.
   ===================================================================== */
// what a light owns in S (references, swapped as a whole)
const LIGHT_STATE = ['mode', 'p', 'post', 'tl', 'scenes', 'shotLights', 'ovl'];
if (!S.rig || !Array.isArray(S.rig.lights) || !S.rig.lights.length) S.rig = {sel:0, lights:[{id:'L1', name:'Key', on:true}]};
S.rig.sel = clamp(S.rig.sel | 0, 0, S.rig.lights.length - 1);
const RIG = S.rig;
const lightCur = () => RIG.lights[RIG.sel];
const lightOn = () => lightCur().on !== false;
const lightName = () => lightCur().name || 'Light';
const lightMulti = () => RIG.lights.length > 1;
// the selected light's state lives in S itself
for (const k of LIGHT_STATE) lightCur()[k] = S[k];
// browser storage keys for a light's paint layers (the first light keeps the original keys)
const paintKeyFor = id => id === 'L1' ? 'cucLab.paint' : 'cucLab.paint.' + id;
const ovlPrefixFor = id => id === 'L1' ? 'cucLab.ovl.' : 'cucLab.ovl.' + id + '.';
PAINT.key = paintKeyFor(lightCur().id);
OVL_PREFIX = ovlPrefixFor(lightCur().id);

/* caches that belong to one light's gobo: tree geometry and wind, window layers, the water spectrum, the
   paint canvases and the light's own finished gobo */
const takeCache = () => ({TR:{...TR}, WIN:{...WIN}, water:{...water}, taps:tapsCache, PAINT:{...PAINT}, OVL:{...OVL}, final:targets.final, winL:targets.winL});
const freshCache = id => ({TR:{sig:'', windSig:'', data:null, leafVAO:null, segVAO:null, flutBuf:null, dispTex:null, dispData:null, nLeaves:0, nSegs:0}, WIN:{cover:3},
  water:{sig:'', tex:null, N:0, kappa:0}, taps:{sig:'', tex:null, n:0, maxR:0},
  PAINT:{cv:null, ctx:null, tex:null, dirty:true, undo:[], last:null, saveT:0, N:1024, key:paintKeyFor(id), set:() => S.p.shapes, kind:'gobo'}, OVL:{}, final:null, winL:null});
const refill = (o, src) => { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, src); };
function lightStash(Lr) { for (const k of LIGHT_STATE) Lr[k] = S[k]; Lr.cache = takeCache(); }
function lightUnstash(Lr) {
  for (const k of LIGHT_STATE) if (Lr[k] !== undefined) S[k] = Lr[k];
  const c = Lr.cache || freshCache(Lr.id);
  refill(TR, c.TR); refill(WIN, c.WIN); refill(water, c.water); tapsCache = c.taps; refill(PAINT, c.PAINT); refill(OVL, c.OVL);
  if (c.final) targets.final = c.final; else delete targets.final;
  if (c.winL) targets.winL = c.winL; else delete targets.winL;
  OVL_PREFIX = ovlPrefixFor(Lr.id);
  Lr.cache = null;
  if (typeof THUMB !== 'undefined' && THUMB) THUMB.stale = true;
}
// a light's settings filled in for every pattern (a light saved by an older version, or a new one)
function lightNormalize() {
  for (const m of Object.keys(MODES)) {
    S.p[m] = {...DEFAULTS[m], ...(S.p[m] || {})};
    S.post[m] = {...MODES[m].post, ...(S.post[m] || {})};
    S.tl[m] = {...MODES[m].tl, ...(S.tl[m] || {})};
    S.scenes[m] = {...sceneDefaults(m), ...(S.scenes[m] || {})};
  }
  S.ovl = {on:{}, pbTool:0, pbInk:0, pbSize:10, pbSoft:0.8, pbFlow:0.35, pbWrap:true, pbBlur:0.5, ...(S.ovl || {})};
  S.shotLights = S.shotLights || {};
}
function lightsChanged() { buildModes(); buildPanel(); buildTimeline(); lightsBar(); dirty = true; viewDirty = true; save(); }
function selectLight(k) {
  k = clamp(k | 0, 0, RIG.lights.length - 1);
  if (k === RIG.sel) return;
  if (EXPORT.busy) return;
  lightStash(lightCur()); RIG.sel = k; lightUnstash(lightCur()); lightNormalize();
  GIZ.drag = null;
  lightsChanged();
}
const deep = o => JSON.parse(JSON.stringify(o, (k, v) => k.startsWith('_') ? undefined : v));
// a new light: a copy of the selected one (same gobo), turned 45° around its aim point so the two do not overlap
function addLight() {
  const used = new Set(RIG.lights.map(l => l.id));
  let n = RIG.lights.length + 1; while (used.has('L' + n)) n++;
  const id = 'L' + n, src = lightCur();
  const Lr = {id, name:`Light ${n}`, on:true};
  for (const k of LIGHT_STATE) Lr[k] = deep(S[k]);
  for (const sc of Object.values(Lr.scenes)) if (sc) { sc.az = ((sc.az || 0) + 45 + 540) % 360 - 180; sc.follow = false; }
  for (const shot of Object.values(Lr.shotLights || {})) for (const sc of Object.values(shot || {})) if (sc) { sc.az = ((sc.az || 0) + 45 + 540) % 360 - 180; sc.follow = false; }
  Lr.ovl.on = {};                                 // its paint-over starts empty
  RIG.lights.push(Lr);
  // copy the painted gobo too, so the new light looks like the one it came from
  try { if (src.id && PAINT.cv) localStorage.setItem(paintKeyFor(id), PAINT.cv.toDataURL('image/png')); } catch (e) {}
  selectLight(RIG.lights.length - 1);
}
function removeLight(k = RIG.sel) {
  if (RIG.lights.length < 2 || EXPORT.busy) return;
  const gone = RIG.lights[k];
  let sel = RIG.sel;
  if (k === sel) {
    // switch to a neighbour first, then drop the old light and its GPU resources
    sel = k === 0 ? 1 : k - 1;
    lightStash(gone); RIG.sel = sel; lightUnstash(lightCur()); lightNormalize();
  }
  const c = gone.cache;
  if (c) { for (const t of [c.final, c.winL]) if (t) { gl.deleteTexture(t.tex); if (t.tex2) gl.deleteTexture(t.tex2); gl.deleteFramebuffer(t.fb); } if (c.PAINT && c.PAINT.tex) gl.deleteTexture(c.PAINT.tex); }
  try { localStorage.removeItem(paintKeyFor(gone.id)); for (const m of Object.keys(MODES)) localStorage.removeItem(ovlPrefixFor(gone.id) + m); } catch (e) {}
  RIG.lights.splice(k, 1);
  if (k < sel) sel--;
  RIG.sel = sel;
  lightsChanged();
}
/* Run fn with each light swapped in (the selected one included), then put the selected light back.
   filter(Lr, i) chooses the lights; fn may be async. */
async function forEachLight(fn, filter = () => true) {
  const home = RIG.sel;
  const out = [];
  try {
    for (let i = 0; i < RIG.lights.length; i++) {
      if (!filter(RIG.lights[i], i)) continue;
      if (i !== RIG.sel) { lightStash(lightCur()); RIG.sel = i; lightUnstash(lightCur()); lightNormalize(); }
      out.push(await fn(RIG.lights[i], i));
    }
  } finally {
    if (RIG.sel !== home) { lightStash(lightCur()); RIG.sel = home; lightUnstash(lightCur()); lightNormalize(); }
  }
  return out;
}
/* The other lights, as the Scene view draws them: each swapped in, its gobo rendered again only when the
   time, resolution or quality moved on (or it has none yet), and described while it is in. */
function otherLights() {
  if (!lightMulti()) return [];
  const home = RIG.sel, keepInfo = info, keepGobo = goboInfo, out = [];
  const key = [S.t, S.res, S.quality, S.shotSel, SHOT.frame ? SHOT.frame.n : 0].join('|');
  lightStash(lightCur());
  try {
    RIG.lights.forEach((Lr, i) => {
      if (i === home || Lr.on === false) return;
      RIG.sel = i; lightUnstash(Lr); lightNormalize();
      if (Lr.rkey !== key || !targets.final || targets.final.w !== S.res) { render(); Lr.rkey = key; }
      const d = lightDesc(targets.final); d.idx = i; d.name = Lr.name;
      out.push(d);
      lightStash(Lr);
    });
  } finally {
    RIG.sel = home; lightUnstash(lightCur());
    info = keepInfo; goboInfo = keepGobo;
  }
  return out;
}

/* what is saved: every light's settings (the selected light's are the top-level ones as before) */
function rigSave() {
  return {sel:RIG.sel, lights:RIG.lights.map((Lr, i) => {
    const o = {id:Lr.id, name:Lr.name, on:Lr.on !== false};
    if (i !== RIG.sel) for (const k of LIGHT_STATE) if (Lr[k] !== undefined) o[k] = Lr[k];
    return o;
  })};
}

/* ---------- the light list, at the top of the panel ---------- */
const lbCss = document.createElement('style');
lbCss.textContent = `
.lightsbar{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.lightsbar .lbrow{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.lightsbar .lchip{display:flex;align-items:center;gap:6px;background:var(--raise);border:1px solid var(--line);border-radius:999px;padding:4px 10px 4px 6px;cursor:pointer;font-size:12px}
.lightsbar .lchip[aria-pressed="true"]{border-color:var(--accent);background:rgba(240,178,94,.14);color:var(--fg)}
.lightsbar .lchip .dot{width:9px;height:9px;border-radius:50%;background:var(--accent);flex:none}
.lightsbar .lchip.off .dot{background:transparent;border:1px solid var(--mute)}
.lightsbar .lchip.off{color:var(--mute)}
.lightsbar .lchip small{color:var(--mute)}
.lightsbar .ladd{background:none;border:1px dashed var(--line);border-radius:999px;padding:4px 10px;cursor:pointer;font-size:12px;color:var(--mute)}
.lightsbar .ladd:hover{border-color:var(--accent);color:var(--accent)}
.lightsbar .lsel{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.lightsbar .lsel input[type=text]{background:var(--raise);border:1px solid var(--line);border-radius:5px;padding:4px 7px;width:9em;font-weight:600}
.lightsbar .lsel button{background:var(--raise);border:1px solid var(--line);border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer}
.lightsbar .lsel button:hover{border-color:var(--accent);color:var(--accent)}
.lightsbar .lsel button.go{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.lightsbar .lsel button.go:hover{color:var(--accent-ink);filter:brightness(1.08)}
.lightsbar .lnote{margin:0;color:var(--mute);font-size:11px;line-height:1.4}`;
document.head.append(lbCss);
const lightsBox = document.createElement('div');
lightsBox.className = 'lightsbar'; lightsBox.id = 'lightsbar';
{ const top = $('topctl'); if (top) top.before(lightsBox); }
function lightsBar() {
  const b = lightsBox; b.innerHTML = '';
  const head = document.createElement('span'); head.className = 'sect-label'; head.textContent = 'Lights';
  const row = document.createElement('div'); row.className = 'lbrow';
  RIG.lights.forEach((Lr, i) => {
    const ch = document.createElement('button');
    ch.className = 'lchip' + (Lr.on === false ? ' off' : ''); ch.setAttribute('aria-pressed', String(i === RIG.sel));
    const mode = i === RIG.sel ? S.mode : Lr.mode;
    ch.innerHTML = '<span class="dot"></span><span></span><small></small>';
    ch.children[1].textContent = Lr.name || `Light ${i + 1}`; ch.children[2].textContent = (MODES[mode] || {}).short || '';
    ch.title = `Select ${Lr.name} to see and edit its gobo` + (Lr.on === false ? ' (hidden in the Scene view)' : '');
    ch.onclick = () => selectLight(i);
    row.append(ch);
  });
  const add = document.createElement('button'); add.className = 'ladd'; add.textContent = '+ Add light';
  add.title = 'A new light with a copy of this gobo, turned 45° around its aim point. Change its pattern and settings freely.';
  add.onclick = addLight; row.append(add);
  const sel = document.createElement('div'); sel.className = 'lsel';
  const nm = document.createElement('input'); nm.type = 'text'; nm.value = lightName(); nm.setAttribute('aria-label', 'Light name'); nm.spellcheck = false;
  nm.onchange = () => { lightCur().name = nm.value.trim().replace(/\s+/g, ' ').slice(0, 32) || lightName(); lightsBar(); save(); };
  nm.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
  const vis = document.createElement('button'); vis.textContent = lightOn() ? 'Hide' : 'Show';
  vis.title = 'Hide or show this light in the Scene view (its gobo and settings stay)';
  vis.onclick = () => { lightCur().on = !lightOn(); lightsBar(); viewDirty = true; save(); };
  sel.append(nm, vis);
  if (lightMulti()) { const del = document.createElement('button'); del.textContent = 'Delete'; del.title = 'Remove this light'; del.onclick = () => removeLight(); sel.append(del); }
  const ex = document.createElement('button'); ex.className = 'go';
  ex.textContent = HOST.sendLight ? `Send to ${HOST.label}…` : 'Export light…';
  ex.title = HOST.sendLight ? `Write this light's gobo and light rig and set it up in ${HOST.label}` : 'Write this light\'s gobo frames, with its light rig for Houdini';
  ex.onclick = () => EXPORT.open({rig:'on', who:'this'});
  sel.append(ex);
  const note = document.createElement('p'); note.className = 'lnote';
  note.textContent = lightMulti() ? 'Everything below belongs to the selected light. In the Scene view, click a light to select it.' : 'Add lights to build up a scene: each has its own gobo, pattern and placement.';
  b.append(head, row, sel, note);
}
lightsBar();
