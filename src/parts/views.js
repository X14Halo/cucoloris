/* =====================================================================
   SNAPSHOTS, A/B WIPE AND THE GOBO INSET
   · Snapshots A–D keep the selected light's whole gobo (a settings file)
     to recall later, or to compare against the live one with a wipe line
     across the preview (Gobo or Scene view). A compared snapshot is drawn
     as a hidden light of its own, with its own caches, so both sides play.
   · In the Scene view a small inset shows the gobo itself, with a
     crosshair where the point under the cursor takes its light from.
   ===================================================================== */
const SNAP = {slots:[null, null, null, null], cmp:-1, split:0.5, Lc:null, drag:false};
try { const v = JSON.parse(localStorage.getItem('cucLab.snaps') || 'null'); if (Array.isArray(v)) v.slice(0, 4).forEach((x, i) => { SNAP.slots[i] = x; }); } catch (e) {}
const SNAP_NAMES = ['A', 'B', 'C', 'D'];
function snapPersist() {
  // the paint layers make snapshots large: if browser storage refuses, they still live for this session
  try { localStorage.setItem('cucLab.snaps', JSON.stringify(SNAP.slots)); } catch (e) {}
}
function snapSave(i) {
  SNAP.slots[i] = {at:new Date().toISOString(), light:lightName(), mode:S.mode, settings:settingsFile()};
  snapPersist();
  if (SNAP.cmp === i) compareOff(), compareOn(i);
  snapBar();
}
async function snapRecall(i) {
  const sl = SNAP.slots[i]; if (!sl) return;
  if (SNAP.cmp === i) compareOff();
  await applySettings(sl.settings);
  snapBar();
}
function snapClear(i) { if (SNAP.cmp === i) compareOff(); SNAP.slots[i] = null; snapPersist(); snapBar(); }
// the snapshot as a hidden light: the live light's state, with the snapshot's gobo and placement in it
function compareOn(i) {
  const sl = SNAP.slots[i]; if (!sl) return;
  compareOff();
  const o = sl.settings, m = o.mode;
  const deepc = x => JSON.parse(JSON.stringify(x, (k, v) => k.startsWith('_') ? undefined : v));
  const Lc = {id:'CMP' + i, name:'Snapshot ' + SNAP_NAMES[i], on:true};
  for (const k of LIGHT_STATE) Lc[k] = deepc(S[k]);
  Lc.mode = m;
  Lc.p[m] = {...DEFAULTS[m], ...(o.pattern || {})};
  Lc.post[m] = {...MODES[m].post, ...(o.levels || {})};
  Lc.tl[m] = {...MODES[m].tl, ...(o.timeline || {})};
  if (o.light) { if (shotActive()) { Lc.shotLights[S.shotSel] = Lc.shotLights[S.shotSel] || {}; Lc.shotLights[S.shotSel][m] = deepc(o.light); } else Lc.scenes[m] = deepc(o.light); }
  Lc.ovl.on = {[m]:!!(o.paintOver && o.paintOver.on)};
  Lc.paint = {own:o.paintYourOwn && o.paintYourOwn.image, over:o.paintOver && o.paintOver.image};
  SNAP.Lc = Lc; SNAP.cmp = i;
  snapBar(); dirty = true; viewDirty = true;
}
function compareOff() {
  const Lc = SNAP.Lc; SNAP.Lc = null; SNAP.cmp = -1;
  const c = Lc && Lc.cache;
  if (c) for (const t of [c.final, c.winL]) if (t) { gl.deleteTexture(t.tex); if (t.tex2) gl.deleteTexture(t.tex2); gl.deleteFramebuffer(t.fb); }
  snapBar(); viewDirty = true;
}
/* Swap the snapshot in, bring its gobo up to the current time, run fn (drawing with it), swap the live light back. */
function withCompare(fn) {
  const Lc = SNAP.Lc; if (!Lc) return null;
  const home = lightCur(), keepInfo = info, keepGobo = goboInfo, keepSync = TREES_SYNC, keepSel = RIG.sel;
  const key = [S.t, S.res, S.quality, S.shotSel, SHOT.frame ? SHOT.frame.n : 0].join('|');
  lightStash(home);
  TREES_SYNC = true;
  let out = null;
  try {
    lightUnstash(Lc); lightNormalize();
    // its paint layers, once
    if (Lc.paint && !Lc.paintLoaded) {
      Lc.paintLoaded = true;
      const draw = (T, url) => { const im = new Image(); im.onload = () => { T.ctx.drawImage(im, 0, 0, T.N, T.N); T.dirty = true; T.used = true; Lc.rkey = ''; viewDirty = true; dirty = true; }; im.src = url; };
      if (Lc.paint.own) { const T = paintCanvas(); T.key = 'cucLab.cmp'; draw(T, Lc.paint.own); }
      if (Lc.paint.over) { const T = ovlTarget(S.mode); T.key = 'cucLab.cmp.ovl'; draw(T, Lc.paint.over); }
    }
    if (Lc.rkey !== key || !targets.final || targets.final.w !== S.res) { render(); Lc.rkey = key; }
    out = fn(targets.final);
    lightStash(Lc);
  } finally {
    lightUnstash(home); RIG.sel = keepSel;
    TREES_SYNC = keepSync; info = keepInfo; goboInfo = keepGobo;
  }
  return out;
}
// the snapshot's side of the wipe: the left part of the preview, drawn over the live picture
function drawCompare(sceneOthers) {
  if (!SNAP.Lc) return;
  const x = Math.round(SNAP.split * cv.width);
  if (x <= 0) return;
  const keepLS = LASTSCENE, keepVC = VIEWCAM;
  withCompare(fin => {
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, x, cv.height);
    try {
      if (S.view === 'scene') drawScene(fin, sceneOthers || []);
      else pass(PR.disp, null, p => { tex(p, 'uSrc', fin.tex, 0); f1(p, 'uTiles', S.tiles); i1(p, 'uHeat', S.heat ? 1 : 0); i1(p, 'uSeams', S.seams ? 1 : 0); });
    } finally { gl.disable(gl.SCISSOR_TEST); }
  });
  LASTSCENE = keepLS; VIEWCAM = keepVC;
}
// the wipe line, on the light manipulator's overlay
function drawWipe(ctx) {
  if (!SNAP.Lc) return;
  const w = cv.clientWidth, h = cv.clientHeight, x = SNAP.split * w;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  ctx.fillStyle = 'rgba(14,17,21,.85)'; ctx.beginPath(); ctx.arc(x, h / 2, 11, 0, 7); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('⟷', x, h / 2 + 4);
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(14,17,21,.8)';
  const tag = (t, tx) => { const tw = ctx.measureText(t).width + 12; ctx.fillStyle = 'rgba(14,17,21,.8)'; ctx.fillRect(tx, h - 60, tw, 20); ctx.fillStyle = '#fff'; ctx.fillText(t, tx + 6, h - 46); };
  tag('Snapshot ' + SNAP_NAMES[SNAP.cmp], Math.max(4, x - 110)); tag('Live', x + 8);
  ctx.restore();
}
// dragging the wipe line (ahead of painting, the camera and the light manipulator)
(() => {
  const plate = $('plate');
  const near = e => { if (!SNAP.Lc) return false; const r = cv.getBoundingClientRect(); return Math.abs(e.clientX - (r.left + SNAP.split * r.width)) < 9 && e.clientY > r.top && e.clientY < r.bottom; };
  plate.addEventListener('pointerdown', e => {
    if (!near(e) || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault(); SNAP.drag = true;
    try { plate.setPointerCapture(e.pointerId); } catch (err) {}
  }, true);
  plate.addEventListener('pointermove', e => {
    if (SNAP.drag) { e.stopPropagation(); const r = cv.getBoundingClientRect(); SNAP.split = clamp((e.clientX - r.left) / r.width, 0, 1); viewDirty = true; gizDraw(); return; }
    if (SNAP.Lc) plate.style.cursor = near(e) ? 'ew-resize' : '';
  }, true);
  const up = e => { if (SNAP.drag) { e.stopPropagation(); SNAP.drag = false; } };
  plate.addEventListener('pointerup', up, true); plate.addEventListener('pointercancel', up, true);
})();

/* ---------- the snapshot bar, under the preview ---------- */
const snapEl = document.createElement('div');
snapEl.className = 'snapbar';
{ const vb = document.querySelector('.viewbar'); if (vb) vb.before(snapEl); }
const snapCss = document.createElement('style');
snapCss.textContent = `
.snapbar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;color:var(--mute);font-size:12px}
.snapbar .slots{display:flex;gap:4px}
.snapbar .slot{width:30px;height:26px;border-radius:6px;border:1px dashed var(--line);background:none;color:var(--mute);font-weight:700;cursor:pointer}
.snapbar .slot.full{border-style:solid;background:var(--raise);color:var(--fg)}
.snapbar .slot.cmp{border-color:var(--accent);color:var(--accent)}
.snapbar .slot:hover{border-color:var(--accent)}
.snapbar select{background:var(--raise);border:1px solid var(--line);border-radius:5px;padding:4px 6px}
.snapbar .tip{font-size:11px}
.pip{position:absolute;right:12px;bottom:34px;width:168px;height:168px;border:1px solid var(--line);border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.45);pointer-events:none;display:none;background:#000}
body.in-scene .pip.on{display:block}`;
document.head.append(snapCss);
function snapBar() {
  snapEl.innerHTML = '';
  const lab = document.createElement('span'); lab.textContent = 'Snapshots';
  lab.title = 'Click an empty slot to keep the selected light\'s gobo there. Click a full slot to bring it back; Shift-click to overwrite it; Alt-click to empty it.';
  const slots = document.createElement('div'); slots.className = 'slots';
  SNAP.slots.forEach((sl, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (sl ? ' full' : '') + (SNAP.cmp === i ? ' cmp' : ''); b.textContent = SNAP_NAMES[i];
    b.title = sl ? `${SNAP_NAMES[i]}: ${sl.light} · ${(MODES[sl.mode] || {}).short || sl.mode} · ${new Date(sl.at).toLocaleString()}\nClick: bring it back · Shift-click: overwrite · Alt-click: empty` : `Keep the selected light's gobo in ${SNAP_NAMES[i]}`;
    b.onclick = e => { if (!sl || e.shiftKey) snapSave(i); else if (e.altKey) snapClear(i); else snapRecall(i); };
    slots.append(b);
  });
  const cmpL = document.createElement('label'); cmpL.textContent = 'Compare ';
  const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Compare with a snapshot');
  sel.innerHTML = '<option value="-1">Off</option>' + SNAP.slots.map((sl, i) => sl ? `<option value="${i}">Wipe: ${SNAP_NAMES[i]} | live</option>` : '').join('');
  sel.value = String(SNAP.cmp);
  sel.onchange = () => { const v = +sel.value; if (v < 0) compareOff(); else compareOn(v); };
  cmpL.append(sel);
  snapEl.append(lab, slots, cmpL);
  if (SNAP.Lc) { const t = document.createElement('span'); t.className = 'tip'; t.textContent = 'Drag the line across the preview'; snapEl.append(t); }
}
snapBar();
// the inset's switch, beside the other view settings (Scene view only)
{
  const vb = document.querySelector('.viewbar');
  if (vb) {
    const l = document.createElement('label'); l.className = 'tog scene-only';
    l.innerHTML = '<input type="checkbox" id="vPip"> Gobo inset'; l.title = 'A small view of the gobo in the corner, with a crosshair where the point under the cursor takes its light from';
    const ex = vb.querySelector('#exportBtn'); if (ex) ex.before(l); else vb.append(l);
    const cb = l.querySelector('input'); cb.checked = S.pip !== false;
    cb.onchange = () => { S.pip = cb.checked; pipDraw(true); save(); };
  }
  const st = document.createElement('style'); st.textContent = 'body:not(.in-scene) .scene-only{display:none}'; document.head.append(st);
}

/* ---------- the gobo inset in the Scene view ---------- */
const pip = document.createElement('canvas');
pip.className = 'pip on'; pip.width = pip.height = 336; pip.setAttribute('aria-hidden', 'true');
$('plate').append(pip);
let pipUV = null, pipT = 0;
if (S.pip === undefined) S.pip = true;
function pipDraw(force) {
  pip.classList.toggle('on', !!S.pip);
  if (S.view !== 'scene' || !S.pip) return;
  const now = performance.now();
  if (!force && now - pipT < 120) return;
  pipT = now;
  const th = goboThumb(), x = pip.getContext('2d'), n = pip.width;
  x.fillStyle = '#000'; x.fillRect(0, 0, n, n);
  if (th) { x.imageSmoothingEnabled = true; x.drawImage(th, 0, 0, n, n); }
  x.font = '600 20px system-ui, sans-serif'; x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText('Gobo · ' + lightName(), 10, 28);
  if (pipUV) {
    // a repeating tile shows where in the tile; outside a framed gobo, the cursor gets no light from it
    const S0 = LASTSCENE, tiled = S0 && (S0.rep > 1.0001 || (S0.ltype === 1 && goboProjection().single === 0));
    let u = pipUV[0], v = pipUV[1];
    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    if (tiled) { u -= Math.floor(u); v -= Math.floor(v); }
    if (tiled || inside) {
      const px = u * n, py = (1 - v) * n;
      x.strokeStyle = '#f0b25e'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, n); x.moveTo(0, py); x.lineTo(n, py); x.stroke();
      x.beginPath(); x.arc(px, py, 9, 0, 7); x.stroke();
    } else { x.fillStyle = 'rgba(240,178,94,.9)'; x.fillText('cursor is outside the gobo', 10, n - 14); }
  }
}
// where the point under the cursor takes its light from, while hovering the Scene view
(() => {
  let raf = 0, last = null;
  cv.addEventListener('pointermove', e => {
    if (S.view !== 'scene' || !S.pip) return;
    last = {clientX:e.clientX, clientY:e.clientY};
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const p = last && sceneHit(last);
      pipUV = p ? goboUVAt(p) : null; pipDraw(true);
    });
  });
  cv.addEventListener('pointerleave', () => { pipUV = null; pipDraw(true); });
})();

