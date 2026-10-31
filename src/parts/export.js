/* =====================================================================
   EXPORT
   The final gobo (after Levels and Paint over) as one frame or a frame
   range, at a chosen square resolution, written as PNG, JPEG, TIFF,
   OpenEXR or Ptex. Every writer is in this file; compression uses the
   browser's own zlib (CompressionStream 'deflate').
   ===================================================================== */
const EXPORT = (() => {
  const FMT = {
    exr: {label:'OpenEXR  .exr', ext:'exr', depths:[['half', '16-bit half float'], ['float', '32-bit float']]},
    ptx: {label:'Ptex  .ptx', ext:'ptx', depths:[['half', '16-bit half float'], ['float', '32-bit float'], ['16', '16-bit integer'], ['8', '8-bit integer']]},
    tif: {label:'TIFF  .tif', ext:'tif', depths:[['16', '16-bit integer'], ['32', '32-bit float'], ['8', '8-bit integer']]},
    png: {label:'PNG  .png', ext:'png', depths:[['16', '16-bit'], ['8', '8-bit']]},
    jpg: {label:'JPEG  .jpg', ext:'jpg', depths:[['8', '8-bit']]},
  };
  const isFloat = d => d === 'half' || d === 'float' || d === '32';
  const DEF = {fmt:'exr', depth:'half', res:2048, range:'current', from:1, to:48, first:1001, chans:'rgb', enc:'srgb', qual:'high', name:'', dest:'zip', rig:'off', send:'on'};
  S.exp = {...DEF, ...(S.exp || {})};
  if (!FMT[S.exp.fmt]) S.exp.fmt = 'exr';
  const st = {busy:false, cancel:false};

  /* ---------- small binary helpers ---------- */
  const enc = new TextEncoder();
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  function f2h(v) {
    f32[0] = v; const x = u32[0];
    const s = (x >>> 16) & 0x8000; let e = (x >>> 23) & 255, m = x & 0x7fffff;
    if (e === 255) return s | 0x7c00 | (m ? 0x200 : 0);
    e += -127 + 15;
    if (e >= 31) return s | 0x7c00;
    if (e <= 0) { if (e < -10) return s; m = (m | 0x800000) >> (1 - e); if (m & 0x1000) m += 0x2000; return s | (m >> 13); }
    if (m & 0x1000) { m += 0x2000; if (m & 0x800000) { m = 0; e++; if (e >= 31) return s | 0x7c00; } }
    return s | (e << 10) | (m >> 13);
  }
  const srgb = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  let CRC = null;
  function crc32(u8, c = 0) {
    if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let k = n; for (let j = 0; j < 8; j++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1; CRC[n] = k; } }
    c = ~c;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  }
  async function zlib(u8) {
    const cs = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(cs).arrayBuffer());
  }
  // a growable little/big-endian byte writer
  class W {
    constructor(n = 1024) { this.b = new Uint8Array(n); this.dv = new DataView(this.b.buffer); this.p = 0; }
    need(n) { if (this.p + n <= this.b.length) return; let m = this.b.length * 2; while (m < this.p + n) m *= 2; const b = new Uint8Array(m); b.set(this.b); this.b = b; this.dv = new DataView(b.buffer); }
    u8(v) { this.need(1); this.b[this.p++] = v; }
    u16(v, be) { this.need(2); this.dv.setUint16(this.p, v, !be); this.p += 2; }
    u32(v, be) { this.need(4); this.dv.setUint32(this.p, v, !be); this.p += 4; }
    i32(v) { this.need(4); this.dv.setInt32(this.p, v, true); this.p += 4; }
    i8(v) { this.need(1); this.dv.setInt8(this.p, v); this.p++; }
    f32(v) { this.need(4); this.dv.setFloat32(this.p, v, true); this.p += 4; }
    u64(v) { this.need(8); this.dv.setUint32(this.p, v % 4294967296, true); this.dv.setUint32(this.p + 4, Math.floor(v / 4294967296), true); this.p += 8; }
    bytes(u) { this.need(u.length); this.b.set(u, this.p); this.p += u.length; }
    str(s) { this.bytes(enc.encode(s)); }
    cstr(s) { this.str(s); this.u8(0); }
    out() { return this.b.subarray(0, this.p); }
  }

  /* ---------- image values ----------
     img = {w, h, nch, data: Float32Array, rows top to bottom, linear 0..1} */
  // integer samples, with the chosen transfer curve
  function quant(img, bits, curve, bottomUp = false) {
    const {w, h, nch, data} = img, max = bits === 16 ? 65535 : 255;
    const out = bits === 16 ? new Uint16Array(w * h * nch) : new Uint8Array(w * h * nch);
    const lut = new Float32Array(4097);
    for (let i = 0; i <= 4096; i++) lut[i] = curve === 'srgb' ? srgb(i / 4096) : i / 4096;
    // through a fine table with linear interpolation: exact enough for 16-bit and quick at 4K
    for (let y = 0; y < h; y++) {
      const sy = bottomUp ? h - 1 - y : y, so = sy * w * nch, o = y * w * nch;
      for (let i = 0; i < w * nch; i++) {
        const v = clamp01(data[so + i]) * 4096, k = v | 0, f = v - k;
        const e = k >= 4096 ? lut[4096] : lut[k] + (lut[k + 1] - lut[k]) * f;
        out[o + i] = Math.round(e * max);
      }
    }
    return out;
  }

  /* ---------- PNG ---------- */
  async function writePNG(img, depth, curve) {
    const {w, h, nch} = img, bits = depth === '16' ? 16 : 8, bpp = nch * bits / 8, row = w * bpp;
    const q = quant(img, bits, curve);
    const raw = new Uint8Array(h * (row + 1));
    const line = new Uint8Array(row), prev = new Uint8Array(row);
    for (let y = 0; y < h; y++) {
      if (bits === 16) { for (let i = 0, o = y * w * nch; i < w * nch; i++) { const v = q[o + i]; line[2 * i] = v >> 8; line[2 * i + 1] = v & 255; } }
      else line.set(q.subarray(y * row, y * row + row));
      const o = y * (row + 1);
      raw[o] = 2;                                      // "Up" filter: smooth light patterns compress well with it
      for (let i = 0; i < row; i++) raw[o + 1 + i] = (line[i] - prev[i]) & 255;
      prev.set(line);
    }
    const idat = await zlib(raw);
    const out = new W(idat.length + 200);
    out.bytes([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunk = (type, body) => { out.u32(body.length, true); const t = new Uint8Array(4 + body.length); t.set(enc.encode(type)); t.set(body, 4); out.bytes(t); out.u32(crc32(t), true); };
    const ih = new W(13); ih.u32(w, true); ih.u32(h, true); ih.u8(bits); ih.u8(nch === 1 ? 0 : 2); ih.u8(0); ih.u8(0); ih.u8(0);
    chunk('IHDR', ih.out());
    if (curve === 'srgb') chunk('sRGB', new Uint8Array([0]));
    else { const g = new W(4); g.u32(100000, true); chunk('gAMA', g.out()); }
    const tx = enc.encode('Software\0Cucoloris Lab'); chunk('tEXt', tx);
    chunk('IDAT', idat);
    chunk('IEND', new Uint8Array(0));
    return out.out();
  }

  /* ---------- JPEG (through a canvas) ---------- */
  async function writeJPG(img, curve) {
    const {w, h, nch} = img, q = quant(img, 8, curve);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), id = g.createImageData(w, h);
    for (let i = 0, n = w * h; i < n; i++) {
      const r = q[i * nch], gg = q[i * nch + (nch > 1 ? 1 : 0)], b = q[i * nch + (nch > 1 ? 2 : 0)];
      id.data[i * 4] = r; id.data[i * 4 + 1] = gg; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.95));
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* ---------- TIFF: deflate strips, 8/16-bit integer or 32-bit float ---------- */
  async function writeTIF(img, depth, curve) {
    const {w, h, nch, data} = img, fl = depth === '32', bits = fl ? 32 : +depth, bps = bits / 8;
    const q = fl ? null : quant(img, bits, curve);
    const rps = Math.max(1, Math.min(h, Math.floor(262144 / (w * nch * bps)) || 1));
    const nstrips = Math.ceil(h / rps), strips = [];
    for (let s = 0; s < nstrips; s++) {
      const y0 = s * rps, y1 = Math.min(h, y0 + rps), n = (y1 - y0) * w * nch;
      let u8;
      if (fl) { const f = new Float32Array(n); f.set(data.subarray(y0 * w * nch, y1 * w * nch)); u8 = new Uint8Array(f.buffer); }
      else if (bits === 16) { const a = new Uint16Array(n); a.set(q.subarray(y0 * w * nch, y1 * w * nch)); u8 = new Uint8Array(a.buffer); }
      else u8 = q.slice(y0 * w * nch, y1 * w * nch);
      strips.push(zlib(u8));
    }
    const comp = await Promise.all(strips);
    const tags = [];
    const T = (id, type, vals) => tags.push({id, type, vals: Array.isArray(vals) ? vals : [vals]});
    T(256, 4, w); T(257, 4, h); T(258, 3, new Array(nch).fill(bits)); T(259, 3, 8); T(262, 3, nch === 1 ? 1 : 2);
    T(273, 4, new Array(nstrips).fill(0)); T(277, 3, nch); T(278, 4, rps); T(279, 4, comp.map(c => c.length));
    T(282, 5, [72, 1]); T(283, 5, [72, 1]); T(284, 3, 1); T(296, 3, 2);
    T(305, 2, 'Cucoloris Lab'); T(339, 3, new Array(nch).fill(fl ? 3 : 1));
    const SZ = {2:1, 3:2, 4:4, 5:8};
    const count = t => t.type === 2 ? t.vals[0].length + 1 : t.type === 5 ? t.vals.length / 2 : t.vals.length;
    // layout: header, IFD, out-of-line values, strips
    const ifdLen = 2 + tags.length * 12 + 4;
    let extra = 8 + ifdLen;
    for (const t of tags) { const n = count(t) * SZ[t.type]; if (n > 4) { t.off = extra; extra += n + (n & 1); } }
    let dataOff = extra;
    const so = tags.find(t => t.id === 273);
    so.vals = comp.map(c => { const o = dataOff; dataOff += c.length; return o; });
    const out = new W(extra + 16);
    out.bytes([73, 73, 42, 0]); out.u32(8);
    out.u16(tags.length);
    const putVals = (t) => {
      if (t.type === 2) { out.cstr(t.vals[0]); return; }
      for (const v of t.vals) t.type === 3 ? out.u16(v) : out.u32(v);
    };
    for (const t of tags) {
      out.u16(t.id); out.u16(t.type); out.u32(count(t));
      const n = count(t) * SZ[t.type];
      if (n > 4) out.u32(t.off);
      else { const p0 = out.p; putVals(t); while (out.p < p0 + 4) out.u8(0); }
    }
    out.u32(0);
    for (const t of tags) if (t.off) { while (out.p < t.off) out.u8(0); putVals(t); }
    while (out.p < extra) out.u8(0);
    return new Blob([out.out(), ...comp]);
  }

  /* ---------- OpenEXR: scanline, ZIP compression (16 lines a block) ---------- */
  async function writeEXR(img, depth) {
    const {w, h, nch, data} = img, half = depth === 'half', bpc = half ? 2 : 4;
    const names = nch === 1 ? ['Y'] : ['B', 'G', 'R'], src = nch === 1 ? [0] : [2, 1, 0];
    const hd = new W(512);
    hd.u32(20000630); hd.u32(2);
    const attr = (name, type, body) => { hd.cstr(name); hd.cstr(type); hd.i32(body.length); hd.bytes(body); };
    const ch = new W(64);
    for (const n of names) { ch.cstr(n); ch.i32(half ? 1 : 2); ch.u8(0); ch.u8(0); ch.u8(0); ch.u8(0); ch.i32(1); ch.i32(1); }
    ch.u8(0);
    attr('channels', 'chlist', ch.out());
    attr('compression', 'compression', new Uint8Array([3]));
    const box = new W(16); box.i32(0); box.i32(0); box.i32(w - 1); box.i32(h - 1);
    attr('dataWindow', 'box2i', box.out()); attr('displayWindow', 'box2i', box.out());
    attr('lineOrder', 'lineOrder', new Uint8Array([0]));
    const one = new W(4); one.f32(1);
    attr('pixelAspectRatio', 'float', one.out());
    attr('screenWindowCenter', 'v2f', new Uint8Array(8));
    attr('screenWindowWidth', 'float', one.out());
    attr('software', 'string', enc.encode('Cucoloris Lab'));
    hd.u8(0);
    const L = 16, nb = Math.ceil(h / L);
    const jobs = [];
    for (let b = 0; b < nb; b++) {
      const y0 = b * L, y1 = Math.min(h, y0 + L), n = (y1 - y0) * w * nch * bpc;
      const raw = new Uint8Array(n), dv = new DataView(raw.buffer);
      let p = 0;
      for (let y = y0; y < y1; y++) for (let c = 0; c < nch; c++) {
        const o = y * w * nch + src[c];
        if (half) for (let x = 0; x < w; x++, p += 2) dv.setUint16(p, f2h(data[o + x * nch]), true);
        else for (let x = 0; x < w; x++, p += 4) dv.setFloat32(p, data[o + x * nch], true);
      }
      // OpenEXR's zip preprocessing: split even/odd bytes, then byte deltas
      const t = new Uint8Array(n), hh = (n + 1) >> 1;
      for (let i = 0, a = 0, z = hh; i < n; i += 2) { t[a++] = raw[i]; if (i + 1 < n) t[z++] = raw[i + 1]; }
      for (let i = n - 1; i > 0; i--) t[i] = (t[i] - t[i - 1] + 128) & 255;
      jobs.push(zlib(t).then(c => ({y:y0, d: c.length < n ? c : raw})));
    }
    const blocks = await Promise.all(jobs);
    const head = hd.out();
    let off = head.length + nb * 8;
    const tab = new W(nb * 8), parts = [];
    for (const bl of blocks) {
      tab.u64(off);
      const bh = new W(8); bh.i32(bl.y); bh.i32(bl.d.length);
      parts.push(bh.out(), bl.d); off += 8 + bl.d.length;
    }
    return new Blob([head, tab.out(), ...parts]);
  }

  /* ---------- Ptex: one quad face, mipmapped (Ptex file format 1.4) ----------
     Rows run v = 0 at the bottom, as the preview shows them. */
  async function writePTX(img, depth, curve, periodic) {
    const {w, h, nch} = img;
    const dt = {'8':0, '16':1, half:2, float:3}[depth], bpc = [1, 2, 2, 4][dt], ps = bpc * nch;
    const ul = Math.round(Math.log2(w)), vl = Math.round(Math.log2(h));
    if ((1 << ul) !== w || (1 << vl) !== h) throw new Error('Ptex needs a power-of-two resolution');
    const nlevels = 1 + Math.max(0, Math.min(ul, vl) - 2);
    // linear float levels, bottom row first
    let lev = new Float32Array(w * h * nch);
    for (let y = 0; y < h; y++) lev.set(img.data.subarray((h - 1 - y) * w * nch, (h - y) * w * nch), y * w * nch);
    const levels = [];
    let lw = w, lh = h;
    for (let l = 0; l < nlevels; l++) {
      levels.push({w:lw, h:lh, f:lev});
      if (l === nlevels - 1) break;
      const nw = lw >> 1, nh = lh >> 1, nx = new Float32Array(nw * nh * nch);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < nch; c++) {
        const a = ((2 * y) * lw + 2 * x) * nch + c, b = a + lw * nch;
        nx[(y * nw + x) * nch + c] = 0.25 * (lev[a] + lev[a + nch] + lev[b] + lev[b + nch]);
      }
      lev = nx; lw = nw; lh = nh;
    }
    // samples as stored
    const bytesOf = (L) => {
      const n = L.w * L.h * nch, u8 = new Uint8Array(n * bpc), dv = new DataView(u8.buffer);
      if (dt === 3) for (let i = 0; i < n; i++) dv.setFloat32(i * 4, L.f[i], true);
      else if (dt === 2) for (let i = 0; i < n; i++) dv.setUint16(i * 2, f2h(L.f[i]), true);
      else {
        const q = quant({w:L.w, h:L.h, nch, data:L.f}, dt ? 16 : 8, curve);
        if (dt === 1) for (let i = 0; i < n; i++) dv.setUint16(i * 2, q[i], true); else u8.set(q);
      }
      return u8;
    };
    // one block: deinterleave to planes, byte/short deltas for integers, zlib
    const block = async (src, stride, bw, bh) => {
      const plane = bw * bh * bpc, t = new Uint8Array(plane * nch);
      for (let c = 0; c < nch; c++) for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const s = y * stride + x * ps + c * bpc, d = c * plane + (y * bw + x) * bpc;
        for (let k = 0; k < bpc; k++) t[d + k] = src[s + k];
      }
      let encd = 1;
      if (dt === 0) { let prev = 0; for (let i = 0; i < t.length; i++) { const v = t[i]; t[i] = (v - prev) & 255; prev = v; } encd = 2; }
      else if (dt === 1) { const a = new Uint16Array(t.buffer); let prev = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; a[i] = (v - prev) & 65535; prev = v; } encd = 2; }
      const z = await zlib(t);
      return {z, fdh: (z.length | (encd << 30)) >>> 0};
    };
    const flog2 = x => x <= 1 ? 0 : Math.floor(Math.log2(x));
    const face = async (L, lul, lvl) => {
      const u8 = bytesOf(L), stride = L.w * ps;
      const ntl = flog2(Math.floor(L.w * L.h * ps / 65536));
      if (ntl === 0) return block(u8, stride, L.w, L.h);
      const n = lul + lvl - ntl, tul = Math.min((n + 1) >> 1, lul), tvl = Math.min(n - tul, lvl);
      const tw = 1 << tul, th = 1 << tvl, ntu = L.w / tw, ntv = L.h / th;
      const tiles = [];
      for (let ty = 0; ty < ntv; ty++) for (let tx = 0; tx < ntu; tx++) {
        const base = ty * th * stride + tx * tw * ps;
        // a constant tile is stored as its one pixel
        let constant = true;
        for (let y = 0; y < th && constant; y++) for (let x = 0; x < tw * ps; x++) if (u8[base + y * stride + x] !== u8[base + (x % ps)]) { constant = false; break; }
        if (constant) tiles.push(Promise.resolve({z: u8.slice(base, base + ps), fdh: ps >>> 0}));
        else tiles.push(block(u8.subarray(base), stride, tw, th));
      }
      const done = await Promise.all(tiles);
      const th32 = new W(done.length * 4); for (const d of done) th32.u32(d.fdh);
      const zh = await zlib(th32.out());
      const out = new W(6 + zh.length);
      out.i8(tul); out.i8(tvl); out.u32(zh.length); out.bytes(zh);
      const parts = [out.out(), ...done.map(d => d.z)];
      const size = parts.reduce((a, p) => a + p.length, 0);
      const all = new Uint8Array(size); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      return {z: all, fdh: (size | (3 << 30)) >>> 0};
    };
    const faces = [];
    for (let l = 0; l < nlevels; l++) faces.push(await face(levels[l], ul - l, vl - l));
    // face info, constant (average) value
    const fi = new W(20); fi.i8(ul); fi.i8(vl); fi.u8(0); fi.u8(0); for (let k = 0; k < 4; k++) fi.i32(-1);
    const zfi = await zlib(fi.out());
    const last = levels[nlevels - 1], avg = new Float32Array(nch);
    for (let i = 0; i < last.w * last.h; i++) for (let c = 0; c < nch; c++) avg[c] += last.f[i * nch + c] / (last.w * last.h);
    const zcd = await zlib(bytesOf({w:1, h:1, f:avg}));
    // per level: compressed array of face data headers, then the face blocks
    const lvHead = [], li = new W(16 * nlevels);
    let total = 0;
    for (let l = 0; l < nlevels; l++) {
      const fh = new W(4); fh.u32(faces[l].fdh);
      const zh = await zlib(fh.out());
      lvHead.push(zh);
      const size = zh.length + faces[l].z.length;
      li.u64(size); li.u32(zh.length); li.u32(1);
      total += size;
    }
    const hd = new W(104);
    hd.u32(0x78657450); hd.u32(1); hd.u32(1); hd.u32(dt); hd.i32(-1); hd.u16(nch); hd.u16(nlevels); hd.u32(1);
    hd.u32(40); hd.u32(zfi.length); hd.u32(zcd.length); hd.u32(16 * nlevels); hd.u32(4);
    hd.u64(total); hd.u32(0); hd.u32(0);
    const bm = periodic ? 2 : 0;
    hd.u16(bm); hd.u16(0); hd.u16(bm); hd.u16(0); hd.u32(0); hd.u32(0); hd.u64(0); hd.u64(0); hd.u64(0);
    const parts = [hd.out(), zfi, zcd, li.out()];
    for (let l = 0; l < nlevels; l++) parts.push(lvHead[l], faces[l].z);
    parts.push(new Uint8Array(8));
    return new Blob(parts);
  }

  /* ---------- ZIP (stored: every format inside is already compressed) ---------- */
  class Zip {
    constructor() { this.parts = []; this.cd = []; this.off = 0; this.n = 0; }
    async add(name, blob) {
      const u8 = new Uint8Array(await blob.arrayBuffer()), crc = crc32(u8), nm = enc.encode(name);
      const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const lh = new W(30 + nm.length);
      lh.u32(0x04034b50); lh.u16(20); lh.u16(0x0800); lh.u16(0); lh.u16(time); lh.u16(date); lh.u32(crc); lh.u32(u8.length); lh.u32(u8.length); lh.u16(nm.length); lh.u16(0); lh.bytes(nm);
      const ch = new W(46 + nm.length);
      ch.u32(0x02014b50); ch.u16(20); ch.u16(20); ch.u16(0x0800); ch.u16(0); ch.u16(time); ch.u16(date); ch.u32(crc); ch.u32(u8.length); ch.u32(u8.length);
      ch.u16(nm.length); ch.u16(0); ch.u16(0); ch.u16(0); ch.u16(0); ch.u32(0); ch.u32(this.off); ch.bytes(nm);
      this.parts.push(lh.out(), blob); this.cd.push(ch.out());
      this.off += lh.p + u8.length; this.n++;
    }
    get size() { return this.off; }
    blob() {
      const cdLen = this.cd.reduce((a, c) => a + c.length, 0);
      const e = new W(22); e.u32(0x06054b50); e.u16(0); e.u16(0); e.u16(this.n); e.u16(this.n); e.u32(cdLen); e.u32(this.off); e.u16(0);
      return new Blob([...this.parts, ...this.cd, e.out()], {type:'application/zip'});
    }
  }

  /* ---------- rendering one frame at the export size ---------- */
  function grab(R, nch) {
    const T = tgt('expF', R, R, floatOK ? 'f32' : 'u8');
    render(T);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    const out = new Float32Array(R * R * nch);
    const rows = Math.max(1, Math.min(R, Math.floor(4e6 / (R * 4))));
    const buf = floatOK ? new Float32Array(R * rows * 4) : new Uint8Array(R * rows * 4), k = floatOK ? 1 : 1 / 255;
    for (let y0 = 0; y0 < R; y0 += rows) {
      const n = Math.min(rows, R - y0);
      gl.readPixels(0, y0, R, n, gl.RGBA, floatOK ? gl.FLOAT : gl.UNSIGNED_BYTE, buf, 0);
      for (let r = 0; r < n; r++) {
        const o = (R - 1 - (y0 + r)) * R * nch, b = r * R * 4;      // GL rows run bottom-up; images top-down
        if (nch === 3) for (let x = 0; x < R; x++) { out[o + x * 3] = buf[b + x * 4] * k; out[o + x * 3 + 1] = buf[b + x * 4 + 1] * k; out[o + x * 3 + 2] = buf[b + x * 4 + 2] * k; }
        else for (let x = 0; x < R; x++) out[o + x] = (0.2126 * buf[b + x * 4] + 0.7152 * buf[b + x * 4 + 1] + 0.0722 * buf[b + x * 4 + 2]) * k;
      }
    }
    return {w:R, h:R, nch, data:out};
  }
  async function encode(img, o) {
    const periodic = !!MODES[S.mode].tileable && !(S.p[S.mode].framing > 0);
    if (o.fmt === 'png') return new Blob([await writePNG(img, o.depth, o.enc)]);
    if (o.fmt === 'jpg') return new Blob([await writeJPG(img, o.enc)]);
    if (o.fmt === 'tif') return writeTIF(img, o.depth, o.enc);
    if (o.fmt === 'exr') return writeEXR(img, o.depth);
    return writePTX(img, o.depth, o.enc, periodic);
  }

  /* ---------- frames and names ---------- */
  function frames(e = S.exp) {
    const sd = shotActive() && SHOT.frames.length > 1 && shotDef(S.shotSel);
    const total = Math.max(1, Math.round(TL().len * S.fps));
    const cur = Math.min(total - 1, Math.floor(S.t * S.fps + 1e-6));
    if (sd) return {shot:true, lo:sd.first, hi:sd.last, cur:sd.first + cur, time:f => (f - sd.first) / S.fps, num:f => f};
    return {shot:false, lo:1, hi:total, cur:cur + 1, time:f => (f - 1) / S.fps, num:f => (e.first | 0) + f - 1};
  }
  const baseName = (e = S.exp) => (e.name || '').trim().replace(/[^\w.-]+/g, '_') || defaultName();
  function defaultName() {
    const sd = shotActive() && shotDef(S.shotSel);
    return 'gobo_' + (sd ? sd.shot.replace(/[^\w]+/g, '_') + '_' : '') + S.mode;
  }
  const fname = (n, e = S.exp) => `${baseName(e)}.${String(n).padStart(4, '0')}.${FMT[e.fmt].ext}`;
  const rigNames = (e = S.exp) => ({usd:`${baseName(e)}.light.usda`, settings:`${baseName(e)}.cucoloris.json`});
  function list(e = S.exp) {
    const F = frames(e);
    if (e.range === 'current') return [F.cur];
    let a = e.range === 'all' ? F.lo : Math.round(+e.from), b = e.range === 'all' ? F.hi : Math.round(+e.to);
    if (!isFinite(a)) a = F.lo; if (!isFinite(b)) b = a;
    if (b < a) [a, b] = [b, a];
    a = Math.max(F.lo, a); b = F.shot ? Math.min(F.hi, b) : Math.min(a + 9999, b);
    const out = []; for (let f = a; f <= b; f++) out.push(f);
    return out;
  }
  const wantsRig = e => e.rig === 'on' || e.rig === true || wantsSend(e);
  const wantsSend = e => !!HOST.sendLight && (e.send === 'on' || e.send === true);
  const hostWrites = () => typeof HOST.writeFile === 'function';
  const joinPath = (dir, name) => dir ? dir.replace(/[\\/]+$/, '') + '/' + name : name;
  const exportDir = (e = S.exp) => { try { return HOST.exportDir({shot:shotActive() ? shotDef(S.shotSel) : null, mode:S.mode, name:baseName(e)}) || ''; } catch (err) { return ''; } };

  /* ---------- where the files go ---------- */
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const dlP = inClaude ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  const canFolder = !inClaude && typeof window.showDirectoryPicker === 'function';
  // inside Claude a page may hand over only some file types itself; the rest travel in a zip
  const DIRECT = inClaude ? ['png', 'jpg', 'zip', 'json'] : null;
  async function deliver(name, blob) {
    const dl = await dlP;
    if (dl) {
      try { await dl.save({filename:name, data:blob}); return true; }
      catch (e) {
        if (e && e.code === 'declined') throw new Error('The save was declined, so the export stopped.');
        if (e && e.code === 'rate_limited') { await new Promise(r => setTimeout(r, 1500)); return deliver(name, blob); }
        throw new Error(`Saving failed (${e && (e.code || e.message) || e}).`);
      }
    }
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return true;
  }

  /* ---------- the run ----------
     over: settings that replace the dialog's for this run only (the scripting API passes them) */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function run(onProgress, over = {}) {
    if (st.busy) throw new Error('An export is already running.');
    const e = {...S.exp, ...over}, F = frames(e), fl = list(e), R = +e.res, nch = e.chans === 'y' ? 1 : 3;
    if (!FMT[e.fmt]) throw new Error(`Unknown format "${e.fmt}".`);
    if (!FMT[e.fmt].depths.some(d => d[0] === e.depth)) e.depth = FMT[e.fmt].depths[0][0];
    const ext = FMT[e.fmt].ext, base = baseName(e), rig = wantsRig(e), send = wantsSend(e), hw = hostWrites();
    const multi = fl.length > 1;
    let dir = null;
    if (!hw && multi && e.dest === 'folder' && canFolder) {
      try { dir = await window.showDirectoryPicker({mode:'readwrite', id:'cucoloris-export'}); }
      catch (err) { if (err && err.name === 'AbortError') return {cancelled:true, written:0, total:fl.length}; dir = null; }
    }
    // on the web, anything beyond a single directly downloadable file travels in a zip
    const zipAll = !hw && !dir && (multi || rig || (DIRECT && !DIRECT.includes(ext)));
    const outDir = hw ? exportDir(e) : '';
    const keep = {res:S.res, quality:S.quality, t:S.t, playing:S.playing};
    st.busy = true; st.cancel = false;
    setPlaying(false);
    const ZIPCAP = 1 << 30;
    let zip = null, zparts = 0, written = 0;
    const paths = [];
    const t0 = performance.now();
    const flush = async (final) => {
      if (!zip || !zip.n) return;
      zparts++;
      const label = final && zparts === 1 ? '' : `_part${zparts}`;
      await deliver(`${base}.${zip.lo === zip.hi ? zip.lo : zip.lo + '-' + zip.hi}.${ext}${label}.zip`, zip.blob());
      zip = null;
    };
    // one file to wherever this export writes; returns the path the light rig should use for it
    const put = async (name, blob, num) => {
      if (hw) return (await HOST.writeFile(joinPath(outDir, name), blob)) || joinPath(outDir, name);
      if (dir) { const fh = await dir.getFileHandle(name, {create:true}), ws = await fh.createWritable(); await ws.write(blob); await ws.close(); return './' + name; }
      if (!zipAll) { await deliver(name, blob); return './' + name; }
      if (!zip) { zip = new Zip(); zip.lo = zip.hi = num; }
      await zip.add(name, blob); if (num !== undefined) zip.hi = num;
      return './' + name;
    };
    let result = null;
    try {
      S.res = R; S.quality = e.qual;
      for (let i = 0; i < fl.length; i++) {
        if (st.cancel) break;
        const f = fl[i];
        onProgress && onProgress(i, fl.length, f, performance.now() - t0);
        await sleep(0);
        if (MODES[S.mode].kind === 'trees') { treesFor(S.p[S.mode], TL()); while (TR.windPending) { await sleep(60); if (st.cancel) break; } }
        S.t = F.time(f);
        const img = grab(R, nch);
        const blob = await encode(img, e);
        const num = F.num(f);
        paths.push({frame:num, path:await put(fname(num, e), blob, num)});
        written++;
        if (zip && zip.size > ZIPCAP) await flush(false);
      }
      // the light rig and the settings that made these frames
      let rigOut = null;
      if (rig && !st.cancel && written) {
        S.res = keep.res; S.t = keep.t;
        const rn = rigNames(e);
        const json = new Blob([JSON.stringify(settingsFile(), null, 1)], {type:'application/json'});
        const setPath = await put(rn.settings, json);
        const info = {files:paths, pattern:`${base}.$F4.${ext}`, hashPattern:`${base}.####.${ext}`, format:e.fmt, depth:e.depth,
                      colorSpace:isFloat(e.depth) || e.enc !== 'srgb' ? 'linear' : 'sRGB', channels:e.chans, res:R, fps:S.fps, settingsPath:setPath};
        const rigObj = lightRig(info);
        const usdPath = await put(rn.usd, new Blob([rigUSDA(rigObj)], {type:'text/plain'}));
        rigOut = {rig:rigObj, files:{gobo:paths.map(p => p.path), usd:usdPath, settings:setPath}};
      }
      await flush(!st.cancel || zparts === 0);          // a stopped export still hands over the frames it finished
      if (rigOut && send) await HOST.sendLight(rigOut.rig, rigOut.files);
      onProgress && onProgress(written, fl.length, null, performance.now() - t0);
      result = {written, total:fl.length, cancelled:st.cancel, ms:performance.now() - t0, folder:dir && dir.name, dir:outDir, paths, rig:rigOut, sent:!!(rigOut && send)};
      return result;
    } finally {
      S.res = keep.res; S.quality = keep.quality; S.t = keep.t;
      const T = targets.expF; if (T) { gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); delete targets.expF; }
      st.busy = false;
      setPlaying(keep.playing);
      dirty = true;
    }
  }

  /* ---------- dialog ---------- */
  const css = document.createElement('style');
  css.textContent = `
.expbtn{margin-left:auto;background:var(--accent);color:var(--accent-ink);border:1px solid var(--accent);border-radius:6px;padding:5px 12px;font-weight:600;cursor:pointer}
.expbtn:hover{filter:brightness(1.08)}
.expwrap{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgba(5,7,9,.62);padding:16px}
.expwrap[hidden]{display:none}
.expdlg{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.expdlg h2{margin:0;font-family:var(--f-disp);font-stretch:75%;font-weight:640;text-transform:uppercase;letter-spacing:.1em;font-size:14px;display:flex;align-items:center;justify-content:space-between}
.expdlg .x{background:none;border:0;color:var(--mute);font-size:20px;cursor:pointer;line-height:1;padding:0 4px}
.exprow{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center}
.exprow > span{color:var(--mute);font-size:12px}
.expdlg select,.expdlg input[type=number],.expdlg input[type=text]{background:var(--raise);border:1px solid var(--line);border-radius:5px;padding:5px 7px;min-width:0}
.expdlg input[type=number]{width:84px}
.expseg{display:flex;flex-wrap:wrap;gap:3px;background:var(--raise);border:1px solid var(--line);border-radius:7px;padding:2px;width:max-content;max-width:100%}
.expseg button{background:none;border:0;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;color:var(--mute)}
.expseg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink)}
.expinl{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.expnote{margin:0;color:var(--mute);font-size:11.5px;line-height:1.45}
.expnote b{color:var(--fg);font-weight:600}
.expnote a{color:var(--sky)}
.expgo{display:flex;gap:10px;align-items:center}
.expgo .run{background:var(--accent);color:var(--accent-ink);border:0;border-radius:6px;padding:8px 18px;font-weight:600;cursor:pointer}
.expgo .run:disabled{opacity:.5;cursor:default}
.expgo .stop{background:var(--raise);border:1px solid var(--line);border-radius:6px;padding:7px 14px;cursor:pointer}
.expbar{flex:1;height:6px;border-radius:3px;background:var(--line);overflow:hidden}
.expbar i{display:block;height:100%;width:0;background:var(--accent);transition:width .15s}
.expstat{font-family:var(--f-mono);font-size:11.5px;color:var(--mute);min-height:1.4em}
.expstat.err{color:var(--warn)}
.expset{border-top:1px solid var(--line);padding-top:12px}
.expset button{background:var(--raise);border:1px solid var(--line);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer}
.expset button:hover{border-color:var(--accent);color:var(--accent)}
.expdlg [hidden]{display:none !important}
@media (max-width:520px){.exprow{grid-template-columns:1fr}}`;
  document.head.append(css);
  const wrap = document.createElement('div');
  wrap.className = 'expwrap'; wrap.hidden = true;
  wrap.innerHTML = `<div class="expdlg" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="expT">
  <h2 id="expT">Export gobo <button class="x" data-x aria-label="Close">×</button></h2>
  <div class="exprow"><span>Frames</span><div class="expseg" data-seg="range"><button data-v="current">Current frame</button><button data-v="range">Frame range</button><button data-v="all">Whole timeline</button></div></div>
  <div class="exprow" data-show="range"><span>Range</span><div class="expinl"><label>from <input type="number" data-k="from" step="1"></label><label>to <input type="number" data-k="to" step="1"></label><span class="expnote" data-out="count"></span></div></div>
  <div class="exprow" data-show="first"><span>First file number</span><div class="expinl"><input type="number" data-k="first" step="1" min="0"><span class="expnote">timeline frame 1 is written as this number</span></div></div>
  <div class="exprow"><span>Resolution</span><div class="expseg" data-seg="res"></div></div>
  <div class="exprow"><span>Format</span><select data-k="fmt">${Object.entries(FMT).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select></div>
  <div class="exprow"><span>Bit depth</span><select data-k="depth"></select></div>
  <div class="exprow"><span>Channels</span><div class="expseg" data-seg="chans"><button data-v="rgb">RGB</button><button data-v="y">One channel (luminance)</button></div></div>
  <div class="exprow" data-show="enc"><span>Encoding</span><div class="expseg" data-seg="enc"><button data-v="srgb">sRGB</button><button data-v="linear">Linear</button></div></div>
  <div class="exprow"><span>Quality</span><div class="expseg" data-seg="qual"><button data-v="draft">Draft</button><button data-v="high">High</button><button data-v="ultra">Ultra</button></div></div>
  <div class="exprow"><span>File name</span><input type="text" data-k="name" spellcheck="false" autocomplete="off"></div>
  <div class="exprow" data-show="dest"><span>Save as</span><div class="expseg" data-seg="dest"><button data-v="zip">One zip</button><button data-v="folder">Into a folder</button></div></div>
  <div class="exprow" data-show="hostdir"><span>Writes to</span><span class="expnote" data-out="hostdir"></span></div>
  <div class="exprow"><span>Light rig</span><div class="expseg" data-seg="rig"><button data-v="off">Gobo only</button><button data-v="on">Gobo + light rig</button></div></div>
  <div class="exprow" data-show="send"><span>Then</span><div class="expseg" data-seg="send"><button data-v="off">Just write the files</button><button data-v="on" data-out="sendlbl">Create the light</button></div></div>
  <p class="expnote" data-out="sum"></p>
  <div class="expgo"><button class="run" data-run>Export</button><button class="stop" data-stop hidden>Cancel</button><div class="expbar"><i></i></div></div>
  <div class="expstat" data-out="stat" aria-live="polite"></div>
  <div class="exprow expset"><span>Settings file</span><div class="expinl"><button data-saveset>Save settings…</button><button data-openset>Open settings…</button><input type="file" accept=".json,application/json" data-setfile hidden></div></div>
  <p class="expnote">A settings file holds everything that makes this gobo (pattern, levels, timeline, light, paint layers), so it can be opened again here, in another copy of the tool, or by a pipeline script. <a href="https://github.com/X14Halo/cucoloris/blob/main/docs/HOUDINI.md" target="_blank" rel="noopener">How the light rig plugs into Houdini (for TDs)</a></p>
</div>`;
  document.body.append(wrap);
  const q = s => wrap.querySelector(s);
  const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  const RES = [512, 1024, 2048, 4096].filter(r => r <= maxTex);
  q('[data-seg="res"]').innerHTML = RES.map(r => `<button data-v="${r}">${r >= 1024 ? r / 1024 + 'K' : r} · ${r}²</button>`).join('');
  if (!RES.includes(+S.exp.res)) S.exp.res = RES.includes(2048) ? 2048 : RES[RES.length - 1];

  function sync() {
    const e = S.exp, F = frames(), f = FMT[e.fmt];
    if (!f.depths.some(d => d[0] === e.depth)) e.depth = f.depths[0][0];
    const dsel = q('[data-k="depth"]');
    dsel.innerHTML = f.depths.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    dsel.value = e.depth;
    q('[data-k="fmt"]').value = e.fmt;
    for (const seg of wrap.querySelectorAll('[data-seg]')) for (const b of seg.children) b.setAttribute('aria-pressed', String(String(e[seg.dataset.seg]) === b.dataset.v));
    const from = q('[data-k="from"]'), to = q('[data-k="to"]');
    from.min = to.min = F.lo; if (F.shot) from.max = to.max = F.hi; else { from.removeAttribute('max'); to.removeAttribute('max'); }
    if (document.activeElement !== from) from.value = e.from; if (document.activeElement !== to) to.value = e.to;
    const fi = q('[data-k="first"]'); if (document.activeElement !== fi) fi.value = e.first;
    const nm = q('[data-k="name"]'); nm.placeholder = defaultName(); if (document.activeElement !== nm) nm.value = e.name;
    q('[data-show="range"]').hidden = e.range !== 'range';
    q('[data-show="first"]').hidden = F.shot;
    q('[data-show="enc"]').hidden = isFloat(e.depth);
    const fl = list(), hw = hostWrites(), rig = wantsRig(e), send = wantsSend(e);
    q('[data-show="dest"]').hidden = hw || !(canFolder && fl.length > 1);
    q('[data-show="hostdir"]').hidden = !hw;
    if (hw) q('[data-out="hostdir"]').textContent = exportDir() || '(the host decides)';
    q('[data-show="send"]').hidden = !HOST.sendLight;
    q('[data-out="sendlbl"]').textContent = `Create or update the light in ${HOST.label}`;
    q('[data-run]').textContent = send ? `Export & send to ${HOST.label}` : 'Export';
    q('[data-out="count"]').textContent = `${fl.length} frame${fl.length === 1 ? '' : 's'}` + (F.shot ? ` · shot ${F.lo}–${F.hi}` : ` · timeline 1–${F.hi}`);
    const nch = e.chans === 'y' ? 1 : 3, bytes = {'8':1, '16':2, half:2, float:4, '32':4}[e.depth];
    const mb = e.res * e.res * nch * bytes / 1048576;
    const first = fname(F.num(fl[0])), lastN = fname(F.num(fl[fl.length - 1]));
    let where;
    if (hw) where = `written by ${HOST.label}`;
    else if (fl.length > 1 && e.dest === 'folder' && canFolder) where = 'written straight into a folder you pick';
    else if (fl.length > 1 || rig || (DIRECT && !DIRECT.includes(f.ext))) where = inClaude && fl.length === 1 && !rig ? 'in a zip (this page can only hand over PNG, JPEG and zip files directly)' : 'in one zip';
    else where = 'as a single download';
    const rn = rigNames();
    const rigNote = rig ? ` Next to the frames: <b>${rn.usd}</b> (the light, in ${shotActive() ? "the shot's own units and up axis" : 'the stand-in set, metres, Y up'}, with the gobo attached) and <b>${rn.settings}</b> (every setting).` + (send ? ` Then ${HOST.label} builds or updates the light from them.` : '') : '';
    const notes = {
      exr: 'Scanline OpenEXR, ZIP compressed, linear values.',
      ptx: `One quad face (face 0) with mipmaps down to 4×4, v = 0 at the bottom of the image${MODES[S.mode].tileable && !(S.p[S.mode].framing > 0) ? ', periodic borders so the tile wraps' : ''}. Put it on a single-face card, or read face 0 in your light filter.`,
      tif: 'Deflate-compressed TIFF.',
      png: '', jpg: 'JPEG is lossy: handy for previews and reviews, not for lighting.',
    };
    const encNote = isFloat(e.depth) ? 'Float values are linear transmission, exactly as rendered.' : e.enc === 'srgb' ? 'sRGB-encoded: a renderer that reads this as sRGB gets back the exact linear transmission the preview shows.' : 'Linear values written straight into the integer file: tell your renderer the texture is raw / linear.';
    q('[data-out="sum"]').innerHTML = `<b>${first}</b>${fl.length > 1 ? ` … <b>${lastN}</b>` : ''}, ${where}. About ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB a frame before compression. ${notes[e.fmt]} ${encNote}${rigNote}`;
    q('[data-run]').disabled = st.busy;
  }
  function open() {
    const F = frames(), e = S.exp;
    if (!(e.from >= F.lo) || (F.shot && e.from > F.hi)) e.from = F.lo;
    if (!(e.to >= e.from) || (F.shot && e.to > F.hi)) e.to = F.hi;
    q('[data-out="stat"]').textContent = ''; q('[data-out="stat"]').className = 'expstat'; q('.expbar i').style.width = '0';
    wrap.hidden = false; sync();
    q('[data-run]').focus();
  }
  const close = () => { if (!st.busy) wrap.hidden = true; };
  wrap.addEventListener('click', ev => {
    if (ev.target === wrap || ev.target.closest('[data-x]')) return close();
    const b = ev.target.closest('[data-seg] > button');
    if (b) { const k = b.parentElement.dataset.seg; S.exp[k] = k === 'res' ? +b.dataset.v : b.dataset.v; save(); sync(); }
  });
  wrap.addEventListener('input', ev => {
    const k = ev.target.dataset.k; if (!k) return;
    S.exp[k] = ev.target.type === 'number' ? (ev.target.value === '' ? '' : +ev.target.value) : ev.target.value;
    save(); sync();
  });
  // keys typed in the dialog stay in the dialog (Space would otherwise play the timeline, W and E pick gizmo tools)
  wrap.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') close(); });
  document.addEventListener('keydown', ev => { if (!wrap.hidden && ev.key === 'Escape') close(); });
  q('[data-stop]').onclick = () => { st.cancel = true; q('[data-out="stat"]').textContent = 'Stopping after this frame…'; };
  q('[data-run]').onclick = async () => {
    const stat = q('[data-out="stat"]'), bar = q('.expbar i');
    stat.className = 'expstat';
    q('[data-run]').disabled = true; q('[data-stop]').hidden = false;
    try {
      const r = await run((i, n, f, ms) => {
        bar.style.width = `${(i / n * 100).toFixed(1)}%`;
        if (f !== null) stat.textContent = `Rendering ${fname(frames().num(f))} · ${i + 1} of ${n}` + (i > 0 ? ` · ${(ms / i / 1000).toFixed(1)} s a frame` : '');
      });
      if (r && !r.cancelled) stat.textContent = `Done: ${r.written} frame${r.written === 1 ? '' : 's'} in ${(r.ms / 1000).toFixed(1)} s` + (r.folder ? ` into “${r.folder}”` : r.dir ? ` into ${r.dir}` : '') + (r.rig ? ', with the light rig' : '') + (r.sent ? `; the light is set up in ${HOST.label}` : '') + '.';
      else if (r) stat.textContent = `Stopped after ${r.written} of ${r.total} frames` + (r.written ? '; the finished frames were saved.' : '.');
    } catch (err) {
      console.error(err);
      stat.className = 'expstat err'; stat.textContent = String(err && err.message || err);
    } finally {
      q('[data-run]').disabled = false; q('[data-stop]').hidden = true; sync();
    }
  };
  // settings files: save this gobo's settings, or open a saved one
  q('[data-saveset]').onclick = async () => {
    const stat = q('[data-out="stat"]'); stat.className = 'expstat';
    try {
      const name = rigNames().settings, blob = new Blob([JSON.stringify(settingsFile(), null, 1)], {type:'application/json'});
      if (hostWrites()) { const p = await HOST.writeFile(joinPath(exportDir(), name), blob); stat.textContent = `Saved ${p || name}.`; }
      else { await deliver(name, blob); stat.textContent = `Saved ${name}.`; }
    } catch (err) { stat.className = 'expstat err'; stat.textContent = String(err && err.message || err); }
  };
  q('[data-openset]').onclick = () => q('[data-setfile]').click();
  q('[data-setfile]').onchange = async ev => {
    const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!file) return;
    const stat = q('[data-out="stat"]'); stat.className = 'expstat';
    try { await applySettings(await file.text()); stat.textContent = `Opened ${file.name}.`; sync(); }
    catch (err) { stat.className = 'expstat err'; stat.textContent = String(err && err.message || err); }
  };
  const btn = document.createElement('button');
  btn.className = 'expbtn'; btn.id = 'exportBtn'; btn.textContent = 'Export…';
  btn.title = 'Write the final gobo as an image or an image sequence';
  btn.onclick = open;
  const vb = document.querySelector('.viewbar'); if (vb) vb.append(btn);

  return {get busy() { return st.busy; }, run, open, writePNG, writeTIF, writeEXR, writePTX, writeJPG, Zip, grab, encode, list, frames, fname, rigNames, FMT, DEF};
})();
