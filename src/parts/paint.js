/* =====================================================================
   PAINT YOUR OWN
   A 1024² paint canvas that feeds the gobo directly. White lets light
   through, black blocks it. Brushes wrap around the edges so a painted
   gobo can still tile, and the Blur slider softens the whole thing.
   ===================================================================== */
const PAINT = {cv:null, ctx:null, tex:null, dirty:true, undo:[], last:null, saveT:0, N:1024};
const PAINT_KEY = 'cucLab.paint';
function paintCanvas() {
  if (PAINT.cv) return PAINT;
  const c = document.createElement('canvas'); c.width = c.height = PAINT.N;
  PAINT.cv = c; PAINT.ctx = c.getContext('2d', {willReadFrequently:false});
  PAINT.ctx.fillStyle = '#fff'; PAINT.ctx.fillRect(0, 0, PAINT.N, PAINT.N);
  try {
    const url = localStorage.getItem(PAINT_KEY);
    if (url) { const im = new Image(); im.onload = () => { PAINT.ctx.drawImage(im, 0, 0, PAINT.N, PAINT.N); PAINT.dirty = true; dirty = true; }; im.src = url; }
  } catch (e) {}
  return PAINT;
}
function paintTex() {
  paintCanvas();
  if (!PAINT.tex) {
    PAINT.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, PAINT.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }
  if (PAINT.dirty) {
    gl.bindTexture(gl.TEXTURE_2D, PAINT.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, PAINT.cv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    PAINT.dirty = false;
  }
  return PAINT.tex;
}
/* ---------- paint targets: the Paint-your-own gobo, or a mode's paint-over layer ---------- */
PAINT.key = PAINT_KEY; PAINT.set = () => S.p.shapes; PAINT.kind = 'gobo';
const OVL = {};
if (!S.ovl) S.ovl = {};
S.ovl = {on:{}, pbTool:0, pbInk:0, pbSize:10, pbSoft:0.8, pbFlow:0.35, pbWrap:true, pbBlur:0.5, ...S.ovl};
const ovlOn = () => !!(S.ovl.on || {})[S.mode];
function ovlTarget(m = S.mode) {
  if (OVL[m]) return OVL[m];
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const T = OVL[m] = {cv:c, ctx:c.getContext('2d'), N, tex:null, dirty:true, undo:[], last:null, saveT:0, key:'cucLab.ovl.' + m, set:() => S.ovl, kind:'ovl', used:false};
  T.ctx.fillStyle = 'rgb(128,128,128)'; T.ctx.fillRect(0, 0, N, N);
  try { const url = localStorage.getItem(T.key); if (url) { T.used = true; const im = new Image(); im.onload = () => { T.ctx.drawImage(im, 0, 0, N, N); T.dirty = true; dirty = true; }; im.src = url; } } catch (e) {}
  return T;
}
let CUR = null;   // the target of the stroke in progress
const PT = () => CUR || (ovlOn() ? ovlTarget() : paintCanvas());
const PB = () => {
  const P = PT().set();
  return {tool:P.pbTool | 0, ink:P.pbInk | 0, size:P.pbSize ?? 6, soft:P.pbSoft ?? 0.6, flow:P.pbFlow ?? 0.6, wrap:P.pbWrap ?? true,
          angle:P.pbAngle ?? 20, len:P.pbLen ?? 6, streak:P.pbStreak ?? 0.5, blurAmt:P.pbBlur ?? 0.5};
};
function paintSave(T = PT()) {
  clearTimeout(T.saveT);
  T.saveT = setTimeout(() => { try { localStorage.setItem(T.key, T.cv.toDataURL('image/png')); } catch (e) {} }, 700);
}
function paintChanged(T = PT()) { T.dirty = true; T.used = true; dirty = true; paintSave(T); padRedraw(); }
function pushUndo(T = PT()) {
  const c = document.createElement('canvas'); c.width = c.height = T.N;
  c.getContext('2d').drawImage(T.cv, 0, 0);
  T.undo.push(c); if (T.undo.length > 12) T.undo.shift();
}
/* ---------- brush sprites: drawn once per dab as a white alpha mask, then tinted with the ink ---------- */
function sprite(w, h, draw) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d'); draw(x, c.width, c.height); return c;
}
function tint(c, col, a) { const x = c.getContext('2d'); x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgba(${col},${a})`; x.fillRect(0, 0, c.width, c.height); return c; }
// fine lengthwise streaks, as dust and haze give a real light shaft
function streaks(x, w, h, amt, rr) {
  if (amt <= 0) return;
  x.globalCompositeOperation = 'destination-out';
  const n = Math.round(10 + 40 * amt);
  for (let i = 0; i < n; i++) {
    const yy = rr() * h, th = 0.5 + rr() * h * 0.06, x0 = rr() * w * 0.3, x1 = w - rr() * w * 0.3;
    const g = x.createLinearGradient(x0, 0, x1, 0); const a = amt * (0.15 + 0.5 * rr());
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(x0, yy - th / 2, x1 - x0, th);
  }
  x.globalCompositeOperation = 'source-over';
}
// a soft profile across a band: a flat core with edges that fall off over the softness
function bandMask(x, w, h, soft) {
  const g = x.createLinearGradient(0, 0, 0, h), e = 0.04 + 0.46 * soft;
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(e, 'rgba(255,255,255,1)'); g.addColorStop(1 - e, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
let NOISE_TILE = null;
function noiseTile() {
  if (NOISE_TILE) return NOISE_TILE;
  // a small tiling value-noise texture, several octaves, for the mottle brush
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), id = x.createImageData(n, n), r0 = rng(4242);
  const lat = []; for (let o = 0; o < 5; o++) { const g = 4 << o, a = new Float32Array(g * g); for (let i = 0; i < g * g; i++) a[i] = r0(); lat.push([g, a]); }
  for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
    let v = 0, amp = 0.5, tot = 0;
    for (const [g, a] of lat) {
      const fx = xx / n * g, fy = y / n * g, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), A = (i, j) => a[((iy + j) % g) * g + (ix + i) % g];
      v += amp * ((A(0, 0) * (1 - sx) + A(1, 0) * sx) * (1 - sy) + (A(0, 1) * (1 - sx) + A(1, 1) * sx) * sy); tot += amp; amp *= 0.55;
    }
    const k = (y * n + xx) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = 255; id.data[k + 3] = Math.round(255 * clamp((v / tot - 0.5) * 2.2 + 0.5, 0, 1));
  }
  x.putImageData(id, 0, 0);
  return (NOISE_TILE = c);
}
// one dab of the brush, repeated across the edges when wrapping so the gobo stays seamless
function dab(x, y) {
  const b = PB(), N = PT().N, ctx = PT().ctx, r = Math.max(1, b.size / 100 * N * 0.5);
  const col = PT().kind === 'ovl' ? ['255,255,255', '0,0,0', '128,128,128'][b.ink] : b.ink ? '255,255,255' : '0,0,0';
  const ext = b.tool === 4 ? Math.max(r, r * b.len) : b.tool === 5 ? r * 2 : r * 1.6;
  const offs = [[0, 0]];
  if (b.wrap) for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) if ((ox || oy) && x + ox > -ext && x + ox < N + ext && y + oy > -ext && y + oy < N + ext) offs.push([ox, oy]);
  const rr = rng((PT().seed = (PT().seed || 1) + 1) * 7919);
  // brushes built as a sprite are made once per dab and stamped at each wrapped copy
  let spr = null, sang = 0;
  if (b.tool === 4) {
    // one light beam: a long soft shaft at a set angle, fading toward its far end, streaked by haze
    const L = r * 2 * b.len, w = r * 2;
    spr = sprite(L, w, (x2, W, H) => {
      bandMask(x2, W, H, b.soft); streaks(x2, W, H, b.streak, rr);
      x2.globalCompositeOperation = 'destination-in';
      const g = x2.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.12, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x2.fillStyle = g; x2.fillRect(0, 0, W, H);
    });
    tint(spr, col, b.flow); sang = (90 + b.angle) * DEG;
  } else if (b.tool === 5) {
    // a soft streak that follows the stroke
    const L = r * 3, w = r * 1.2;
    spr = sprite(L, w, (x2, W, H) => {
      bandMask(x2, W, H, Math.max(b.soft, 0.3)); streaks(x2, W, H, b.streak, rr);
      x2.globalCompositeOperation = 'destination-in';
      const g = x2.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5 + 0.4 * (1 - b.soft), 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x2.fillStyle = g; x2.fillRect(0, 0, W, H);
    });
    tint(spr, col, b.flow * 0.2); sang = PT().dir || 0;
  } else if (b.tool === 7) {
    // mottle: a patch of soft noise that fades out at the brush edge
    const nt = noiseTile(), ox0 = rr() * 192, oy0 = rr() * 192;
    spr = sprite(r * 2, r * 2, (x2, W, H) => {
      x2.drawImage(nt, ox0, oy0, 64, 64, 0, 0, W, H);
      x2.globalCompositeOperation = 'destination-in';
      const g = x2.createRadialGradient(W / 2, H / 2, W / 2 * (1 - b.soft) * 0.9, W / 2, H / 2, W / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x2.fillStyle = g; x2.fillRect(0, 0, W, H);
    });
    tint(spr, col, b.flow); sang = rr() * 2 * Math.PI;
  }
  for (const [ox, oy] of offs) {
    const cx = x + ox, cy = y + oy;
    ctx.save();
    if (spr) {
      ctx.translate(cx, cy); ctx.rotate(sang); ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    } else if (b.tool === 6) {
      // soft cloud: a cluster of overlapping soft puffs
      const n = 5 + Math.floor(rr() * 5);
      for (let i = 0; i < n; i++) {
        const a = rr() * 2 * Math.PI, d = Math.sqrt(rr()) * r * 0.6, s = r * (0.3 + 0.4 * rr()), px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
        const g = ctx.createRadialGradient(px, py, 0, px, py, s); g.addColorStop(0, `rgba(${col},${b.flow * 0.35})`); g.addColorStop(0.3 + 0.5 * (1 - b.soft), `rgba(${col},${b.flow * 0.25})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s, 0, 2 * Math.PI); ctx.fill();
      }
    } else if (b.tool === 8) {
      // soft dots of different sizes, like out-of-focus highlights
      const n = 3 + Math.floor(rr() * 5);
      for (let i = 0; i < n; i++) {
        const a = rr() * 2 * Math.PI, d = Math.sqrt(rr()) * r, s = r * (0.08 + 0.25 * rr()), px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
        const g = ctx.createRadialGradient(px, py, s * (1 - b.soft) * 0.9, px, py, s); g.addColorStop(0, `rgba(${col},${b.flow * (0.5 + 0.5 * rr())})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s, 0, 2 * Math.PI); ctx.fill();
      }
    } else if (b.tool === 0) {
      const g = ctx.createRadialGradient(cx, cy, r * (1 - b.soft) * 0.98, cx, cy, r);
      g.addColorStop(0, `rgba(${col},${b.flow})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill();
    } else if (b.tool === 1) {
      // a spray of little leaves, each turned its own way
      ctx.fillStyle = `rgba(${col},${Math.min(1, b.flow * 1.2)})`;
      const n = 3 + Math.floor(rr() * 5);
      for (let i = 0; i < n; i++) {
        const a = rr() * 2 * Math.PI, d = Math.sqrt(rr()) * r, s = r * (0.14 + 0.22 * rr());
        ctx.save(); ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d); ctx.rotate(rr() * Math.PI);
        ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.55, s, 0); ctx.quadraticCurveTo(0, s * 0.55, -s, 0); ctx.fill();
        ctx.restore();
      }
    } else if (b.tool === 2) {
      ctx.fillStyle = `rgba(${col},${b.flow})`;
      const n = 6 + Math.floor(rr() * 10);
      for (let i = 0; i < n; i++) {
        const a = rr() * 2 * Math.PI, d = Math.sqrt(rr()) * r, s = r * (0.02 + 0.12 * Math.pow(rr(), 2));
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, 0, 2 * Math.PI); ctx.fill();
      }
    } else {
      // blur brush: soften what is already painted under the brush. The area is blurred on its own (with a
      // margin, so the blur has real pixels to draw on), then laid back through a soft-edged mask so there is no seam.
      const rad = Math.max(1, r * (0.05 + 0.5 * b.blurAmt)), m = Math.ceil(rad * 2.5), w = Math.ceil(2 * r) + 2 * m;
      const x0 = Math.floor(cx - r) - m, y0 = Math.floor(cy - r) - m;
      const t = document.createElement('canvas'); t.width = t.height = w;
      const tx = t.getContext('2d');
      // fill the margin by repeating the canvas across its edges, so blurring near an edge does not pull in black or white
      tx.filter = `blur(${rad}px)`;
      for (const ox2 of [-N, 0, N]) for (const oy2 of [-N, 0, N]) tx.drawImage(PT().cv, ox2 - x0, oy2 - y0);
      tx.filter = 'none'; tx.globalCompositeOperation = 'destination-in';
      const g = tx.createRadialGradient(w / 2, w / 2, r * (1 - b.soft) * 0.95, w / 2, w / 2, r);
      g.addColorStop(0, `rgba(0,0,0,${b.flow})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = g; tx.fillRect(0, 0, w, w);
      ctx.drawImage(t, x0, y0);
    }
    ctx.restore();
  }
}
function stroke(x, y) {
  const b = PB(), N = PT().N, r = b.size / 100 * N * 0.5;
  const step = Math.max(1, r * ({0:0.25, 3:0.35, 4:1.3, 5:0.22, 6:0.5, 7:0.45, 8:0.8}[b.tool] ?? 0.6));
  if (!PT().last) { dab(x, y); PT().last = [x, y]; return; }
  let [lx, ly] = PT().last;
  // take the short way across a wrapped edge
  if (b.wrap) { if (x - lx > N / 2) lx += N; if (lx - x > N / 2) lx -= N; if (y - ly > N / 2) ly += N; if (ly - y > N / 2) ly -= N; }
  const d = Math.hypot(x - lx, y - ly), n = Math.floor(d / step);
  if (d > 0.5) PT().dir = Math.atan2(y - ly, x - lx);
  for (let i = 1; i <= n; i++) { const t = i / n; dab(lx + (x - lx) * t, ly + (y - ly) * t); }
  if (n) PT().last = [x, y];
}
const paintShape = () => S.mode === 'shapes' && (S.p.shapes.shape | 0) === 14;
const paintOn = () => S.view === 'gobo' && (ovlOn() || paintShape());
function scenePaintOn() { return S.view === 'scene' && (ovlOn() || (paintShape() && (S.p.shapes.pbScene ?? true))); }
/* ---------- the paint pad: a small canvas in the panel ---------- */
const PADS = new Set();
function paintPad(el, T = paintCanvas()) {
  const c = document.createElement('canvas'); c.width = c.height = 512; c.className = 'paintpad';
  c.setAttribute('aria-label', T.kind === 'ovl' ? 'Paint-over canvas' : 'Paint canvas');
  el.append(c);
  const pad = {cv:c, T, hover:null}; PADS.add(pad);
  let down = false;
  const toPx = e => { const r = c.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 0.9999) * T.N, clamp((e.clientY - r.top) / r.height, 0, 0.9999) * T.N]; };
  c.addEventListener('pointerdown', e => { CUR = T; pushUndo(T); down = true; T.last = null; try { c.setPointerCapture(e.pointerId); } catch (err) {} stroke(...toPx(e)); paintChanged(T); e.preventDefault(); });
  c.addEventListener('pointermove', e => { pad.hover = toPx(e); if (down) { CUR = T; stroke(...pad.hover); paintChanged(T); } else padRedraw(); });
  const up = () => { down = false; T.last = null; CUR = null; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { pad.hover = null; padRedraw(); });
  padRedraw();
}
// a small copy of the finished gobo, to paint over in the paint-over pad
let THUMB = null, thumbT = 0;
function goboThumb() {
  const f = targets.final; if (!f) return null;
  const now = performance.now();
  if (THUMB && now - thumbT < 400 && !THUMB.stale) return THUMB.cv;
  thumbT = now;
  const n = 256, t = tgt('thumb', n, n, 'u8');
  pass(PR.copy, t, p => { tex(p, 'uSrc', f.tex, 0); f1(p, 'uGain', 1); });
  const px = new Uint8Array(n * n * 4); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
  if (!THUMB) { const c = document.createElement('canvas'); c.width = c.height = n; THUMB = {cv:c, id:c.getContext('2d').createImageData(n, n)}; }
  for (let y = 0; y < n; y++) THUMB.id.data.set(px.subarray((n - 1 - y) * n * 4, (n - y) * n * 4), y * n * 4);
  THUMB.cv.getContext('2d').putImageData(THUMB.id, 0, 0); THUMB.stale = false;
  return THUMB.cv;
}
let padRaf = 0;
function padRedraw() {
  if (!PADS.size || padRaf) return;
  padRaf = requestAnimationFrame(() => {
    padRaf = 0;
    for (const pad of [...PADS]) {
      const c = pad.cv; if (!c.isConnected) { PADS.delete(pad); continue; }
      const x = c.getContext('2d'), T = pad.T;
      if (T.kind === 'ovl') {
        // the finished gobo, with warm tint where it is opened up and blue where it is thickened
        const th = goboThumb(); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
        if (th) { x.imageSmoothingEnabled = true; x.drawImage(th, 0, 0, c.width, c.height); }
        const N = T.N, id = T.ctx.getImageData(0, 0, N, N), o = x.createImageData(N, N);
        for (let i = 0; i < N * N; i++) { const k = (id.data[i * 4] - 128) / 127, j = i * 4;
          if (k > 0) { o.data[j] = 255; o.data[j + 1] = 190; o.data[j + 2] = 60; o.data[j + 3] = Math.min(255, k * 160); }
          else { o.data[j] = 70; o.data[j + 1] = 140; o.data[j + 2] = 255; o.data[j + 3] = Math.min(255, -k * 160); } }
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; tmp.getContext('2d').putImageData(o, 0, 0);
        x.drawImage(tmp, 0, 0, c.width, c.height);
      } else x.drawImage(T.cv, 0, 0, c.width, c.height);
      if (pad.hover) {
        const k = c.width / T.N, P = T.set(), r = Math.max(2, (P.pbSize ?? 6) / 100 * c.width * 0.5);
        x.lineWidth = 1.5; x.strokeStyle = 'rgba(240,178,94,.95)';
        x.beginPath(); x.arc(pad.hover[0] * k, pad.hover[1] * k, r, 0, 2 * Math.PI); x.stroke();
      }
    }
  });
}
/* ---------- painting in the Scene view: the brush lands in the gobo where the light falls ---------- */
function sceneHit(e) {
  if (inShot()) return shotPick(e);
  const L = LASTSCENE; if (!L) return null;
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  const fx = (e.clientX - r.left) * dpr, fy = (r.bottom - e.clientY) * dpr;
  const sx = (fx * 2 - cv.width) / cv.height, sy = (fy * 2 - cv.height) / cv.height, tf = Math.tan(20 * DEG);
  const rd = v3.norm(v3.add(L.cf, v3.add(v3.mul(L.cb.r, tf * sx), v3.mul(L.cb.u, tf * sy)))), ro = L.cpos;
  const c = SC(), set = c.set | 0;
  let best = 1e9;
  const plane = (n, d0, ok) => { const dn = v3.dot(rd, n); if (Math.abs(dn) < 1e-6) return; const t = (d0 - v3.dot(ro, n)) / dn; if (t > 0 && t < best) { const p = v3.add(ro, v3.mul(rd, t)); if (ok(p)) best = t; } };
  if (set === 0) plane([0, 1, 0], 0, p => Math.max(Math.abs(p[0]), Math.abs(p[2])) < 12);
  if (set === 1) { plane([0, 1, 0], 0, p => p[0] > -8 && p[0] < 8 && p[2] > 0 && p[2] < 10); plane([0, 0, 1], 0, p => p[0] > -8 && p[0] < 8 && p[1] > 0 && p[1] < 6); }
  if (set === 2) plane([0, 1, 0], 1.5, p => Math.abs(p[0]) < 4 && p[2] > -1 && p[2] < 5);
  if (set === 3) plane([0, 0, 1], 0, p => p[0] > -8 && p[0] < 8 && p[1] > -1 && p[1] < 4);
  if (c.sphere && set < 2) {
    const sp = MODE_SPHERE[S.mode] && (MODE_SCENE[S.mode] || {}).set === set ? MODE_SPHERE[S.mode] : SET_SPHERE[set];
    const oc = v3.sub(ro, sp), b = v3.dot(oc, rd), h = b * b - (v3.dot(oc, oc) - sp[3] * sp[3]);
    if (h > 0) { const t = -b - Math.sqrt(h); if (t > 0 && t < best) best = t; }
  }
  return best < 1e9 ? v3.add(ro, v3.mul(rd, best)) : null;
}
// where in the gobo the light that reaches this point came from (the same mapping the scene's light uses)
function goboUVAt(p) {
  const S0 = LASTSCENE; if (!S0) return null;
  const L = S0.L;
  if (S0.ltype === 1) { const v = v3.sub(p, L.aim); return [v3.dot(v, L.r) / S0.sunSize + 0.5, v3.dot(v, L.u) / S0.sunSize + 0.5]; }
  const v = v3.sub(p, L.pos), z = v3.dot(v, L.f); if (z <= 1e-4) return null;
  return [0.5 + 0.5 * v3.dot(v, L.r) / (z * S0.tanC) * S0.rep, 0.5 + 0.5 * v3.dot(v, L.u) / (z * S0.tanC) * S0.rep];
}
/* Painting in the Scene view. A stroke stays on the surface it started on: it follows that surface while the
   brush is over it, and where the brush slips off an edge (onto a wall far behind a face, or into empty space)
   it carries on across a plane facing the light at the stroke's depth, so the paint lands where the light
   would put it instead of leaping to the far surface and dragging a long line across the gobo. */
(() => {
  let ST = null;
  const evPx = e => { const r = cv.getBoundingClientRect(), d = cv.width / r.width; return [(e.clientX - r.left) * d, (r.bottom - e.clientY) * d]; };
  const toPaint = p => { const uv = goboUVAt(p); if (!uv) return null; const N = PT().N; return [(uv[0] - Math.floor(uv[0])) * N, (1 - (uv[1] - Math.floor(uv[1]))) * N]; };
  const point = e => {
    if (!VIEWCAM || !VIEWCAM.ray || !LASTSCENE) return null;
    const {ro, rd} = VIEWCAM.ray(...evPx(e)), hit = sceneHit(e);
    if (!ST) return hit ? {p:hit, ro, rd} : null;
    const n = ST.n, dn = v3.dot(rd, n);
    // stay on the surface while it is near the stroke's depth (seen from the light); let the depth follow it gradually
    if (hit && Math.abs(v3.dot(hit, n) - ST.d) < ST.tol) { ST.d = v3.dot(hit, n); return {p:hit}; }
    if (Math.abs(dn) < 1e-4) return null;
    const t = (ST.d - v3.dot(ro, n)) / dn;
    return t > 0 ? {p:v3.add(ro, v3.mul(rd, t))} : null;
  };
  cv.addEventListener('pointerdown', e => {
    if (!scenePaintOn() || e.altKey || e.button !== 0) return;
    const h = point(e); if (!h) return;
    // the stroke's plane faces the light, unless the camera sees it edge-on; then it faces the camera
    const L = LASTSCENE.L, nl = v3.mul(L.f, -1), n = Math.abs(v3.dot(h.rd, nl)) > 0.25 ? nl : v3.mul(h.rd, -1);
    ST = {n, d:v3.dot(h.p, n), tol:Math.max(0.12, 0.05 * Math.hypot(...v3.sub(h.p, h.ro)))};
    const q = toPaint(h.p); if (!q) { ST = null; return; }
    CUR = PT(); pushUndo(); CUR.last = null; try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    stroke(...q); ST.q = q; paintChanged();
  });
  cv.addEventListener('pointermove', e => {
    if (!ST) return;
    const h = point(e), q = h && toPaint(h.p);
    if (!q) { PT().last = null; ST.q = null; return; }
    // a sudden leap across the canvas (not across a wrapped edge) starts a new line rather than drawing one
    if (ST.q) { const N = PT().N, wrap = PB().wrap; let dx = Math.abs(q[0] - ST.q[0]), dy = Math.abs(q[1] - ST.q[1]); if (wrap) { dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy); } if (Math.hypot(dx, dy) > 0.2 * N) PT().last = null; }
    stroke(...q); ST.q = q; paintChanged();
  });
  const up = () => { if (CUR) CUR.last = null; ST = null; CUR = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
})();
function paintAction(a) {
  const T = CUR = paintCanvas(), ctx = T.ctx, N = T.N;
  if (a === 'undo') { const c = T.undo.pop(); if (c) { ctx.globalCompositeOperation = 'copy'; ctx.drawImage(c, 0, 0); ctx.globalCompositeOperation = 'source-over'; } }
  else {
    pushUndo();
    if (a === 'light' || a === 'shadow') { ctx.fillStyle = a === 'light' ? '#fff' : '#000'; ctx.fillRect(0, 0, N, N); }
    else if (a === 'invert') { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, N, N); ctx.globalCompositeOperation = 'source-over'; }
    else if (a === 'breakup') {
      // start from a generated leafy breakup, then paint over it
      const P = {...S.p.shapes, shape:15, blur:0, framing:0, motion:0, morph:0, flow:0, breath:0, drift:0, sway:0, scale:3, amount:0.5, soft:0.45, brk:0.5, rough:0.5, darkest:0, warp:0.7, clump:0.4, stretch:1, seed:(S.p.shapes.seed | 0) + Math.floor(Math.random() * 999)};
      const o = renderShapesRaw(P, N, 0, {loop:false, len:10});
      const px = new Float32Array(N * N * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.fb); gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, px);
      const id = ctx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = Math.round(clamp(px[((N - 1 - y) * N + x) * 4], 0, 1) * 255), k = (y * N + x) * 4;
        id.data[k] = id.data[k + 1] = id.data[k + 2] = v; id.data[k + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
    }
  }
  paintChanged(T); CUR = null;
}
function paintDefs() {
  return [
    {type:'mount', mount:el => paintPad(el, paintCanvas())},
    {k:'pbTool', l:'Brush', opts:['Soft round', 'Blur (soften an area)', 'Light beam (one shaft)', 'Soft streak (follows the stroke)', 'Soft cloud', 'Mottle (soft noise)', 'Soft dots', 'Leaf scatter', 'Splatter'], vals:[0, 3, 4, 5, 6, 7, 8, 1, 2]},
    ...((S.p.shapes.pbTool | 0) === 3 ? [{k:'pbBlur', l:'Blur amount', min:0, max:1, step:0.01, h:'How much each pass of the brush softens what is under it. Go over an area again to soften it further. Strength sets how much of the blur is laid down, softness feathers the brush edge.'}] : []),
    ...((S.p.shapes.pbTool | 0) === 4 ? [{k:'pbAngle', l:'Beam angle', min:-90, max:90, step:0.5, u:'°', h:'0° points straight down the frame.'}, {k:'pbLen', l:'Beam length', min:2, max:16, step:0.1, fmt:v => v.toFixed(1) + '× its width'}] : []),
    ...([4, 5].includes(S.p.shapes.pbTool | 0) ? [{k:'pbStreak', l:'Haze streaks', min:0, max:1, step:0.01, h:'Fine lengthwise streaks inside the light, as dust and haze give a real shaft.'}] : []),
    ...((S.p.shapes.pbTool | 0) === 3 ? [] : [{k:'pbInk', l:'Paint with', opts:['Shadow (blocks light)', 'Light (lets light through)']}]),
    {k:'pbSize', l:'Brush size', min:0.5, max:40, step:0.1, u:'%'},
    {k:'pbSoft', l:'Brush softness', min:0, max:1, step:0.01},
    {k:'pbFlow', l:'Strength', min:0.02, max:1, step:0.01},
    {k:'pbWrap', l:'Wrap at the edges (keeps it seamless)', type:'chk'},
    {k:'pbScene', l:'Paint in the Scene view too', type:'chk', h:'In the Scene view, painting lands in the gobo exactly where the light falls on the set or shot, so you can rough in shapes right where you want them. Alt-drag still orbits.'},
    {type:'buttons', items:[['Undo', () => paintAction('undo')], ['Fill with soft noise', () => paintAction('breakup')], ['Clear to light', () => paintAction('light')], ['Clear to shadow', () => paintAction('shadow')], ['Invert', () => paintAction('invert')]]},
    {type:'note', l:'Paint on the canvas above, straight onto the Gobo preview, or in the Scene view where the light lands. White lets light through, black blocks it; Blur softens the whole gobo, and the Motion controls bring it to life.'},
  ];
}
// pointer painting on the preview
(() => {
  let down = false;
  const ring = $('brush');
  const toPx = e => {
    const r = cv.getBoundingClientRect(), T = S.tiles || 1;
    let u = (e.clientX - r.left) / r.width * T, v = (e.clientY - r.top) / r.height * T;
    u -= Math.floor(u); v -= Math.floor(v);
    return [u * PT().N, v * PT().N];
  };
  const showRing = e => {
    if (!ring) return;
    cv.style.cursor = paintOn() ? 'none' : scenePaintOn() && !e.altKey ? 'crosshair' : '';
    cv.style.touchAction = paintOn() || scenePaintOn() ? 'none' : '';
    if (!paintOn()) { ring.hidden = true; return; }
    const r = cv.getBoundingClientRect(), pr = $('plate').getBoundingClientRect();
    const d = PB().size / 100 * r.width / (S.tiles || 1);
    ring.hidden = false;
    ring.style.width = ring.style.height = d + 'px';
    ring.style.left = (e.clientX - pr.left - d / 2) + 'px'; ring.style.top = (e.clientY - pr.top - d / 2) + 'px';
  };
  cv.addEventListener('pointerdown', e => {
    if (!paintOn()) return;
    CUR = PT(); pushUndo(); down = true; CUR.last = null;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    stroke(...toPx(e)); paintChanged();
  });
  cv.addEventListener('pointermove', e => {
    showRing(e);
    if (!down || !paintOn()) return;
    stroke(...toPx(e)); paintChanged();
  });
  const up = () => { down = false; if (CUR) CUR.last = null; CUR = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (ring) ring.hidden = true; });
})();

/* =====================================================================
   PAINT OVER
   Any gobo, moving or still, can be painted over: open it up (thin the
   leaves, make a clearing, lift a shadow off a face) or thicken it,
   in chosen areas. The layer sits on top of the finished gobo and
   stays put while the pattern moves underneath.
   ===================================================================== */
const FS_OVL = COMMON + OVL_GLSL + `
uniform sampler2D uSrc, uOvl;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  fragColor = vec4(ovlMod(texture(uSrc, uv).rgb, texture(uOvl, uv).r * 2.0 - 1.0), 1.0);
}`;
PR.ovl = program(VS_FULL, FS_OVL, 'paint over');
function ovlTex(T) {
  if (!T.tex) {
    T.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, T.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }
  if (T.dirty) {
    gl.bindTexture(gl.TEXTURE_2D, T.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, T.cv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); T.dirty = false;
    if (THUMB) THUMB.stale = true;
  }
  return T.tex;
}
// applied to the finished gobo, before the output levels
function ovlApply(src) {
  // trees take the painting as leaf density and shapes inside their own moving coordinates; the rest here
  if (!ovlOn() || ['trees', 'shapes'].includes(MODES[S.mode].kind)) return src;
  const T = ovlTarget(); if (!T.used) return src;
  const out = tgt('ovlOut', src.w, src.h, 'f16');
  pass(PR.ovl, out, p => { tex(p, 'uSrc', src.tex, 0); tex(p, 'uOvl', ovlTex(T), 1); });
  return out;
}
function ovlAction(a) {
  const T = CUR = ovlTarget(), ctx = T.ctx, N = T.N;
  if (a === 'undo') { const c = T.undo.pop(); if (c) { ctx.globalCompositeOperation = 'copy'; ctx.drawImage(c, 0, 0); ctx.globalCompositeOperation = 'source-over'; } }
  else if (a === 'clear') { pushUndo(T); ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, N, N); }
  paintChanged(T); CUR = null;
}
// the Paint over section, at the top of every pattern's panel
function ovlGroup() {
  const on = ovlOn(), P = S.ovl, tool = P.pbTool | 0;
  const trees = MODES[S.mode].kind === 'trees';
  const defs = [{k:'__on', l:trees ? 'Paint leaf density' : 'Paint over the gobo', type:'chk', h:trees ? 'Paint where the canopy should be thinner or fuller. Leaves are removed or grown where you paint (and the finer twigs go where it is cleared right out), so it still looks and moves like a tree.' : 'Paint on top of the pattern in chosen areas to open it up or thicken it. On moving shapes the painting travels with the pattern.'}];
  if (on) defs.push(
    {type:'mount', mount:el => paintPad(el, ovlTarget())},
    {k:'pbInk', l:'Effect', opts:MODES[S.mode].kind === 'trees' ? ['Thin out the leaves (more light)', 'Fill in the leaves (more shadow)', 'Erase back to the original'] : ['Open up (more light)', 'Thicken (more shadow)', 'Erase back to the original']},
    {k:'pbTool', l:'Brush', opts:['Soft round', 'Soft cloud', 'Mottle (soft noise)', 'Soft dots', 'Blur (soften the painting)'], vals:[0, 6, 7, 8, 3]},
    {k:'pbSize', l:'Brush size', min:0.5, max:60, step:0.1, u:'%'},
    {k:'pbSoft', l:'Brush softness', min:0, max:1, step:0.01},
    {k:'pbFlow', l:'Strength', min:0.02, max:1, step:0.01, h:'How much each stroke adds. Light strokes thin the pattern out or fill it in; keep going over an area to clear it completely or close it up.'},
    ...(tool === 3 ? [{k:'pbBlur', l:'Blur amount', min:0, max:1, step:0.01}] : []),
    {k:'pbWrap', l:'Wrap at the edges', type:'chk', h:'For seamless tiles, so the painting repeats with the tile.'},
    {type:'buttons', items:[['Undo', () => ovlAction('undo')], ['Clear the paint-over', () => ovlAction('clear')]]},
    {type:'note', l:(trees ? 'Paint on the canvas above (warm: fewer leaves, blue: more), on the Gobo preview, or in the Scene view right where the light lands, for example on a face the leaves shade too much. The change belongs to the leaves themselves, so it sways with the tree. ' : 'Paint on the canvas above (warm: opened up, blue: thickened), on the Gobo preview, or in the Scene view right where the light lands. ') + 'Strokes build up: go over an area again for a stronger change.'},
  );
  return defs;
}
function ovlChanged(k) {
  if (k === '__on') { S.ovl.on = {...(S.ovl.on || {}), [S.mode]:!!S.ovl.__on}; delete S.ovl.__on; buildPanel(); dirty = true; }
  else if (k === 'pbTool') buildPanel();
  save();
}
