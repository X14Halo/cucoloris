/* =====================================================================
   LIGHT MANIPULATOR
   Click the light in the Scene view to select it, then move it with
   Maya-style handles (W: translate along X, Y, Z or in the view plane)
   or turn it with rotate rings (E: yaw around world Y, tilt around the
   light's own side axis, roll around its beam). The light keeps its
   aim relationship: moving carries the aim point along, turning swings
   the aim point around the light. Alt still drives the camera.
   ===================================================================== */
const GIZ = {sel:false, mode:'move', drag:null, hover:null};
const gcv = $('giz'), gctx = gcv ? gcv.getContext('2d') : null;
const GCOL = {x:'#e8574a', y:'#7cc95a', z:'#4f8ff0', p:'#f0d264', sel:'#f0b25e'};
// the light as it is placed now
function lightNow() {
  const c = SC(), L = sceneLight(), dir = v3.mul(L.f, -1);
  // a sun has no real position: its handle sits up the beam from the aim point, close enough to stay in view
  let gd = c.dist;
  if (c.ltype === 1 && VIEWCAM) for (let i = 0; i < 12 && gd > 0.3; i++) { const q = toCss(v3.add(L.aim, v3.mul(dir, gd))); if (q && onScreen(q, 70)) break; gd *= 0.75; }
  const pos = c.ltype === 1 ? v3.add(L.aim, v3.mul(dir, gd)) : L.pos;
  return {c, L, dir, pos, gd};
}
const onScreen = (q, m) => q[0] > m && q[1] > m && q[0] < cv.clientWidth - m && q[1] < cv.clientHeight - m;
// bring a light that is out of view into view (leaving the shot camera if need be)
function frameLight() {
  const {L, pos} = lightNow(), q = toCss(pos);
  if (q && onScreen(q, 30)) return;
  if (inShot() && (S.shot.view | 0) === 0) { S.shotCams[S.shotSel] = shotOrbitCam(); S.shot.view = 1; }
  const cam = CAM(), mid = v3.mul(v3.add(pos, L.aim), 0.5), span = Math.hypot(...v3.sub(pos, L.aim));
  Object.assign(cam, {tx:mid[0], ty:mid[1], tz:mid[2], dist:inShot() ? Math.max(span * 1.8, 2) : clamp(span * 1.8, 1, 30)});
  if (!inShot()) { cam.tx = clamp(cam.tx, -8, 8); cam.ty = clamp(cam.ty, 0, 6); cam.tz = clamp(cam.tz, -1, 10); }
  buildPanel(); viewDirty = true; save();
}
const dprNow = () => cv.width / Math.max(cv.clientWidth, 1);
// world point to CSS pixels on the canvas (y down)
function toCss(X) {
  if (!VIEWCAM) return null;
  const p = VIEWCAM.project(X); if (!p) return null;
  const d = dprNow(); return [p[0] / d, (cv.height - p[1]) / d, p[2]];
}
function gizScale(pos) {
  // world length that shows as about 70 px on screen at the light
  const a = toCss(pos), b = toCss(v3.add(pos, VIEWCAM.r));
  if (!a || !b) return null;
  return 70 / Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-6);
}
function ringAxes(Ln) {
  const f = Ln.L.f, up = [0, 1, 0];
  let side = v3.cross(f, up); if (Math.hypot(...side) < 1e-4) side = [1, 0, 0];
  return [{k:'y', a:up, col:GCOL.y, what:'turn'}, {k:'x', a:v3.norm(side), col:GCOL.x, what:'tilt'}, {k:'z', a:f, col:GCOL.z, what:'roll'}];
}
// handles in screen space for picking and drawing
function gizHandles() {
  const Ln = lightNow(), ctr = toCss(Ln.pos); if (!ctr) return null;
  const s = gizScale(Ln.pos); if (!s) return null;
  const H = {Ln, ctr, s, items:[]};
  if (!GIZ.sel) return H;
  if (GIZ.mode === 'move') {
    for (const [k, a] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
      const e = toCss(v3.add(Ln.pos, v3.mul(a, s))); if (e) H.items.push({k, type:'axis', a, p0:ctr, p1:e, col:GCOL[k]});
    }
    H.items.push({k:'p', type:'plane', p0:ctr, col:GCOL.p});
  } else {
    for (const R of ringAxes(Ln)) {
      const a = R.a, t1 = v3.norm(Math.abs(a[1]) < 0.9 ? v3.cross(a, [0, 1, 0]) : v3.cross(a, [1, 0, 0])), t2 = v3.cross(a, t1), pts = [];
      for (let i = 0; i <= 64; i++) { const th = i / 64 * 2 * Math.PI; const q = toCss(v3.add(Ln.pos, v3.mul(v3.add(v3.mul(t1, Math.cos(th)), v3.mul(t2, Math.sin(th))), s * 0.85))); pts.push(q ? [q[0], q[1], th] : null); }
      H.items.push({k:R.k, type:'ring', a, t1, t2, pts, col:R.col});
    }
  }
  return H;
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1);
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t];
}
function gizPick(m) {
  const H = gizHandles(); if (!H) return null;
  let best = null, bd = 9;
  for (const it of H.items) {
    if (it.type === 'axis') { const [d] = distSeg(m, it.p0, it.p1); if (d < bd) { bd = d; best = {it}; } }
    else if (it.type === 'plane') { if (Math.max(Math.abs(m[0] - it.p0[0]), Math.abs(m[1] - it.p0[1])) < 9) { bd = 0; best = {it}; } }
    else for (let i = 0; i < 64; i++) { const a = it.pts[i], b = it.pts[i + 1]; if (!a || !b) continue; const [d, t] = distSeg(m, a, b); if (d < bd) { bd = d; best = {it, th:a[2] + t * (b[2] - a[2])}; } }
  }
  if (best) return best;
  if (Math.hypot(m[0] - H.ctr[0], m[1] - H.ctr[1]) < 14) return {light:true};
  return null;
}
// freeze the light as it is placed now into its own settings, so moving it never jumps
function bakeLight() {
  const {c, L, dir, pos, gd} = lightNow();
  c.follow = false;
  c.el = Math.asin(clamp(dir[1], -1, 1)) / DEG; c.az = Math.atan2(dir[0], dir[2]) / DEG;
  [c.aimX, c.aimY, c.aimZ] = L.aim;
  return {pos, f:L.f, roll:c.roll || 0, gd};
}
function setLight(pos, f, roll, gd) {
  const c = SC(), dir = v3.mul(f, -1);
  c.el = Math.asin(clamp(dir[1], -1, 1)) / DEG; c.az = Math.atan2(dir[0], dir[2]) / DEG; c.roll = roll;
  const aim = v3.sub(pos, v3.mul(dir, gd ?? c.dist));
  [c.aimX, c.aimY, c.aimZ] = aim;
  viewDirty = true;
}
const rotAxis = (v, k, th) => {
  const c = Math.cos(th), s = Math.sin(th);
  return v3.add(v3.add(v3.mul(v, c), v3.mul(v3.cross(k, v), s)), v3.mul(k, v3.dot(k, v) * (1 - c)));
};
function gizDraw() {
  if (!gctx) return;
  // keep the overlay exactly over the preview canvas
  const pr = $('plate').getBoundingClientRect(), r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  gcv.style.left = (r.left - pr.left) + 'px'; gcv.style.top = (r.top - pr.top) + 'px'; gcv.style.width = r.width + 'px'; gcv.style.height = r.height + 'px';
  const W = Math.round(r.width * d), Hh = Math.round(r.height * d);
  if (gcv.width !== W || gcv.height !== Hh) { gcv.width = W; gcv.height = Hh; }
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, W, Hh);
  if (S.view !== 'scene' || !VIEWCAM || (inShot() && (S.shot.disp | 0) > 0)) return;
  gctx.setTransform(d, 0, 0, d, 0, 0);
  const H = gizHandles(); if (!H) return;
  const {Ln, ctr} = H, sun = Ln.c.ltype === 1;
  // the light's icon, and a line to where it is aimed
  const aim = toCss(Ln.L.aim);
  gctx.lineWidth = 1.5;
  if (aim) { gctx.setLineDash([4, 4]); gctx.strokeStyle = 'rgba(255,255,255,.55)'; gctx.beginPath(); gctx.moveTo(ctr[0], ctr[1]); gctx.lineTo(aim[0], aim[1]); gctx.stroke(); gctx.setLineDash([]);
    gctx.fillStyle = '#f0a040'; gctx.beginPath(); gctx.arc(aim[0], aim[1], 3.5, 0, 7); gctx.fill(); }
  gctx.strokeStyle = GIZ.sel ? GCOL.sel : 'rgba(255,255,255,.9)'; gctx.fillStyle = 'rgba(14,17,21,.75)';
  gctx.beginPath(); gctx.arc(ctr[0], ctr[1], 8, 0, 7); gctx.fill(); gctx.stroke();
  if (sun) for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; gctx.beginPath(); gctx.moveTo(ctr[0] + Math.cos(a) * 10, ctr[1] + Math.sin(a) * 10); gctx.lineTo(ctr[0] + Math.cos(a) * 14, ctr[1] + Math.sin(a) * 14); gctx.stroke(); }
  else { gctx.beginPath(); gctx.arc(ctr[0], ctr[1], 3, 0, 7); gctx.fillStyle = gctx.strokeStyle; gctx.fill(); }
  if (!GIZ.sel) return;
  const act = GIZ.drag ? GIZ.drag.it.k : GIZ.hover;
  for (const it of H.items) {
    const hot = act === it.k && (!GIZ.drag || GIZ.drag.it.type === it.type);
    gctx.strokeStyle = hot ? '#fff' : it.col; gctx.fillStyle = gctx.strokeStyle; gctx.lineWidth = hot ? 3 : 2;
    if (it.type === 'axis') {
      gctx.beginPath(); gctx.moveTo(it.p0[0], it.p0[1]); gctx.lineTo(it.p1[0], it.p1[1]); gctx.stroke();
      const ang = Math.atan2(it.p1[1] - it.p0[1], it.p1[0] - it.p0[0]);
      gctx.beginPath(); gctx.moveTo(it.p1[0] + Math.cos(ang) * 9, it.p1[1] + Math.sin(ang) * 9);
      gctx.lineTo(it.p1[0] + Math.cos(ang + 2.6) * 7, it.p1[1] + Math.sin(ang + 2.6) * 7); gctx.lineTo(it.p1[0] + Math.cos(ang - 2.6) * 7, it.p1[1] + Math.sin(ang - 2.6) * 7); gctx.fill();
    } else if (it.type === 'plane') {
      gctx.strokeRect(it.p0[0] - 6, it.p0[1] - 6, 12, 12);
    } else {
      gctx.beginPath(); let on = false;
      for (const q of it.pts) { if (!q) { on = false; continue; } if (on) gctx.lineTo(q[0], q[1]); else { gctx.moveTo(q[0], q[1]); on = true; } }
      gctx.stroke();
    }
  }
  gctx.font = '600 11px system-ui, sans-serif'; gctx.fillStyle = 'rgba(255,255,255,.85)';
  gctx.fillText(GIZ.mode === 'move' ? 'Move (W)' : 'Rotate (E)', ctr[0] + 14, ctr[1] - 14);
}
// pointer handling on the plate, ahead of the camera and aim handlers on the canvas
(() => {
  const plate = $('plate');
  const mpos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let pend = null;
  plate.addEventListener('pointerdown', e => {
    if (S.view !== 'scene' || e.target !== cv || e.altKey || e.button !== 0) return;
    const m = mpos(e), hit = gizPick(m);
    if (!hit) { if (GIZ.sel) pend = {x:e.clientX, y:e.clientY}; return; }
    e.stopPropagation(); e.preventDefault(); GIZ.eatUp = true;
    if (hit.light && !GIZ.sel) { GIZ.sel = true; buildPanel(); gizDraw(); return; }
    const base = bakeLight();
    const it = hit.it || {k:'p', type:'plane'};
    GIZ.drag = {it, m0:m, base, th0:hit.th, s:gizScale(base.pos)};
    cv.setPointerCapture(e.pointerId);
  }, true);
  plate.addEventListener('pointermove', e => {
    if (S.view !== 'scene') return;
    const m = mpos(e);
    if (!GIZ.drag) { if (GIZ.sel && !e.buttons) { const h = gizPick(m); const k = h && h.it ? h.it.k : null; if (k !== GIZ.hover) { GIZ.hover = k; gizDraw(); } } return; }
    e.stopPropagation();
    const D = GIZ.drag, dm = [m[0] - D.m0[0], m[1] - D.m0[1]], b = D.base;
    if (D.it.type === 'axis') {
      const a0 = toCss(b.pos), a1 = toCss(v3.add(b.pos, D.it.a)); if (!a0 || !a1) return;
      const sv = [a1[0] - a0[0], a1[1] - a0[1]], l2 = sv[0] * sv[0] + sv[1] * sv[1] || 1;
      setLight(v3.add(b.pos, v3.mul(D.it.a, (dm[0] * sv[0] + dm[1] * sv[1]) / l2)), b.f, b.roll, b.gd);
    } else if (D.it.type === 'plane') {
      const k = D.s / 70;
      setLight(v3.add(b.pos, v3.add(v3.mul(VIEWCAM.r, dm[0] * k), v3.mul(VIEWCAM.u, -dm[1] * k))), b.f, b.roll, b.gd);
    } else {
      // drag along the ring where it was grabbed: the screen tangent there sets how far it turns
      const it = D.it, R = D.s * 0.85, th = D.th0;
      const P = v3.add(b.pos, v3.mul(v3.add(v3.mul(it.t1, Math.cos(th)), v3.mul(it.t2, Math.sin(th))), R));
      const T = v3.add(v3.mul(it.t1, -Math.sin(th)), v3.mul(it.t2, Math.cos(th)));
      const p0 = toCss(P), p1 = toCss(v3.add(P, v3.mul(T, R * 0.01))); if (!p0 || !p1) return;
      const sv = [(p1[0] - p0[0]) / 0.01, (p1[1] - p0[1]) / 0.01], l2 = sv[0] * sv[0] + sv[1] * sv[1] || 1;
      const ang = (dm[0] * sv[0] + dm[1] * sv[1]) / l2;
      if (it.k === 'z') setLight(b.pos, b.f, b.roll + ang / DEG, b.gd);
      else setLight(b.pos, v3.norm(rotAxis(b.f, it.a, ang)), b.roll, b.gd);
    }
    gizDraw();
  }, true);
  const up = e => {
    if (GIZ.eatUp) { GIZ.eatUp = false; e.stopPropagation(); }
    if (GIZ.drag) { e.stopPropagation(); GIZ.drag = null; buildPanel(); save(); gizDraw(); return; }
    if (pend) { const moved = Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 4; pend = null; if (!moved) { GIZ.sel = false; GIZ.hover = null; e.stopPropagation(); toolButtons(); buildPanel(); gizDraw(); } }
  };
  plate.addEventListener('pointerup', up, true); plate.addEventListener('pointercancel', up, true);
  document.addEventListener('keydown', e => {
    const ae = document.activeElement;
    if (S.view !== 'scene' || e.metaKey || e.ctrlKey || e.altKey || (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'e') { GIZ.mode = k === 'w' ? 'move' : 'rotate'; GIZ.sel = true; toolButtons(); frameLight(); gizDraw(); }
    if (k === "escape") { GIZ.sel = false; toolButtons(); gizDraw(); }
  });
  const tb = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  tb('toolMove', () => { GIZ.mode = 'move'; GIZ.sel = true; toolButtons(); frameLight(); gizDraw(); });
  tb('toolRot', () => { GIZ.mode = 'rotate'; GIZ.sel = true; toolButtons(); frameLight(); gizDraw(); });
  tb('camReset', () => {
    if (S.view !== 'scene') return;
    if (shotActive()) { delete S.shotCams[S.shotSel]; S.shot.view = 0; } else S.cams[S.mode] = camDefault(S.mode);
    buildPanel(); viewDirty = true; save();
  });
})();
function toolButtons() {
  for (const [id, m] of [['toolMove', 'move'], ['toolRot', 'rotate']]) { const b = $(id); if (b) b.setAttribute('aria-pressed', GIZ.sel && GIZ.mode === m); }
}
