/* =====================================================================
   UI
   ===================================================================== */
function decimals(step) { const s = String(step); return s.includes('.') ? s.split('.')[1].length : 0; }
function fmtVal(def, v) {
  if (def.fmt) return def.fmt(v);
  return (+v).toFixed(decimals(def.step)) + (def.u ? (def.u === '°' || def.u === '×' ? def.u : ' ' + def.u) : '');
}
function setPct(input) { const pct = (input.value - input.min) / (input.max - input.min) * 100; input.style.setProperty('--pct', pct + '%'); }

function control(def, store, idPrefix, dflt, onChange) {
  const id = idPrefix + '-' + def.k;
  const row = document.createElement('div');
  row.className = 'row' + (def.type === 'chk' ? ' chk' : '');
  const lab = document.createElement('label');
  lab.htmlFor = id; lab.textContent = def.l;
  if (def.h) lab.title = def.h;
  row.append(lab);
  if (def.opts) {
    const sel = document.createElement('select'); sel.id = id;
    def.opts.forEach((o, i) => { const op = document.createElement('option'); op.value = def.vals ? def.vals[i] : i; op.textContent = o; sel.append(op); });
    sel.value = store[def.k];
    sel.onchange = () => { store[def.k] = def.vals && typeof def.vals[0] === 'string' ? sel.value : +sel.value; onChange(def.k); };
    row.append(sel);
  } else if (def.type === 'color') {
    const ci = document.createElement('input'); ci.type = 'color'; ci.id = id; ci.value = store[def.k] || '#ffffff'; ci.className = 'swatch';
    ci.oninput = () => { store[def.k] = ci.value; onChange(def.k); };
    lab.ondblclick = () => { if (dflt && dflt[def.k] !== undefined) { ci.value = dflt[def.k]; ci.oninput(); } };
    row.append(ci);
  } else if (def.type === 'buttons') {
    row.className = 'chips'; lab.remove();
    def.items.forEach(([t, fn]) => { const b = document.createElement('button'); b.className = 'pchip'; b.textContent = t; b.onclick = fn; row.append(b); });
  } else if (def.type === 'mount') {
    row.className = 'mountrow'; lab.remove(); def.mount(row);
  } else if (def.type === 'note') {
    row.className = 'phint'; row.textContent = def.l;
  } else if (def.type === 'chk') {
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = !!store[def.k];
    cb.onchange = () => { store[def.k] = cb.checked; onChange(def.k); };
    row.append(cb);
  } else {
    const out = document.createElement('output'); out.htmlFor = id;
    const rg = document.createElement('input');
    rg.type = 'range'; rg.id = id;
    const toSlider = v => def.log ? 1000 * Math.log(v / def.min) / Math.log(def.max / def.min) : v;
    const fromSlider = x => def.log ? Math.round(def.min * Math.pow(def.max / def.min, x / 1000) / def.step) * def.step : +x;
    if (def.log) { rg.min = 0; rg.max = 1000; rg.step = 1; } else { rg.min = def.min; rg.max = def.max; rg.step = def.step; }
    rg.value = toSlider(store[def.k]);
    out.textContent = fmtVal(def, store[def.k]);
    setPct(rg);
    rg.oninput = () => { store[def.k] = fromSlider(rg.value); out.textContent = fmtVal(def, store[def.k]); setPct(rg); onChange(def.k); };
    lab.ondblclick = () => { if (dflt && dflt[def.k] !== undefined) { rg.value = toSlider(dflt[def.k]); rg.oninput(); } };
    row.append(out, rg);
  }
  if (def.h && def.showHint) { const h = document.createElement('p'); h.className = 'phint'; h.textContent = def.h; row.append(h); }
  return row;
}
const changed = () => { dirty = true; save(); };

