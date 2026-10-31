/* =====================================================================
   OpenEXR reader (scanline images, single- or multi-part; uncompressed,
   RLE, ZIPS and ZIP compression). Only the layers that are asked for
   are decoded, and rows can be skipped for a quick low-res read.
   ===================================================================== */
const EXR = (() => {
  const LINES = [1, 1, 1, 16, 32, 16, 32, 32, 32, 256];
  const CNAMES = ['none', 'RLE', 'ZIPS', 'ZIP', 'PIZ', 'PXR24', 'B44', 'B44A', 'DWAA', 'DWAB'];
  let half = null;
  function halfTable() {
    if (half) return half;
    half = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
      const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
      half[h] = e === 0 ? s * m * Math.pow(2, -24) : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * Math.pow(2, e - 15);
    }
    return half;
  }
  function readHeader(dv, p, u8) {
    const at = {};
    const str = () => { let e = p; while (u8[e]) e++; const s = new TextDecoder().decode(u8.subarray(p, e)); p = e + 1; return s; };
    for (;;) {
      const name = str(); if (!name) break;
      const type = str(), size = dv.getInt32(p, true); p += 4;
      const v = p;
      if (type === 'chlist') {
        const ch = []; let q = v;
        while (u8[q]) { let e = q; while (u8[e]) e++; const n = new TextDecoder().decode(u8.subarray(q, e)); q = e + 1; ch.push({name:n, type:dv.getInt32(q, true), xs:dv.getInt32(q + 8, true), ys:dv.getInt32(q + 12, true)}); q += 16; }
        at[name] = ch;
      } else if (type === 'compression') at[name] = u8[v];
      else if (type === 'box2i') at[name] = [0, 1, 2, 3].map(i => dv.getInt32(v + i * 4, true));
      else if (type === 'int') at[name] = dv.getInt32(v, true);
      else if (type === 'float') at[name] = dv.getFloat32(v, true);
      else if (type === 'string') at[name] = new TextDecoder().decode(u8.subarray(v, v + size));
      else if (type === 'm44f') { const m = []; for (let i = 0; i < 16; i++) m.push(dv.getFloat32(v + i * 4, true)); at[name] = m; }
      else if (type === 'v2f') at[name] = [dv.getFloat32(v, true), dv.getFloat32(v + 4, true)];
      p = v + size;
    }
    return {at, p};
  }
  // parse headers and chunk offsets; nothing is decompressed yet
  function open(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (dv.getUint32(0, true) !== 20000630) throw new Error('Not an OpenEXR file.');
    const ver = dv.getUint32(4, true);
    if (ver & 0x200) throw new Error('Tiled EXRs are not supported yet. Please write scanline EXRs.');
    if (ver & 0x800) throw new Error('Deep EXRs are not supported.');
    const multi = !!(ver & 0x1000);
    let p = 8; const parts = [];
    for (;;) {
      const h = readHeader(dv, p, u8); p = h.p; parts.push(h.at);
      if (!multi || u8[p] === 0) { if (multi) p++; break; }
    }
    for (const at of parts) {
      const dw = at.dataWindow, h = dw[3] - dw[1] + 1;
      const lpc = LINES[at.compression] || 1;
      const n = at.chunkCount || Math.ceil(h / lpc);
      const offs = new Array(n);
      for (let i = 0; i < n; i++) { offs[i] = Number(dv.getBigUint64(p, true)); p += 8; }
      at._offs = offs; at._lpc = lpc;
    }
    return {buf, dv, u8, multi, parts};
  }
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate');
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }
  function unRle(src, n) {
    const out = new Uint8Array(n); let i = 0, o = 0;
    while (i < src.length && o < n) {
      const c = (src[i] << 24) >> 24; i++;
      if (c < 0) { for (let k = 0; k < -c; k++) out[o++] = src[i++]; }
      else { const b = src[i++]; for (let k = 0; k <= c; k++) out[o++] = b; }
    }
    return out;
  }
  // ZIP/RLE store a byte predictor and split even/odd bytes; undo both
  function unPredict(t) {
    for (let i = 1; i < t.length; i++) t[i] = (t[i - 1] + t[i] - 128) & 255;
    const out = new Uint8Array(t.length), h = (t.length + 1) >> 1;
    for (let i = 0, a = 0, b = h; i < t.length; i += 2) { out[i] = t[a++]; if (i + 1 < t.length) out[i + 1] = t[b++]; }
    return out;
  }
  // list layers as {name, comps:[channel names], part}
  function layers(f) {
    const L = [];
    f.parts.forEach((at, pi) => {
      const groups = {};
      for (const c of at.channels) {
        const k = c.name.lastIndexOf('.');
        const layer = k < 0 ? '' : c.name.slice(0, k), comp = k < 0 ? c.name : c.name.slice(k + 1);
        (groups[layer] = groups[layer] || []).push({comp, full:c.name});
      }
      for (const [name, cs] of Object.entries(groups)) L.push({name:name || (at.name && at.name !== 'subimage00' ? at.name : 'rgba'), raw:name, comps:cs, part:pi});
    });
    return L;
  }
  /* Decode the given channels of one part. step > 1 reads every step-th row and column only. */
  async function read(f, partIndex, chanNames, step = 1, onProgress) {
    const at = f.parts[partIndex], dw = at.dataWindow;
    const W = dw[2] - dw[0] + 1, H = dw[3] - dw[1] + 1;
    const comp = at.compression;
    if (![0, 1, 2, 3].includes(comp)) throw new Error(`This EXR uses ${CNAMES[comp] || 'unknown'} compression. Please write the utility passes with ZIP, ZIPS, RLE or no compression.`);
    const chans = at.channels, bpp = chans.map(c => c.type === 1 ? 2 : 4);
    const lineBytes = chans.reduce((s, c, i) => s + W * bpp[i], 0);
    const want = chanNames.map(n => chans.findIndex(c => c.name === n));
    const w2 = Math.ceil(W / step), h2 = Math.ceil(H / step);
    const out = want.map(() => new Float32Array(w2 * h2));
    const ht = halfTable();
    const lpc = at._lpc, dv = f.dv, u8 = f.u8;
    const jobs = [];
    for (let ci = 0; ci < at._offs.length; ci++) {
      const y0 = ci * lpc;
      // skip chunks with no wanted rows
      let need = false; for (let y = y0; y < Math.min(y0 + lpc, H); y++) if (y % step === 0) { need = true; break; }
      if (need) jobs.push(ci);
    }
    let done = 0;
    const doChunk = async ci => {
      let p = at._offs[ci];
      if (f.multi) p += 4;
      const yStart = dv.getInt32(p, true) - dw[1]; p += 4;
      const size = dv.getInt32(p, true); p += 4;
      const rows = Math.min(lpc, H - yStart);
      const rawSize = rows * lineBytes;
      let data = u8.subarray(p, p + size);
      if (size < rawSize) {
        if (comp === 2 || comp === 3) data = unPredict(await inflate(data));
        else if (comp === 1) data = unPredict(unRle(data, rawSize));
      }
      const ddv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let q = 0;
      for (let r = 0; r < rows; r++) {
        const y = yStart + r;
        for (let c = 0; c < chans.length; c++) {
          const k = want.indexOf(c);
          if (k >= 0 && y % step === 0) {
            const o = out[k], row = (y / step) * w2;
            if (bpp[c] === 2) for (let x = 0, j = 0; x < W; x += step, j++) o[row + j] = ht[ddv.getUint16(q + x * 2, true)];
            else if (chans[c].type === 2) for (let x = 0, j = 0; x < W; x += step, j++) o[row + j] = ddv.getFloat32(q + x * 4, true);
            else for (let x = 0, j = 0; x < W; x += step, j++) o[row + j] = ddv.getUint32(q + x * 4, true);
          }
          q += W * bpp[c];
        }
      }
      if (onProgress && (++done % 64 === 0)) onProgress(done / jobs.length);
    };
    for (let i = 0; i < jobs.length; i += 48) await Promise.all(jobs.slice(i, i + 48).map(doChunk));
    return {W:w2, H:h2, data:out, fullW:W, fullH:H};
  }
  return {open, layers, read, CNAMES};
})();