/* =====================================================================
   KEEP HERO LIT
   Pick a spot in the Scene view (a face, the hero's hands), then let the tool slide the gobo across the beam
   until that spot sits in light for as much of the shot as it can: it renders the gobo at a few moments across
   the timeline, reads where the spot falls in each, and tries every offset. The light itself never moves.
   ===================================================================== */
const HERO = {picking:false, msg:''};
function heroSamples(c) {
  // the spot as a small disc facing the light: a centre and two rings, in the beam's own uv (before any offset)
  const L = sceneLight(), P = c.hero, r = c.heroR || 0.25, out = [];
  if (!P) return out;
  const add = p => { const q = goboUVRaw(p); if (q) out.push(q); };
  add(P);
  for (const [k, n] of [[0.5, 6], [1, 12]]) for (let i = 0; i < n; i++) {
    const a = (i + (k < 1 ? 0.5 : 0)) / n * 2 * Math.PI;
    add(v3.add(P, v3.add(v3.mul(L.r, Math.cos(a) * r * k), v3.mul(L.u, Math.sin(a) * r * k))));
  }
  return out;
}
function heroFind() {
  const c = SC();
  if (!c.hero || !LASTSCENE) { HERO.msg = 'Pick the hero spot first.'; return; }
  const smp = heroSamples(c);
  if (!smp.length) { HERO.msg = 'The light does not reach that spot.'; return; }
  const G = goboProjection(c), wrap = G.single, tl = TL();
  // a few moments across the timeline (a looping gobo: across its loop)
  const span = tl.loop ? tl.len : Math.min(tl.len || 10, 12), K = 8, R = 128, t0 = S.t;
  const keep = {res:S.res, t:S.t, quality:S.quality}, keepSync = TREES_SYNC, imgs = [];
  TREES_SYNC = true;
  try {
    S.res = R; S.quality = 'draft';
    for (let k = 0; k < K; k++) {
      S.t = tl.loop ? (t0 + k * span / K) % span : t0 + k * span / K;
      dirty = true;
      imgs.push(EXPORT.grab(R, 1).data);
    }
  } finally {
    TREES_SYNC = keepSync; S.res = keep.res; S.t = keep.t; S.quality = keep.quality;
    const T = targets.expF; if (T) { gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); delete targets.expF; }
    dirty = true;
  }
  let gm = 0; for (const im of imgs) { let s = 0; for (let i = 0; i < im.length; i++) s += im[i]; gm += s / im.length / K; }
  const look = (im, u, v) => {
    if (wrap === 0 || wrap === 3) u -= Math.floor(u);
    if (wrap === 0) v -= Math.floor(v);
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return wrap === 1 ? 1 : 0;
    return im[Math.min(R - 1, Math.floor((1 - v) * R)) * R + Math.min(R - 1, Math.floor(u * R))];
  };
  const score = (ox, oy) => {
    let m = 0, m2 = 0;
    for (const im of imgs) { let s = 0; for (const q of smp) s += look(im, q[0] - ox, q[1] - oy); s /= smp.length; m += s / K; m2 += s * s / K; }
    const sd = Math.sqrt(Math.max(m2 - m * m, 0));
    return {m, sd, s:m - 0.6 * sd};
  };
  // a repeating gobo can slide a whole tile; a framed one (a light pool, a single branch, a window) only a little,
  // so its frame stays on the set
  const tiled = wrap === 0 || wrap === 3, ext = tiled ? 0.5 : 0.15, N = tiled ? 32 : 24;
  const was = score(c.goffX || 0, c.goffY || 0), zero = score(0, 0);
  let best = {ox:c.goffX || 0, oy:c.goffY || 0, ...was};
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const ox = -ext + 2 * ext * i / N, oy = wrap === 3 ? 0 : -ext + 2 * ext * j / N;
    const r = score(ox, oy), pen = 0.03 * gm * Math.hypot(ox, oy);   // among equals, the smallest slide
    if (r.s - pen > best.s - 0.03 * gm * Math.hypot(best.ox, best.oy) + 1e-6) best = {ox, oy, ...r};
    if (wrap === 3) break;
  }
  c.goffX = +best.ox.toFixed(3); c.goffY = +best.oy.toFixed(3);
  // in terms of the open light (a gobo value of 1: no shadow), averaged over the moments tried
  const pct = x => Math.round(100 * x) + '%';
  HERO.msg = `The spot now gets ${pct(best.m)} of the open light on average (it had ${pct(was.m)}${(was.m !== zero.m) ? `, ${pct(zero.m)} with no offset` : ''}; ` +
    `the whole gobo averages ${pct(gm)}), over ${span.toFixed(0)} s. Offset ${c.goffX.toFixed(3)}, ${c.goffY.toFixed(3)} of the image.`;
  viewDirty = true; save();
}
function heroGroup() {
  const c = SC();
  const items = [[HERO.picking ? 'Click the spot in the view…' : c.hero ? 'Pick the spot again' : 'Pick the hero spot', () => { HERO.picking = !HERO.picking; buildPanel(); }]];
  if (c.hero) items.push(['Find the best offset', () => { HERO.msg = 'Searching…'; buildPanel(); setTimeout(() => { heroFind(); buildPanel(); }, 30); }]);
  if (c.goffX || c.goffY) items.push(['Clear the offset', () => { c.goffX = 0; c.goffY = 0; HERO.msg = ''; viewDirty = true; save(); buildPanel(); }]);
  const params = [
    {type:'note', l:'Slides the gobo across the beam so the spot you pick (a face, the hero\'s hands) stays in light through the shot. The light does not move; the offset goes out with the light rig.'},
    {type:'buttons', items},
  ];
  if (c.hero) params.push({k:'heroR', l:'Spot size', min:0.05, max:1.5, step:0.01, u:'m', h:'Radius of the area to keep lit, around the picked point.'});
  if (HERO.msg) params.push({type:'note', l:HERO.msg});
  return {name:'Keep hero lit', params};
}
// picking: the next click in the Scene view sets the spot (and does not aim the light or paint)
(() => {
  const block = e => { if (HERO.picking && e.target === cv && S.view === 'scene') { e.stopImmediatePropagation(); e.preventDefault(); return true; } return false; };
  window.addEventListener('pointerdown', e => {
    if (!block(e)) return;
    const p = sceneHit(e);
    if (p) { const c = SC(); c.hero = p.map(v => +v.toFixed(4)); if (!c.heroR) c.heroR = 0.25; HERO.picking = false; HERO.justPicked = true; HERO.msg = ''; viewDirty = true; save(); buildPanel(); }
  }, true);
  window.addEventListener('pointerup', e => { if (e.target === cv && HERO.justPicked) { e.stopImmediatePropagation(); HERO.justPicked = false; } }, true);
  window.addEventListener('pointerdown', e => { if (e.target === cv && !HERO.picking) HERO.justPicked = false; }, true);
})();
// the spot, drawn where it sits in the Scene view
function heroDraw(ctx) {
  const c = SC(); if (!c.hero || S.view !== 'scene') return;
  const L = sceneLight(), r = c.heroR || 0.25;
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(240,178,94,.95)'; ctx.setLineDash([5, 4]);
  ctx.beginPath(); let on = false;
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * 2 * Math.PI, q = toCss(v3.add(c.hero, v3.add(v3.mul(L.r, Math.cos(a) * r), v3.mul(L.u, Math.sin(a) * r))));
    if (!q) { on = false; continue; } if (on) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); on = true; }
  }
  ctx.stroke(); ctx.setLineDash([]);
  const q = toCss(c.hero); if (q) { ctx.fillStyle = 'rgba(240,178,94,.95)'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText('hero', q[0] + 6, q[1] - 6); }
}