function buildModes() {
  const nav = $('modes'); nav.innerHTML = '';
  for (const [k, m] of Object.entries(MODES)) {
    const b = document.createElement('button');
    b.className = 'mode'; b.setAttribute('role', 'tab'); b.id = 'mode-' + k; b.textContent = m.short;
    b.setAttribute('aria-selected', k === S.mode);
    b.onclick = () => { S.mode = k; syncShotTimeline(); S.t = S.t % TL().len; buildModes(); buildPanel(); buildTimeline(); changed(); };
    nav.append(b);
  }
}
function buildPanel() {
  const hint = document.querySelector('.camhint');
  if (hint) hint.textContent = S.view === 'scene' && scenePaintOn() ? 'Painting into the gobo where the light lands · Alt-drag to orbit · Right-drag to pan' : S.view === 'scene' && inShot() ? ((S.shot.view | 0) === 0 ? 'Seen through the shot camera · Click to aim the light · Alt-drag or scroll to move around (Maya controls)' : 'Alt + left tumble · Alt + middle track · Alt + right dolly · Scroll zoom · F frames the aim · Click to aim the light')
                                                          : 'Drag or Alt + left to orbit · Alt + middle or right-drag to pan · Alt + right dolly · Scroll zoom · Double-click resets';
  const m = MODES[S.mode], store = S.p[S.mode];
  const pr = $('presets'); pr.innerHTML = '';
  m.presets.forEach(ps => {
    const b = document.createElement('button'); b.className = 'pchip'; b.textContent = ps.name;
    b.onclick = () => {
      const prev = S.p[S.mode];
      S.p[S.mode] = {...DEFAULTS[S.mode], ...ps.v, seed:prev.seed};
      // a framing the user chose stays put when they try other presets
      if (S.userFraming && S.userFraming[S.mode]) for (const k of ['framing', 'poolSize', 'poolSoft']) if (prev[k] !== undefined) S.p[S.mode][k] = prev[k];
      buildPanel(); changed();
    };
    pr.append(b);
  });
  const rs = document.createElement('button'); rs.className = 'pchip alt'; rs.textContent = 'New seed';
  rs.onclick = () => { S.p[S.mode].seed = 1 + Math.floor(Math.random() * 9999); buildPanel(); changed(); };
  pr.append(rs);
  const groups = $('groups'); groups.innerHTML = '';
  const mk = (title, defs, st, dflt, open = true, off = false, first = false) => {
    const d = document.createElement('details'); d.className = 'grp' + (off ? ' off' : ''); d.open = open && !off;
    const s = document.createElement('summary'); s.innerHTML = '<span class="sect-label"></span>'; s.firstChild.textContent = title + (off ? ' · off while painting' : '');
    const c = document.createElement('div'); c.className = 'ctrls';
    const onCh = st === store && m.onParam ? k => { if (m.onParam(k, st)) buildPanel(); changed(); } : changed;
    defs.forEach(def => c.append(control(def, st, S.mode + (st === store ? '' : '-post'), dflt, onCh)));
    d.append(s, c); if (first) { d.classList.add('first'); groups.prepend(d); } else groups.append(d);
  };
  if (S.view === 'scene') {
    const onScene = k => {
      if (k === 'set') S.cams[S.mode] = camDefault(S.mode);
      if (k === 'ltype' && inShot()) SC().ev = SC().ltype === 0 ? +clamp(Math.log2(SC().dist * SC().dist / 25), -6, 6).toFixed(1) : 0; if (k === 'ltype' || k === 'set' || k === 'follow' || k === 'real') buildPanel(); viewDirty = true; save(); };
    SCENE_GROUPS().forEach((g, gi) => {
      const d = document.createElement('details'); d.className = 'grp scene'; d.open = true;
      const sm = document.createElement('summary'); sm.innerHTML = '<span class="sect-label"></span>'; sm.firstChild.textContent = g.name;
      const c = document.createElement('div'); c.className = 'ctrls';
      if (g.shot) { d.open = true; g.params.forEach(def => c.append(control(def, S.shot, 'shot', null, shotParamChanged))); d.append(sm, c); groups.append(d); return; }
      g.params.forEach(def => c.append(control(def, SC(), 'scene', sceneDefaults(S.mode), onScene)));
      if (g.name === 'Scene light') {
        const b = document.createElement('button'); b.className = 'pchip'; b.textContent = 'Match real scale';
        b.title = 'Size the gobo so one tile covers its true size in metres at the aim point.';
        b.onclick = () => { matchScale(); buildPanel(); viewDirty = true; save(); };
        const rb = document.createElement('button'); rb.className = 'pchip alt'; rb.textContent = 'Reset light';
        rb.onclick = () => { if (shotActive()) delete (S.shotLights[S.shotSel] || {})[S.mode]; else { S.scenes[S.mode] = sceneDefaults(S.mode); S.cams[S.mode] = camDefault(S.mode); } buildPanel(); viewDirty = true; save(); };
        const row = document.createElement('div'); row.className = 'chips'; if (!SC().real) row.append(b); row.append(rb); c.append(row);
      }
      d.append(sm, c); groups.append(d);
    });
  }
  // Paint over: available for every pattern, near the top
  {
    S.ovl.__on = ovlOn();
    const d = document.createElement('details'); d.className = 'grp first'; d.open = true;
    const sm = document.createElement('summary'); sm.innerHTML = '<span class="sect-label"></span>'; sm.firstChild.textContent = 'Paint over';
    const c = document.createElement('div'); c.className = 'ctrls';
    ovlGroup().forEach(def => c.append(control(def, S.ovl, 'ovl', null, ovlChanged)));
    d.append(sm, c); groups.prepend(d);
  }
  // Framing is the first decision for a gobo, so it sits above everything else in the panel
  const top = $('topctl'); top.innerHTML = ''; top.hidden = true;
  const groupsNow = m.groups.map(g => ({...g, params:g.params.filter(d => d.k !== 'framing')}));
  const fdef = m.groups.flatMap(g => g.params).find(d => d.k === 'framing');
  if (fdef) {
    top.hidden = false;
    const onCh = k => {
      S.userFraming = S.userFraming || {};
      S.userFraming[S.mode] = (store.framing | 0) !== (DEFAULTS[S.mode].framing | 0);
      if (!m.onParam || m.onParam(k, store)) buildPanel(); changed();
    };
    top.append(control({...fdef, l:'Framing'}, store, S.mode, DEFAULTS[S.mode], onCh));
  }
  groupsNow.filter(g => g.params.length).forEach(g => mk(g.name, g.params, store, DEFAULTS[S.mode], true, !!g.off, !!g.first));
  mk('Output levels', POST, S.post[S.mode], MODES[S.mode].post, false);
}
function buildTimeline() {
  const tl = TL(), box = $('timeline'); box.innerHTML = '';
  const defs = [
    {k:'loop', l:'Seamless loop', type:'chk', showHint:true, h:'Every frequency snaps to whole cycles of the loop, so the last frame flows into the first.'},
    {k:'len', l:tl.loop ? 'Loop length' : 'Sequence length', min:1, max:1800, step:0.5, log:true, fmt:fmtLen},
    {k:'shutter', l:'Motion blur', opts:['Off', '90° shutter', '180° shutter (film)', '270° shutter', '360° shutter'], vals:[0, 90, 180, 270, 360], h:'Averages sub-frames across the shutter interval, as a real camera does. Draft quality skips it.'},
  ];
  defs.forEach(def => box.append(control(def, tl, 'tl-' + S.mode, MODES[S.mode].tl, k => {
    if (k === 'loop') buildTimeline();
    if (k === 'len') S.t = S.t % tl.len;
    changed();
  })));
  box.append(control({k:'fps', l:'Frame rate', opts:['24', '25', '30', '48', '60'], vals:[24, 25, 30, 48, 60]}, S, 'tl', {fps:24}, changed));

}

// view controls
const vRes = $('vRes'), vQual = $('vQual'), vTiles = $('vTiles'), vHeat = $('vHeat'), vSeams = $('vSeams');
vRes.value = S.res; vQual.value = S.quality; vTiles.value = S.tiles;
vRes.onchange = () => { S.res = +vRes.value; changed(); };
vQual.onchange = () => { S.quality = vQual.value; changed(); };
vTiles.onchange = () => { S.tiles = +vTiles.value; viewDirty = true; save(); };
vHeat.onchange = () => { S.heat = vHeat.checked; viewDirty = true; };
vSeams.onchange = () => { S.seams = vSeams.checked; viewDirty = true; };
function setView(v) {
  S.view = v;
  for (const k of ['gobo', 'scene']) $('vw-' + k).setAttribute('aria-selected', k === v);
  document.body.classList.toggle('in-scene', v === 'scene');
  cv.setAttribute('aria-label', v === 'scene' ? 'Scene preview: the gobo projected through a light onto a grey set' : 'Gobo preview');
  buildPanel(); fit(); viewDirty = true; dirty = true; save(); updateHud(0);
}
$('vw-gobo').onclick = () => setView('gobo');
// reset everything: a second click within a few seconds confirms, then the tool restarts with factory settings
{
  const rb = $('resetAll'); let armed = 0;
  if (rb) rb.onclick = () => {
    if (Date.now() - armed < 4000) {
      window.__noSave = true; clearTimeout(saveTimer);
      try { localStorage.removeItem(STORE); localStorage.removeItem('cucLab.paint'); Object.keys(localStorage).filter(k => k.startsWith('cucLab.ovl.')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      location.reload();
      return;
    }
    armed = Date.now(); rb.textContent = 'Click again to reset every setting and your painting';
    setTimeout(() => { if (Date.now() - armed >= 3900) rb.textContent = 'Reset everything to defaults'; }, 4000);
  };
}
$('vw-scene').onclick = () => setView('scene');
document.body.classList.toggle('in-scene', S.view === 'scene');
for (const k of ['gobo', 'scene']) $('vw-' + k).setAttribute('aria-selected', k === S.view);

// transport
const playBtn = $('play'), scrub = $('scrub'), tc = $('tc');
const ICON_PAUSE = '<path d="M4 2h3v12H4zM9 2h3v12H9z"/>', ICON_PLAY = '<path d="M4 2l10 6-10 6z"/>';
function setPlaying(v) {
  S.playing = v; $('playIcon').innerHTML = v ? ICON_PAUSE : ICON_PLAY;
  playBtn.setAttribute('aria-label', v ? 'Pause' : 'Play');
}
playBtn.onclick = () => setPlaying(!S.playing);
function stepFrame(d) {
  setPlaying(false);
  const total = Math.max(1, Math.round(TL().len * S.fps));
  const f = Math.floor(S.t * S.fps + 1e-6);
  S.t = (((f + d) % total + total) % total) / S.fps; dirty = true;
}
$('prev').onclick = () => stepFrame(-1);
$('next').onclick = () => stepFrame(1);
scrub.oninput = () => { setPlaying(false); S.t = scrub.value / 1000 * TL().len; dirty = true; };
document.addEventListener('keydown', ev => {
  const ae = document.activeElement;
  if (ev.code !== 'Space') return;
  if (ae && (/SELECT|BUTTON|TEXTAREA/.test(ae.tagName) || (ae.tagName === 'INPUT' && ae.type !== 'range'))) return;
  ev.preventDefault(); setPlaying(!S.playing);
});
function updateTransport() {
  const len = TL().len;
  const total = Math.max(1, Math.round(len * S.fps));
  const f = Math.min(total - 1, Math.floor(S.t * S.fps + 1e-6));
  const sd = shotActive() && SHOT.frames.length > 1 && shotDef(S.shotSel);
  tc.textContent = sd ? `${sd.shot} · frame ${sd.first + Math.min(f, sd.last - sd.first)} (${sd.first}–${sd.last})` : `${S.t.toFixed(2)} s · frame ${f + 1}/${total}`;
  // a host that wants its own timeline to follow hears the frame number the export would write
  if (HOST.frameChanged) {
    const num = sd ? sd.first + Math.min(f, sd.last - sd.first) : ((S.exp && +S.exp.first) || 1001) + f;
    if (num !== updateTransport.last) { updateTransport.last = num; try { HOST.frameChanged(num); } catch (e) { console.error(e); } }
  }
  scrub.value = Math.round(S.t / len * 1000); setPct(scrub);
}

// canvas sizing
const plate = $('plate');
function fit() {
  const r = plate.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (S.view === 'scene') {
    const w = Math.max(120, Math.floor(r.width - 2)), h = Math.max(120, Math.floor(r.height - 2));
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const k = Math.min(dpr, 1100 / Math.max(w, h));
    const pw = Math.round(w * k), ph = Math.round(h * k);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    viewDirty = true;
    return;
  }
  const css = Math.max(120, Math.floor(Math.min(r.width, r.height) - 24));
  cv.style.width = css + 'px'; cv.style.height = css + 'px';
  const px = Math.min(2048, Math.round(css * dpr));
  if (cv.width !== px || cv.height !== px) { cv.width = px; cv.height = px; }
  viewDirty = true;
}
new ResizeObserver(fit).observe(plate);

// HUD
const hud = $('hud');
function updateHud(ms) {
  const m = MODES[S.mode], tl = TL();
  hud.innerHTML = '';
  const add = (txt, cls) => { const c = document.createElement('span'); c.className = 'chip' + (cls ? ' ' + cls : ''); c.textContent = txt; hud.append(c); };
  if (typeof TR !== 'undefined' && TR.windPending && MODES[S.mode].kind === 'trees') add('Simulating the wind…', 'ok windchip');
  if (S.view === 'scene') {
    const c = SC();
    add('Scene preview', 'ok');
    add(c.ltype === 1 ? `Sun ${(followsSun() ? S.p[S.mode].sunElev : c.el).toFixed(0)}°` : `Spot ${c.cone.toFixed(0)}° · ${c.dist.toFixed(1)} m`);
    add(ms ? `${ms.toFixed(0)} ms/frame` : 'paused');
    return;
  }
  add(`${S.res}²`);
  add(ms ? `${ms.toFixed(0)} ms/frame` : 'paused');
  const tileNow = m.tileableNow !== undefined ? m.tileableNow : m.tileable && !usesPool() && !(m.kind === 'trees' && (S.p[S.mode].framing | 0) === 1);
  add(tileNow ? 'Seamless tile' : m.target === 2 && !(S.p.hull.fade > 0) ? 'Tiles sideways' : 'Single frame', 'ok');
  add(tl.loop ? `Loop ${fmtLen(tl.len)}` : `Sequence ${fmtLen(tl.len)}`, tl.loop ? 'ok' : '');
  if (tl.shutter > 0 && QUAL[S.quality].sub > 1) add(S.playing && !S.mbPlay ? 'Motion blur when paused' : `${tl.shutter}° shutter`);
}

