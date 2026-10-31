/* =====================================================================
   TREES
   Real trees are grown in 3D: broadleaves by space colonization inside
   a species crown envelope, pines as whorled tiers, palms as fronds with
   pinnate leaflets. Leaves carry the area of the species' real leaves.
   Wind drives each trunk, branch and twig group as a damped oscillator
   with measured natural frequencies; leaves flutter about the petiole.
   ===================================================================== */
const TR = {sig:'', windSig:'', data:null, leafVAO:null, segVAO:null, flutBuf:null, dispTex:null, dispData:null, nLeaves:0, nSegs:0};

function newBuilder() {
  return {x:[], y:[], z:[], par:[], trunk:[], rad:[], tree:[], leaves:[], treeH:[], treeInfo:[]};
}
function addNode(B, x, y, z, par, trunk, tree, rad = 0) {
  B.x.push(x); B.y.push(y); B.z.push(z); B.par.push(par); B.trunk.push(trunk ? 1 : 0); B.tree.push(tree); B.rad.push(rad);
  return B.x.length - 1;
}
function addLeaf(B, px, py, pz, ax, ay, az, nx, ny, nz, len, wid, node, shape) {
  B.leaves.push(px, py, pz, shape, ax, ay, az, len, nx, ny, nz, wid, node);
}
function orthoAxis(nx, ny, nz, vx, vy, vz) {
  const d = vx * nx + vy * ny + vz * nz;
  let ax = vx - nx * d, ay = vy - ny * d, az = vz - nz * d;
  const l = Math.hypot(ax, ay, az) || 1;
  return [ax / l, ay / l, az / l];
}
function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

function growSC(sp, r, B, tree, bx, by, H, R, P) {
  const zb = H * Math.min(sp.base * (P.crownBase ?? 1), 0.8), zt = H;
  const lobes = [];
  for (let i = 0; i < 6; i++) lobes.push([r() * Math.PI * 2, (r() - 0.5) * 0.8, 0.12 + 0.2 * r()]);
  const env = u => sp.env === 'dome' ? Math.sqrt(Math.max(0, 1 - ((u - 0.42) / 0.62) ** 2))
                 : sp.env === 'ovoid' ? Math.sqrt(Math.max(0, 1 - ((u - 0.45) / 0.56) ** 2))
                 : Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(u, 1))), 0.85) * (1 - 0.25 * u);
  const nAtt = Math.round(sp.attract * 1.9 * clamp(R * R / (sp.R * sp.R), 0.04, 2));
  const AX = [], AY = [], AZ = [];
  for (let tries = 0; AX.length < nAtt && tries < nAtt * 40; tries++) {
    const x = (r() * 2 - 1) * R * 1.3, y = (r() * 2 - 1) * R * 1.3, u = r();
    const a = Math.atan2(y, x);
    let f = env(u);
    for (const [la, lu, ls] of lobes) f *= 1 + ls * Math.cos(a - la) * Math.exp(-((u - 0.5 - lu) ** 2) / 0.08);
    if (Math.hypot(x, y) <= R * f) { AX.push(x); AY.push(y); AZ.push(zb + u * (zt - zb)); }
  }
  // local node arrays (relative to trunk base)
  const nx = [], ny = [], nz = [], np = [], nt = [];
  const lean = [(r() - 0.5) * 0.08, (r() - 0.5) * 0.08];
  nx.push(0); ny.push(0); nz.push(0); np.push(-1); nt.push(1);
  for (let z = 0; z < zb - 1e-6;) {
    z = Math.min(zb, z + sp.seg * 1.6);
    nx.push(lean[0] * z + (r() - 0.5) * 0.03); ny.push(lean[1] * z + (r() - 0.5) * 0.03); nz.push(z); np.push(nx.length - 2); nt.push(1);
  }
  const infl = sp.infl, kill = sp.kill * 0.8, seg = sp.seg * 0.85, inv = 1 / infl;
  const gx0 = -1.4 * R, gy0 = -1.4 * R;
  const GW = Math.ceil(2.8 * R * inv) + 2, GH = Math.ceil((H + 2) * inv) + 2;
  const cellOf = (x, y, z) => {
    const cx = clamp(Math.floor((x - gx0) * inv), 0, GW - 1), cy = clamp(Math.floor((y - gy0) * inv), 0, GW - 1), cz = clamp(Math.floor(z * inv), 0, GH - 1);
    return [cx, cy, cz];
  };
  const ngrid = new Array(GW * GW * GH);
  const agrid = new Array(GW * GW * GH);
  const put = (grid, i, x, y, z) => { const [cx, cy, cz] = cellOf(x, y, z); const k = (cz * GW + cy) * GW + cx; (grid[k] || (grid[k] = [])).push(i); };
  for (let i = 0; i < nx.length; i++) put(ngrid, i, nx[i], ny[i], nz[i]);
  for (let i = 0; i < AX.length; i++) put(agrid, i, AX[i], AY[i], AZ[i]);
  const alive = new Uint8Array(AX.length).fill(1);
  let nAlive = AX.length;
  const accX = [], accY = [], accZ = [], kids = [];
  const MAXN = 7000;
  for (let it = 0; it < 220 && nAlive > 0 && nx.length < MAXN; it++) {
    const touched = [];
    for (let ai = 0; ai < AX.length; ai++) {
      if (!alive[ai]) continue;
      const x = AX[ai], y = AY[ai], z = AZ[ai];
      const [cx, cy, cz] = cellOf(x, y, z);
      let best = -1, bd = infl * infl;
      for (let dz = -1; dz <= 1; dz++) { const zz = cz + dz; if (zz < 0 || zz >= GH) continue;
        for (let dy = -1; dy <= 1; dy++) { const yy = cy + dy; if (yy < 0 || yy >= GW) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = cx + dx; if (xx < 0 || xx >= GW) continue;
            const cell = ngrid[(zz * GW + yy) * GW + xx]; if (!cell) continue;
            for (const i of cell) { const d2 = (nx[i] - x) ** 2 + (ny[i] - y) ** 2 + (nz[i] - z) ** 2; if (d2 < bd) { bd = d2; best = i; } }
          } } }
      if (best >= 0) {
        const d = Math.sqrt(bd) || 1;
        if (accX[best] === undefined) { accX[best] = 0; accY[best] = 0; accZ[best] = 0; touched.push(best); }
        accX[best] += (x - nx[best]) / d; accY[best] += (y - ny[best]) / d; accZ[best] += (z - nz[best]) / d;
      }
    }
    if (!touched.length) {
      // nothing in reach: extend the leader upward toward the crown
      const top = nx.length - 1;
      if (it < 20) { nx.push(nx[top]); ny.push(ny[top]); nz.push(nz[top] + seg); np.push(top); nt.push(1); put(ngrid, nx.length - 1, nx[top], ny[top], nz[top] + seg); continue; }
      break;
    }
    const born = [];
    for (const i of touched) {
      let dx = accX[i], dy = accY[i], dz = accZ[i];
      const l0 = Math.hypot(dx, dy, dz);
      dz += sp.trop * l0;
      dx += (r() - 0.5) * 0.25 * l0; dy += (r() - 0.5) * 0.25 * l0;
      const l = Math.hypot(dx, dy, dz);
      accX[i] = undefined;
      if (l < 1e-6) continue;
      const x = nx[i] + seg * dx / l, y = ny[i] + seg * dy / l, z = Math.max(0.3, nz[i] + seg * dz / l);
      if ((kids[i] || 0) >= 3) continue;
      let crowded = false;
      { const [cx, cy, cz] = cellOf(x, y, z);
        for (let ddz = -1; ddz <= 1 && !crowded; ddz++) for (let ddy = -1; ddy <= 1 && !crowded; ddy++) for (let ddx = -1; ddx <= 1 && !crowded; ddx++) {
          const zz = cz + ddz, yy = cy + ddy, xx = cx + ddx; if (zz < 0 || zz >= GH || yy < 0 || yy >= GW || xx < 0 || xx >= GW) continue;
          const cell = ngrid[(zz * GW + yy) * GW + xx]; if (!cell) continue;
          for (const q of cell) if (q !== i && (nx[q] - x) ** 2 + (ny[q] - y) ** 2 + (nz[q] - z) ** 2 < (seg * 0.55) ** 2) { crowded = true; break; }
        } }
      if (crowded) continue;
      kids[i] = (kids[i] || 0) + 1;
      nx.push(x); ny.push(y); nz.push(z); np.push(i); nt.push(0);
      const j = nx.length - 1; put(ngrid, j, x, y, z); born.push(j);
    }
    for (const j of born) {
      const [cx, cy, cz] = cellOf(nx[j], ny[j], nz[j]);
      for (let dz = -1; dz <= 1; dz++) { const zz = cz + dz; if (zz < 0 || zz >= GH) continue;
        for (let dy = -1; dy <= 1; dy++) { const yy = cy + dy; if (yy < 0 || yy >= GW) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = cx + dx; if (xx < 0 || xx >= GW) continue;
            const cell = agrid[(zz * GW + yy) * GW + xx]; if (!cell) continue;
            for (const ai of cell) if (alive[ai] && (AX[ai] - nx[j]) ** 2 + (AY[ai] - ny[j]) ** 2 + (AZ[ai] - nz[j]) ** 2 < kill * kill) { alive[ai] = 0; nAlive--; }
          } } }
    }
  }
  const n = nx.length;
  // topology
  const nch = new Int32Array(n), sz = new Float64Array(n).fill(1), tip = new Float64Array(n).fill(1e9), rad = new Float64Array(n);
  for (let i = n - 1; i > 0; i--) { const p = np[i]; nch[p]++; sz[p] += sz[i]; }
  for (let i = n - 1; i >= 0; i--) { if (!nch[i]) tip[i] = 0; if (i > 0) tip[np[i]] = Math.min(tip[np[i]], tip[i] + 1); }
  const rTip = 0.004;
  const acc25 = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { rad[i] = nch[i] ? Math.pow(acc25[i], 0.4) : rTip; if (i > 0) acc25[np[i]] += Math.pow(rad[i], 2.5); }
  const rs = H * 0.016 / Math.max(rad[0], 1e-4);
  for (let i = 0; i < n; i++) rad[i] = Math.max(0.002, rad[i] * Math.min(rs, 1.6));
  // leader continues while it dominates
  const mainChild = new Int32Array(n).fill(-1), bestSz = new Float64Array(n);
  for (let i = 1; i < n; i++) { const p = np[i]; if (sz[i] > bestSz[p]) { bestSz[p] = sz[i]; mainChild[p] = i; } }
  let cur = 0; while (mainChild[cur] >= 0 && nt[mainChild[cur]]) cur = mainChild[cur];
  while (mainChild[cur] >= 0 && sz[mainChild[cur]] > 0.55 * sz[cur]) { cur = mainChild[cur]; nt[cur] = 1; }
  // pendulous twigs (birch)
  const droop = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    droop[i] = droop[np[i]];
    if (!nt[i] && tip[i] <= 5) droop[i] += sp.droop * seg * 0.5 * (1 + (5 - tip[i]) * 0.25);
  }
  const base = B.x.length;
  for (let i = 0; i < n; i++) addNode(B, bx + nx[i], by + ny[i], Math.max(0.05, nz[i] - droop[i]), i ? base + np[i] : -1, nt[i], tree, rad[i]);
  // leaves: real leaf area index over the crown footprint
  const len = sp.len * P.leafScale, wid = sp.wid * P.leafScale;
  const target = sp.lai * P.leafDensity * Math.PI * R * R / (0.62 * len * wid);
  const elig = [];
  let wsum = 0;
  // Light competition: leaves grow where light reaches. Count shoots stacked above each shoot
  // (a column through a 0.5 m voxel grid) and weight leaf growth by Beer–Lambert exposure,
  // which gives the leafy outer shell and bare interior of real crowns.
  const vs = 0.5, vx0 = -1.4 * R, VW = Math.ceil(2.8 * R / vs) + 1, VH = Math.ceil((H + 2) / vs) + 1;
  const vox = new Float32Array(VW * VW * VH);
  const vidx = i => { const ix = clamp(Math.floor((nx[i] - vx0) / vs), 0, VW - 1), iy = clamp(Math.floor((ny[i] - vx0) / vs), 0, VW - 1), iz = clamp(Math.floor(nz[i] / vs), 0, VH - 1); return [ix, iy, iz]; };
  for (let i = 1; i < n; i++) if (!nt[i] && tip[i] <= 4) { const [ix, iy, iz] = vidx(i); vox[(iz * VW + iy) * VW + ix] += 1; }
  const over = new Float32Array(VW * VW * VH);
  for (let iy = 0; iy < VW; iy++) for (let ix = 0; ix < VW; ix++) { let acc = 0; for (let iz = VH - 1; iz >= 0; iz--) { const k = (iz * VW + iy) * VW + ix; over[k] = acc; acc += vox[k]; } }
  const obs = [];
  for (let i = 1; i < n; i++) if (!nt[i] && tip[i] <= 4) { const [ix, iy, iz] = vidx(i); obs.push(over[(iz * VW + iy) * VW + ix]); }
  const obSorted = obs.slice().sort((x, y) => x - y);
  const ob0 = Math.max(obSorted[Math.floor(obSorted.length * 0.5)] || 1, 1) * 0.6;
  for (let i = 1, q = 0; i < n; i++) if (!nt[i] && tip[i] <= 4) {
    const [ix, iy, iz] = vidx(i);
    const w = Math.exp(-over[(iz * VW + iy) * VW + ix] / ob0) / (1 + 0.4 * tip[i]);
    elig.push([i, w]); wsum += w; q++;
  }
  const cand = [];
  // leafy twigs: each shoot node sprouts a spray of short twigs; leaves sit alternately along them
  for (const [i, w] of elig) {
    const cnt = 1.8 * target * w / wsum;
    let k = Math.floor(cnt) + (r() < cnt % 1 ? 1 : 0);
    if (!k) continue;
    const gi = base + i, gp = base + np[i];
    const [dx, dy, dz] = norm3(B.x[gi] - B.x[gp], B.y[gi] - B.y[gp], B.z[gi] - B.z[gp]);
    const nTw = clamp(Math.round(k / 4), 1, 12);
    for (let tw = 0; tw < nTw; tw++) {
      const s0 = 0.3 + 0.7 * r();
      const sx = B.x[gp] + (B.x[gi] - B.x[gp]) * s0, sy = B.y[gp] + (B.y[gi] - B.y[gp]) * s0, sz = B.z[gp] + (B.z[gi] - B.z[gp]) * s0;
      let [tx, ty, tz] = norm3(dx * 0.6 + gauss(r) * 1.0, dy * 0.6 + gauss(r) * 1.0, dz * 0.4 + 0.1 + gauss(r) * 0.45 - sp.droop * 0.8);
      const lt = sp.cluster * (1.0 + 1.0 * r());
      const ex = sx + tx * lt, ey = sy + ty * lt, ez = sz + tz * lt;
      const twig = addNode(B, ex, ey, Math.max(0.1, ez), gi, 0, tree, 0.0015);
      const nl = Math.round(k / (nTw - tw)); k -= nl;
      // a horizontal side vector for alternate leaves
      let [qx, qy, qz] = norm3(-ty, tx, 0.0001);
      for (let j = 0; j < nl; j++) {
        const u = 0.15 + 0.85 * (j + 0.5) / nl;
        const sd = (j % 2 ? 1 : -1) * (0.6 + 0.4 * r());
        const pet = len * 0.25;
        const px = sx + tx * lt * u + qx * sd * pet + gauss(r) * 0.01, py = sy + ty * lt * u + qy * sd * pet + gauss(r) * 0.01, pz = sz + tz * lt * u + gauss(r) * 0.015;
        const [lnx, lny, lnz] = norm3(gauss(r) * sp.tilt * 0.55, gauss(r) * sp.tilt * 0.55, 1);
        const [ax, ay, az] = orthoAxis(lnx, lny, lnz, qx * sd + tx * 0.6 + gauss(r) * 0.3, qy * sd + ty * 0.6 + gauss(r) * 0.3, tz * 0.6 - 0.3 * sp.droop);
        const sc = 0.8 + 0.4 * r();
        cand.push([px, py, Math.max(0.1, pz), ax, ay, az, lnx, lny, lnz, len * sc, wid * sc, twig]);
      }
    }
  }
  // accept candidates in random order under a leaf-area-density cap
  const vsz = 0.3, cap = Math.max(1, Math.floor(6.0 * vsz ** 3 / (0.62 * len * wid)));
  const occ = new Map();
  for (let k = cand.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); const tmp = cand[k]; cand[k] = cand[m]; cand[m] = tmp; }
  let placed = 0;
  for (const c of cand) {
    if (placed >= target) break;
    const key = Math.floor(c[0] / vsz) * 73856093 ^ Math.floor(c[1] / vsz) * 19349663 ^ Math.floor(c[2] / vsz) * 83492791;
    const o = occ.get(key) || 0;
    if (o >= cap) continue;
    occ.set(key, o + 1); placed++;
    addLeaf(B, c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], sp.shape);
  }
}

function growPine(sp, r, B, tree, bx, by, H, R, P) {
  const zb = H * Math.min(0.42 * (P.crownBase ?? 1), 0.8);
  const lean = [(r() - 0.5) * 0.05, (r() - 0.5) * 0.05];
  const trunkR = z => 0.02 + H * 0.014 * (1 - z / H);
  let prev = addNode(B, bx, by, 0, -1, 1, tree, trunkR(0));
  const whorlNodes = [];
  for (let z = 0.45; z <= H; z += 0.45) {
    prev = addNode(B, bx + lean[0] * z, by + lean[1] * z, z, prev, 1, tree, trunkR(z));
    if (z >= zb && z <= H - 0.3) whorlNodes.push(prev);
  }
  const len = sp.len * P.leafScale, wid = sp.wid * P.leafScale;
  const dens = P.leafDensity;
  const shoot = (node, dx, dy, dz) => {
    const n = Math.floor(2 * dens) + (r() < (2 * dens) % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const [ax, ay, az] = norm3(dx + gauss(r) * 0.35, dy + gauss(r) * 0.35, dz + 0.15 + gauss(r) * 0.25);
      const [lnx, lny, lnz] = norm3(gauss(r) * 0.5, gauss(r) * 0.5, 1);
      const [aax, aay, aaz] = orthoAxis(lnx, lny, lnz, ax, ay, az);
      addLeaf(B, B.x[node] + gauss(r) * 0.05, B.y[node] + gauss(r) * 0.05, B.z[node] + gauss(r) * 0.04, aax, aay, aaz, lnx, lny, lnz, len * (0.8 + 0.4 * r()), wid, node, sp.shape);
    }
  };
  for (const tn of whorlNodes) {
    const z = B.z[tn], u = (z - zb) / (H - zb);
    const nb = 4 + Math.floor(r() * 3), ph = r() * Math.PI * 2;
    const L = (R * Math.pow(1 - u, 0.9) + 0.3) * (0.8 + 0.4 * r());
    for (let b = 0; b < nb; b++) {
      const az = ph + b * 2 * Math.PI / nb + (r() - 0.5) * 0.5;
      const el0 = 0.12 - 0.42 * (1 - u) + (r() - 0.5) * 0.2;
      let p = tn, x = B.x[tn], y = B.y[tn], zz = z;
      for (let s = 0.3; s <= L; s += 0.3) {
        const el = el0 + 0.35 * (s / L) ** 2;
        const dx = Math.cos(az) * Math.cos(el), dy = Math.sin(az) * Math.cos(el), dz = Math.sin(el);
        x += dx * 0.3; y += dy * 0.3; zz += dz * 0.3;
        p = addNode(B, x, y, zz, p, 0, tree, 0.05 * (1 - s / L) + 0.008);
        if (s > 0.3 * L) {
          shoot(p, dx, dy, dz);
          if (((s / 0.3) | 0) % 2 === 0) for (const sgn of [-1, 1]) {
            const sa = az + sgn * 1.0;
            let q = p, qx = x, qy = y, qz = zz;
            for (let k = 0; k < 2; k++) {
              const sx = Math.cos(sa), sy = Math.sin(sa);
              qx += sx * 0.22; qy += sy * 0.22; qz += 0.03;
              q = addNode(B, qx, qy, qz, q, 0, tree, 0.008);
              shoot(q, sx, sy, 0.1);
            }
          }
        }
      }
    }
  }
}

function growPalm(sp, r, B, tree, bx, by, H, R, P) {
  const la = r() * Math.PI * 2, lamt = 0.4 + r() * 1.3;
  let prev = addNode(B, bx, by, 0, -1, 1, tree, 0.2);
  for (let z = 0.5; z <= H; z += 0.5) {
    const f = (z / H) ** 2;
    prev = addNode(B, bx + Math.cos(la) * lamt * f, by + Math.sin(la) * lamt * f, z, prev, 1, tree, 0.17);
  }
  const top = prev, tx = B.x[top], ty = B.y[top], tz = B.z[top];
  const nF = 18 + Math.floor(r() * 7);
  const len = sp.len * P.leafScale, wid = sp.wid * P.leafScale;
  const step = 0.055 / Math.sqrt(P.leafDensity);
  for (let f = 0; f < nF; f++) {
    const age = f / nF;
    const az = f * 2.39996 + (r() - 0.5) * 0.3;
    const el0 = (62 - 88 * age) * DEG;
    const Lr = R * (0.75 + 0.35 * r()) * (age < 0.12 ? 0.6 + 3 * age : 1);
    const dk = (0.05 + 0.16 * age) * 4 / Lr;
    const hx = Math.cos(az), hy = Math.sin(az);
    const pos = s => [tx + hx * s * Math.cos(el0), ty + hy * s * Math.cos(el0), tz + s * Math.sin(el0) - dk * s * s];
    const nodes = [];
    let p = top;
    for (let s = 0.3; s <= Lr + 1e-6; s += 0.3) { const q = pos(s); p = addNode(B, q[0], q[1], q[2], p, 0, tree, 0.035 * (1 - s / Lr) + 0.008); nodes.push(p); }
    for (let s = 0.18 * Lr; s <= Lr; s += step) {
      const a = pos(s), b = pos(s + 0.01);
      const [t0, t1, t2] = norm3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const node = nodes[clamp(Math.round(s / 0.3) - 1, 0, nodes.length - 1)];
      const sl = len * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, (s / Lr) * 0.95 + 0.05)));
      for (const sd of [-1, 1]) {
        const [lx, ly, lz] = norm3(t1 * 1 - t2 * 0, -t0, 0);
        const [ax, ay, az2] = norm3(t0 * 0.45 + lx * sd * 0.8, t1 * 0.45 + ly * sd * 0.8, t2 * 0.45 - (0.3 + 0.4 * s / Lr) + gauss(r) * 0.08);
        let [nx2, ny2, nz2] = norm3(ay * t2 - az2 * t1, az2 * t0 - ax * t2, ax * t1 - ay * t0);
        if (nz2 < 0) { nx2 = -nx2; ny2 = -ny2; nz2 = -nz2; }
        const [aax, aay, aaz] = orthoAxis(nx2, ny2, nz2, ax, ay, az2);
        addLeaf(B, a[0], a[1], a[2], aax, aay, aaz, nx2, ny2, nz2, sl, wid, node, sp.shape);
      }
    }
  }
}


/* Periodic value noise on an integer lattice (tiles exactly) */
function pnoise(r, px, py) {
  const g = new Float32Array(px * py); for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * px, y = (((v % 1) + 1) % 1) * py;
    const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), i1 = (i0 + 1) % px, j1 = (j0 + 1) % py;
    const a = g[j0 * px + i0], b = g[j0 * px + i1], c = g[j1 * px + i0], d = g[j1 * px + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
/* A seamless patch of canopy: branches enter from trunks outside the tile and grow by space
   colonization through a periodic slab of crown, so the tile can be smaller than one tree. */
function growPatch(sp, r, B, P, Lx, Ly, H) {
  const zt = H, zb = Math.max(0.3, zt - P.canopyDepth);
  const seg = sp.seg * 0.85, infl = sp.infl, kill = sp.kill * 0.8;
  const wx = d => d - Lx * Math.round(d / Lx), wy = d => d - Ly * Math.round(d / Ly);
  const md = (a, L) => ((a % L) + L) % L;
  const n1 = pnoise(r, Math.max(1, Math.round(Lx / 1.6)), Math.max(1, Math.round(Ly / 1.6)));
  const n2 = pnoise(r, Math.max(2, Math.round(Lx / 0.6)), Math.max(2, Math.round(Ly / 0.6)));
  const cover = clamp(P.cover, 0.05, 1.5);
  const thr = 0.62 - 0.32 * cover;
  const vol = Lx * Ly * (zt - zb);
  const nAtt = Math.min(14000, Math.round(sp.attract * 1.9 / 400 * vol));
  const AX = [], AY = [], AZ = [];
  for (let tries = 0; AX.length < nAtt && tries < nAtt * 30; tries++) {
    const x = r() * Lx, y = r() * Ly, u = r();
    const f = 0.65 * n1(x / Lx, y / Ly) + 0.35 * n2(x / Lx, y / Ly);
    const pr = smooth(thr - 0.1, thr + 0.1, f) * (0.3 + 0.7 * Math.pow(u, 1.3));
    if (r() < pr) { AX.push(x); AY.push(y); AZ.push(zb + u * (zt - zb)); }
  }
  const nx = [], ny = [], nz = [], np = [], nt = [], rid = [];
  const nStem = Math.max(1, Math.round(Lx * Ly / 7));
  for (let s = 0; s < nStem; s++) {
    const x = r() * Lx, y = r() * Ly;
    nx.push(x); ny.push(y); nz.push(zb - 0.3); np.push(-1); nt.push(1); rid.push(s);
    nx.push(x + (r() - 0.5) * 0.2); ny.push(y + (r() - 0.5) * 0.2); nz.push(zb); np.push(nx.length - 2); nt.push(1); rid.push(s);
  }
  const GX = Math.max(1, Math.floor(Lx / infl)), GY = Math.max(1, Math.floor(Ly / infl)), csx = Lx / GX, csy = Ly / GY;
  const zlo = zb - 2, GZ = Math.ceil((zt - zlo + 2) / infl) + 1;
  const cellOf = (x, y, z) => [Math.min(GX - 1, Math.floor(md(x, Lx) / csx)), Math.min(GY - 1, Math.floor(md(y, Ly) / csy)), clamp(Math.floor((z - zlo) / infl), 0, GZ - 1)];
  const nb = (c, G) => [...new Set([(c - 1 + G) % G, c, (c + 1) % G])];
  const ngrid = new Array(GX * GY * GZ), agrid = new Array(GX * GY * GZ);
  const key = (cx, cy, cz) => (cz * GY + cy) * GX + cx;
  const put = (grid, i, x, y, z) => { const [cx, cy, cz] = cellOf(x, y, z); (grid[key(cx, cy, cz)] || (grid[key(cx, cy, cz)] = [])).push(i); };
  const near = (grid, x, y, z, fn) => {
    const [cx, cy, cz] = cellOf(x, y, z);
    for (const zz of [cz - 1, cz, cz + 1]) { if (zz < 0 || zz >= GZ) continue;
      for (const yy of nb(cy, GY)) for (const xx of nb(cx, GX)) { const c = grid[key(xx, yy, zz)]; if (c) for (const i of c) if (fn(i) === false) return; } }
  };
  for (let i = 0; i < nx.length; i++) put(ngrid, i, nx[i], ny[i], nz[i]);
  for (let i = 0; i < AX.length; i++) put(agrid, i, AX[i], AY[i], AZ[i]);
  const alive = new Uint8Array(AX.length).fill(1);
  let nAlive = AX.length;
  const accX = [], accY = [], accZ = [], kids = [];
  const MAXN = 9000;
  for (let it = 0; it < 240 && nAlive > 0 && nx.length < MAXN; it++) {
    const touched = [];
    for (let ai = 0; ai < AX.length; ai++) {
      if (!alive[ai]) continue;
      const x = AX[ai], y = AY[ai], z = AZ[ai];
      let best = -1, bd = infl * infl, bdx = 0, bdy = 0;
      near(ngrid, x, y, z, i => { const dx = wx(x - nx[i]), dy = wy(y - ny[i]), d2 = dx * dx + dy * dy + (z - nz[i]) ** 2; if (d2 < bd) { bd = d2; best = i; bdx = dx; bdy = dy; } });
      if (best >= 0) {
        const d = Math.sqrt(bd) || 1;
        if (accX[best] === undefined) { accX[best] = 0; accY[best] = 0; accZ[best] = 0; touched.push(best); }
        accX[best] += bdx / d; accY[best] += bdy / d; accZ[best] += (z - nz[best]) / d;
      }
    }
    if (!touched.length) break;
    const born = [];
    for (const i of touched) {
      let dx = accX[i], dy = accY[i], dz = accZ[i];
      const l0 = Math.hypot(dx, dy, dz);
      dz += sp.trop * l0; dx += (r() - 0.5) * 0.25 * l0; dy += (r() - 0.5) * 0.25 * l0;
      const l = Math.hypot(dx, dy, dz);
      accX[i] = undefined;
      if (l < 1e-6 || (kids[i] || 0) >= 3) continue;
      const x = nx[i] + seg * dx / l, y = ny[i] + seg * dy / l, z = Math.max(zb - 0.15, Math.min(zt, nz[i] + seg * dz / l));
      let crowded = false;
      near(ngrid, x, y, z, q => { if (q !== i && wx(nx[q] - x) ** 2 + wy(ny[q] - y) ** 2 + (nz[q] - z) ** 2 < (seg * 0.55) ** 2) { crowded = true; return false; } });
      if (crowded) continue;
      kids[i] = (kids[i] || 0) + 1;
      nx.push(x); ny.push(y); nz.push(z); np.push(i); nt.push(0); rid.push(rid[i]);
      const j = nx.length - 1; put(ngrid, j, x, y, z); born.push(j);
    }
    for (const j of born) near(agrid, nx[j], ny[j], nz[j], ai => { if (alive[ai] && wx(AX[ai] - nx[j]) ** 2 + wy(AY[ai] - ny[j]) ** 2 + (AZ[ai] - nz[j]) ** 2 < kill * kill) { alive[ai] = 0; nAlive--; } });
  }
  const n = nx.length;
  const nch = new Int32Array(n), tip = new Float64Array(n).fill(1e9), rad = new Float64Array(n), acc25 = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) if (np[i] >= 0) nch[np[i]]++;
  for (let i = n - 1; i >= 0; i--) { if (!nch[i]) tip[i] = 0; if (np[i] >= 0) tip[np[i]] = Math.min(tip[np[i]], tip[i] + 1); }
  for (let i = n - 1; i >= 0; i--) { rad[i] = nch[i] ? Math.pow(acc25[i], 0.4) : 0.004; if (np[i] >= 0) acc25[np[i]] += Math.pow(rad[i], 2.5); }
  let rmax = 1e-4; for (let i = 0; i < n; i++) if (np[i] < 0) rmax = Math.max(rmax, rad[i]);
  const rs = Math.min(0.11 / rmax, 1.6);
  for (let i = 0; i < n; i++) rad[i] = Math.max(0.0018, rad[i] * rs);
  // woody area index: real canopies carry roughly 0.3–0.6 m² of branch silhouette per m² of ground
  let wood = 0;
  for (let i = 0; i < n; i++) if (np[i] >= 0) { const j = np[i]; wood += (rad[i] + rad[j]) * Math.hypot(nx[i] - nx[j], ny[i] - ny[j], nz[i] - nz[j]) * 0.8; }
  const wai = wood / (Lx * Ly), waiT = 0.3;
  if (wai > waiT) { const k = waiT / wai; for (let i = 0; i < n; i++) rad[i] = Math.max(0.0018, rad[i] * k); }
  const droop = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    droop[i] = np[i] >= 0 ? droop[np[i]] : 0;
    if (!nt[i] && tip[i] <= 5) droop[i] += (sp.droop || 0) * seg * 0.5 * (1 + (5 - tip[i]) * 0.25);
  }
  const base = B.x.length, tbase = B.treeInfo.length;
  for (let s = 0; s < nStem; s++) { B.treeInfo.push({x:nx[2 * s], y:ny[2 * s], H:zt, R:2}); B.treeH.push(zt); }
  for (let i = 0; i < n; i++) addNode(B, nx[i], ny[i], nz[i] - droop[i], np[i] >= 0 ? base + np[i] : -1, nt[i], tbase + rid[i], rad[i]);
  // leaves: a real leaf area index over the ground, placed where light reaches (Beer–Lambert),
  // on leafy twig sprays, under a leaf-area-density cap
  const len = sp.len * P.leafScale, wid = sp.wid * P.leafScale;
  const target = sp.lai * 0.8 * P.leafDensity * Lx * Ly * Math.min(cover, 1.2) / (0.62 * len * wid);
  const vs = 0.5, VX = Math.max(1, Math.round(Lx / vs)), VY = Math.max(1, Math.round(Ly / vs)), VZ = Math.ceil((zt - zlo + 2) / vs) + 1;
  const vidx = i => [Math.min(VX - 1, Math.floor(md(nx[i], Lx) / Lx * VX)), Math.min(VY - 1, Math.floor(md(ny[i], Ly) / Ly * VY)), clamp(Math.floor((nz[i] - zlo) / vs), 0, VZ - 1)];
  const vox = new Float32Array(VX * VY * VZ), over = new Float32Array(VX * VY * VZ);
  const isEl = i => !nt[i] && tip[i] <= 4;
  for (let i = 0; i < n; i++) if (isEl(i)) { const [a, b, c] = vidx(i); vox[(c * VY + b) * VX + a] += 1; }
  for (let b = 0; b < VY; b++) for (let a = 0; a < VX; a++) { let acc = 0; for (let c = VZ - 1; c >= 0; c--) { const k = (c * VY + b) * VX + a; over[k] = acc; acc += vox[k]; } }
  const obs = [];
  for (let i = 0; i < n; i++) if (isEl(i)) { const [a, b, c] = vidx(i); obs.push(over[(c * VY + b) * VX + a]); }
  obs.sort((x, y) => x - y);
  const ob0 = Math.max(obs[Math.floor(obs.length * 0.5)] || 1, 1) * 0.6;
  const elig = []; let wsum = 0;
  for (let i = 0; i < n; i++) if (isEl(i)) { const [a, b, c] = vidx(i); const w = Math.exp(-over[(c * VY + b) * VX + a] / ob0) / (1 + 0.4 * tip[i]); elig.push([i, w]); wsum += w; }
  const cand = [];
  for (const [i, w] of elig) {
    const cnt = 1.8 * target * w / wsum;
    let k = Math.floor(cnt) + (r() < cnt % 1 ? 1 : 0);
    if (!k || np[i] < 0) continue;
    const gi = base + i, gp = base + np[i];
    const [dx, dy, dz] = norm3(B.x[gi] - B.x[gp], B.y[gi] - B.y[gp], B.z[gi] - B.z[gp]);
    const nTw = clamp(Math.round(k / 4), 1, 12);
    for (let tw = 0; tw < nTw; tw++) {
      const s0 = 0.3 + 0.7 * r();
      const sx = B.x[gp] + (B.x[gi] - B.x[gp]) * s0, sy = B.y[gp] + (B.y[gi] - B.y[gp]) * s0, sz = B.z[gp] + (B.z[gi] - B.z[gp]) * s0;
      const [tx, ty, tz] = norm3(dx * 0.6 + gauss(r) * 1.0, dy * 0.6 + gauss(r) * 1.0, dz * 0.4 + 0.1 + gauss(r) * 0.45 - (sp.droop || 0) * 0.8);
      const lt = sp.cluster * (1.0 + 1.0 * r());
      const twig = addNode(B, sx + tx * lt, sy + ty * lt, sz + tz * lt, gi, 0, B.tree[gi], 0.0015);
      const nl = Math.round(k / (nTw - tw)); k -= nl;
      const [qx, qy] = norm3(-ty, tx, 0.0001);
      for (let j = 0; j < nl; j++) {
        const u = 0.15 + 0.85 * (j + 0.5) / nl, sd = (j % 2 ? 1 : -1) * (0.6 + 0.4 * r()), pet = len * 0.25;
        const px = sx + tx * lt * u + qx * sd * pet + gauss(r) * 0.01, py = sy + ty * lt * u + qy * sd * pet + gauss(r) * 0.01, pz = sz + tz * lt * u + gauss(r) * 0.015;
        const [lnx, lny, lnz] = norm3(gauss(r) * sp.tilt * 0.55, gauss(r) * sp.tilt * 0.55, 1);
        const [ax, ay, az] = orthoAxis(lnx, lny, lnz, qx * sd + tx * 0.6 + gauss(r) * 0.3, qy * sd + ty * 0.6 + gauss(r) * 0.3, tz * 0.6 - 0.3 * (sp.droop || 0));
        const sc = 0.8 + 0.4 * r();
        cand.push([px, py, pz, ax, ay, az, lnx, lny, lnz, len * sc, wid * sc, twig]);
      }
    }
  }
  const vsz = 0.3, cap = Math.max(1, Math.floor(6.0 * vsz ** 3 / (0.62 * len * wid)));
  const occ = new Map();
  for (let k = cand.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); const t = cand[k]; cand[k] = cand[m]; cand[m] = t; }
  let placed = 0;
  for (const c of cand) {
    if (placed >= target) break;
    const kk = Math.floor(md(c[0], Lx) / vsz) * 73856093 ^ Math.floor(md(c[1], Ly) / vsz) * 19349663 ^ Math.floor(c[2] / vsz) * 83492791;
    const o = occ.get(kk) || 0;
    if (o >= cap) continue;
    occ.set(kk, o + 1); placed++;
    addLeaf(B, c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], sp.shape);
  }
  return nStem;
}

/* Branch hierarchy for wind: trunk (level 0), primary branches or fronds (level 1),
   secondary branches (level 2). */
/* Branch hierarchy for the wind: level 1 = limbs leaving the trunk, level 2 = branches off a
   limb's main axis, level 3 = twigs and leaf sprays off a branch's main axis. Each group records
   where it attaches and to which parent group, and each node its arc length along its group. */
const newG = () => ({lv:[[], [], []], ng:[[], [], []], ns:[[], [], []]});
function hierarchy(B, start, end, G) {
  const n = end - start;
  const sz = new Float64Array(n).fill(1);
  for (let i = n - 1; i > 0; i--) { const p = B.par[start + i] - start; if (p >= 0) sz[p] += sz[i]; }
  const main = new Int32Array(n).fill(-1), best = new Float64Array(n);
  for (let i = 1; i < n; i++) { const p = B.par[start + i] - start; if (p >= 0 && !B.trunk[start + i] && sz[i] > best[p]) { best[p] = sz[i]; main[p] = i; } }
  const g = [new Int32Array(n).fill(-1), new Int32Array(n).fill(-1), new Int32Array(n).fill(-1)];
  const sl = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const axL = new Uint8Array(n);            // which level's main axis this node lies on (0 = trunk)
  for (let i = 1; i < n; i++) {
    const gi = start + i;
    if (B.par[gi] < 0) continue;
    const p = B.par[gi] - start, gp = start + p;
    const l = Math.hypot(B.x[gi] - B.x[gp], B.y[gi] - B.y[gp], B.z[gi] - B.z[gp]);
    if (B.trunk[gi]) continue;
    for (let L = 0; L < 3; L++) { g[L][i] = g[L][p]; sl[L][i] = sl[L][p]; }
    let L;
    if (B.trunk[gp] || axL[p] === 0) L = 0;                   // a new limb
    else if (i === main[p] || axL[p] >= 3) { L = axL[p] - 1; axL[i] = axL[p]; sl[L][i] += l; G.lv[L][g[L][i]].len = Math.max(G.lv[L][g[L][i]].len, sl[L][i]); continue; }
    else L = axL[p];                                          // a side branch one level down
    const par = L === 0 ? -1 : g[L - 1][p];
    g[L][i] = G.lv[L].length; sl[L][i] = l; axL[i] = L + 1;
    for (let k = L + 1; k < 3; k++) { g[k][i] = -1; sl[k][i] = 0; }
    G.lv[L].push({tree:B.tree[gi], node:gp, par, x:B.x[gp], y:B.y[gp], z:B.z[gp], len:l, nl:0, dx:B.x[gi] - B.x[gp], dy:B.y[gi] - B.y[gp], dz:B.z[gi] - B.z[gp]});
  }
  for (let i = 0; i < n; i++) for (let L = 0; L < 3; L++) { G.ng[L][start + i] = g[L][i]; G.ns[L][start + i] = sl[L][i]; }
}

const treeCache = new Map();
function growOne(P, sp, idx) {
  const key = [P.seed, P.species, P.canopyTop, P.leafDensity, P.leafScale, idx].join('|');
  if (treeCache.has(key)) return treeCache.get(key);
  const r = rng(P.seed * 7717 + (P.species | 0) * 31 + idx * 104729 + 5);
  const H = P.canopyTop * (0.9 + 0.2 * r()), R = sp.R * (0.85 + 0.3 * r());
  const B = newBuilder();
  if (sp.kind === 'pine') growPine(sp, r, B, 0, 0, 0, H, R, P);
  else if (sp.kind === 'palm') growPalm(sp, r, B, 0, 0, 0, H, R, P);
  else growSC(sp, r, B, 0, 0, 0, H, R, P);
  const T = {B, H, R};
  treeCache.set(key, T);
  if (treeCache.size > 48) treeCache.delete(treeCache.keys().next().value);
  return T;
}
// The forest tiles with period Lx = L / sin(elevation) along the sun's azimuth and Ly = L across it,
// so that seen along the beam (light space) the tile is exactly L × L.
function genTrees(P) {
  const sp = SPECIES[P.species | 0];
  const sinE = Math.sin(Math.max(P.sunElev, 5) * DEG);
  const L = P.tileSize, Lx = L / sinE, Ly = L;
  // palms are single trees, so a light pool frames one real palm in the middle (a canopy patch would put them anywhere)
  if ((P.framing | 0) === 1 || ((P.framing | 0) === 2 && sp.kind === 'palm')) {
    const r0 = rng(P.seed * 7717 + (P.species | 0) * 31 + 11);
    const B = newBuilder();
    const G = newG();
    const zt = P.canopyTop, zbE = Math.max(0.3, zt - P.canopyDepth), zm = 0.5 * (zt + zbE), zr = P.recvHeight || 0;
    const cot = 1 / Math.tan(Math.max(P.sunElev, 5) * DEG);
    const bx = 0.5 * Lx + (zm - zr) * cot, by = 0.5 * Ly;
    if (sp.kind === 'palm') {
      growPalm(sp, r0, B, 0, bx - (zt - zr) * cot * 0, by, zt, sp.R * clamp(P.elemSize * 2, 0.3, 1.5), P);
      B.treeH.push(zt); B.treeInfo.push({x:bx, y:by, H:zt, R:sp.R});
    } else {
      const R = clamp(P.elemSize, 0.05, 1) * L * 0.5;
      // a big tree is grown with proportionally longer segments, so its branch count (and the cost of simulating it) stays modest
      const k = clamp(R / 2.5, 0.3, 2.2);
      const ls = Math.sqrt(Math.max(k, 1));   // and somewhat larger leaves, so a big crown is not tens of thousands of them
      const sp2 = {...sp, base:clamp(zbE / zt, 0.05, 0.85), seg:sp.seg * k, infl:sp.infl * k, kill:sp.kill * k, cluster:sp.cluster * Math.sqrt(k), lai:sp.lai * 1.8, len:sp.len * ls, wid:sp.wid * ls};
      growSC(sp2, r0, B, 0, bx, by, zt, R, P);
      B.treeH.push(zt); B.treeInfo.push({x:bx, y:by, H:zt, R});
    }
    // the element's extent in light space: every leaf from its base to its tip
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    const lsU = (x, z) => (x - (z - zr) * cot) / Lx;
    for (let i = 0; i < B.leaves.length; i += 13) {
      const L0 = B.leaves, len = L0[i + 7];
      for (const t of [0, 1]) {
        const x = L0[i] + t * L0[i + 4] * len, y = L0[i + 1] + t * L0[i + 5] * len, z = L0[i + 2] + t * L0[i + 6] * len;
        const u = lsU(x, z), v = y / Ly; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
    }
    for (let i = 0; i < B.x.length; i++) { const u = lsU(B.x[i], B.z[i]), v = B.y[i] / Ly; if (B.trunk[i] && !P.trunks) continue; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const extent = Math.max(u1 - u0, v1 - v0);
    // the frame closes in on the element, centred on it, so it fills the image (a small margin for the soft edge)
    // and no resolution is spent on empty surround; the gobo's real width shrinks to match
    const fit = clamp(extent * (sp.kind === 'palm' ? 1.16 : 1.08), 0.15, 1), Lx2 = Lx * fit, Ly2 = Ly * fit;
    const dx = 0.5 * Lx2 - 0.5 * (u0 + u1) * Lx, dy = 0.5 * Ly2 - 0.5 * (v0 + v1) * Ly;
    if (fit < 1) {
      for (let i = 0; i < B.x.length; i++) { B.x[i] += dx; B.y[i] += dy; }
      for (let i = 0; i < B.leaves.length; i += 13) { B.leaves[i] += dx; B.leaves[i + 1] += dy; }
      for (const q of B.treeInfo) { q.x += dx; q.y += dy; }
    }
    hierarchy(B, 0, B.x.length, G);
    return {B, G, sp, nTrees:1, Lx:Lx2, Ly:Ly2, single:true, extent:extent / fit, fit};
  }
  if (sp.kind !== 'palm') {
    const r0 = rng(P.seed * 7717 + (P.species | 0) * 31 + 5);
    const B = newBuilder();
    const G = newG();
    const nS = growPatch(sp, r0, B, P, Lx, Ly, P.canopyTop);
    hierarchy(B, 0, B.x.length, G);
    return {B, G, sp, nTrees:nS, Lx, Ly, patch:true};
  }
  const Rm = sp.R;
  const nT = clamp(Math.round(P.cover * Lx * Ly / (Math.PI * Rm * Rm)), 1, 16);
  const r = rng(P.seed * 131 + 17);
  const pos = [];
  for (let t = 0; t < nT; t++) {
    let bestP = null, bestD = -1;
    for (let k = 0; k < 40; k++) {
      const c = [r() * Lx, r() * Ly];
      let dmin = 1e9;
      for (const q of pos) { const dx = Math.abs(c[0] - q[0]), dy = Math.abs(c[1] - q[1]); dmin = Math.min(dmin, Math.hypot(Math.min(dx, Lx - dx), Math.min(dy, Ly - dy))); }
      if (dmin > bestD) { bestD = dmin; bestP = c; }
    }
    pos.push(bestP);
  }
  const B = newBuilder();
  const G = newG();
  pos.forEach((c, t) => {
    const one = growOne(P, sp, t), b = one.B;
    const off = B.x.length;
    for (let i = 0; i < b.x.length; i++) {
      B.x.push(b.x[i] + c[0]); B.y.push(b.y[i] + c[1]); B.z.push(b.z[i]);
      B.par.push(b.par[i] < 0 ? -1 : b.par[i] + off); B.trunk.push(b.trunk[i]); B.tree.push(t); B.rad.push(b.rad[i]);
    }
    const lv = b.leaves;
    for (let i = 0; i < lv.length; i += 13) {
      B.leaves.push(lv[i] + c[0], lv[i + 1] + c[1], lv[i + 2], lv[i + 3], lv[i + 4], lv[i + 5], lv[i + 6], lv[i + 7], lv[i + 8], lv[i + 9], lv[i + 10], lv[i + 11], lv[i + 12] + off);
    }
    B.treeH.push(one.H); B.treeInfo.push({x:c[0], y:c[1], H:one.H, R:one.R});
    hierarchy(B, off, B.x.length, G);
  });
  return {B, G, sp, nTrees:nT, Lx, Ly};
}

function uploadTrees(T, P) {
  const {B} = T;
  const F = null;
  TR.frame = T.single ? {extent:T.extent, fit:T.fit || 1} : null;
  const src = B.leaves;
  const kept = [];
  if (F) {
    const e = Math.max(P.sunElev, 5) * DEG, cot = 1 / Math.tan(e), zr = P.recvHeight || 0;
    for (let i = 0; i < src.length; i += 13) {
      if (!F.keep[src[i + 12]]) continue;
      // unwrap each leaf next to the element centre so the element never splits across the frame edge
      const u = (src[i] - (src[i + 2] - zr) * cot) / T.Lx, v = src[i + 1] / T.Ly;
      const ox = -Math.round(u - F.u0) * T.Lx, oy = -Math.round(v - F.v0) * T.Ly;
      const row = Array.prototype.slice.call(src, i, i + 13);
      row[0] += F.dx + ox; row[1] += F.dy + oy;
      kept.push(...row);
    }
  }
  const nL = F ? kept.length / 13 : src.length / 13;
  const geo = new Float32Array(nL * 13);
  geo.set(F ? kept : src);
  if (!TR.leafVAO) { TR.leafVAO = gl.createVertexArray(); TR.leafBuf = gl.createBuffer(); TR.flutBuf = gl.createBuffer(); TR.segVAO = gl.createVertexArray(); TR.segBuf = gl.createBuffer(); }
  gl.bindVertexArray(TR.leafVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, TR.leafBuf);
  gl.bufferData(gl.ARRAY_BUFFER, geo, gl.STATIC_DRAW);
  const st = 13 * 4;
  const attr = (loc, size, off, stride, buf) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(loc, 4); };
  attr(0, 4, 0, st, TR.leafBuf); attr(1, 4, 16, st, TR.leafBuf); attr(2, 4, 32, st, TR.leafBuf); attr(4, 1, 48, st, TR.leafBuf);
  gl.bindBuffer(gl.ARRAY_BUFFER, TR.flutBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nL * 4), gl.DYNAMIC_DRAW);
  attr(3, 4, 0, 16, TR.flutBuf);
  // segments
  const segs = [];
  const e2 = Math.max(P.sunElev, 5) * DEG, cot2 = 1 / Math.tan(e2), zr2 = P.recvHeight || 0;
  for (let i = 0; i < B.x.length; i++) {
    const p = B.par[i]; if (p < 0) continue;
    let ox = 0, oy = 0;
    if (F) {
      if (!F.keep[i]) continue;
      const u = (B.x[i] - (B.z[i] - zr2) * cot2) / T.Lx, v = B.y[i] / T.Ly;
      ox = F.dx - Math.round(u - F.u0) * T.Lx; oy = F.dy - Math.round(v - F.v0) * T.Ly;
    }
    if (B.rad[i] < 0.0014 && B.rad[p] < 0.0014) continue;
    if ((!P.trunks || T.single) && B.trunk[i] && B.trunk[p]) continue;
    segs.push(B.x[p] + ox, B.y[p] + oy, B.z[p], B.rad[p], B.x[i] + ox, B.y[i] + oy, B.z[i], B.rad[i], p, i);
  }
  const sg = new Float32Array(segs);
  gl.bindVertexArray(TR.segVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, TR.segBuf);
  gl.bufferData(gl.ARRAY_BUFFER, sg, gl.STATIC_DRAW);
  attr(0, 4, 0, 40, TR.segBuf); attr(1, 4, 16, 40, TR.segBuf); attr(2, 2, 32, 40, TR.segBuf);
  gl.bindVertexArray(vao);
  TR.nLeaves = nL; TR.nSegs = sg.length / 10;
  const n = B.x.length, rows = Math.ceil(n / 1024);
  TR.dispData = new Float32Array(1024 * rows * 4);
  if (TR.dispTex) gl.deleteTexture(TR.dispTex);
  TR.dispTex = dataTex(1024, rows, TR.dispData);
  TR.rows = rows;
  let zmax = 0; for (let i = 0; i < n; i++) zmax = Math.max(zmax, B.z[i]);
  for (let i = 2; i < B.leaves.length; i += 13) zmax = Math.max(zmax, B.leaves[i]);
  TR.zmax = zmax + 0.6;
}

/* =====================================================================
   WIND — a time-domain simulation, not an animation.
   The wind is a turbulent velocity field: a mean speed that dies away
   down into the crown, plus eddies with a von Kármán spectrum. Eddies
   smaller than the tile are carried across it at the convection speed
   (so a gust visibly sweeps through the canopy); larger ones arrive as
   whole-tile surges. Every limb, branch and twig spray is a damped
   cantilever (its first bending mode) with its own natural frequency,
   pushed by aerodynamic drag on the *relative* velocity of the air
   (|V|^0.4·V: leafy crowns streamline, so drag grows slower than V²;
   using the relative velocity also gives the aerodynamic damping), and
   carried by its parent's motion (base excitation, which makes tips whip).
   Stronger wind therefore bends things further and drives them harder,
   while each part still swings at its own natural frequency.
   The field is periodic in space and in time; after the start-up
   transient dies away the response repeats exactly, so one period is
   recorded and played back as a seamless loop.
   ===================================================================== */
function windModes(T, P, tl) {
  const r = rng(P.seed * 911 + 13);
  const U = Math.max(P.windSpeed, 0.05), wd = P.windDir * DEG, wx = Math.cos(wd), wy = Math.sin(wd);
  const Lx = T.Lx || 10, Ly = T.Ly || 10, Tl = tl.loop ? tl.len : Math.min(tl.len, 120);
  const sig = (P.turb ?? 0.35) * U, Uc = 0.8 * U, Lu = 12;
  const q = w => tl.loop ? Math.round(w * Tl / (2 * Math.PI)) * 2 * Math.PI / Tl : w;
  const fSp = clamp(0.25 + 0.5 * (P.indep ?? 0.5), 0.1, 0.9);       // share of the eddies smaller than the tile
  const gust = 1 + 1.5 * (P.gustAmt || 0);
  const modes = [];
  const comp = () => { const a = gauss(r), b = 0.75 * gauss(r), c = 0.5 * gauss(r); return [a * wx - b * wy, a * wy + b * wx, c]; };
  // eddies smaller than the tile: wavevectors on the tile's lattice, carried downwind
  const cand = [];
  for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) {
    if (!i && !j) continue;
    const kx = 2 * Math.PI * i / Lx, ky = 2 * Math.PI * j / Ly, k = Math.hypot(kx, ky);
    if (2 * Math.PI / k < 0.5) continue;
    const kl = k * 2.0, E = Math.pow(kl, 4) / Math.pow(1 + kl * kl, 17 / 6);     // von Kármán energy spectrum (L ≈ 2 m in the crown)
    cand.push([kx, ky, k, E / (k)]);                                             // lattice density ∝ k in 2D
  }
  let wsum = 0; cand.forEach(c => wsum += c[3]);
  const NS = 22;
  for (let m = 0; m < NS && cand.length; m++) {
    let x = r() * wsum, i = 0; while (i < cand.length - 1 && x > cand[i][3]) { x -= cand[i][3]; i++; }
    const [kx, ky, k] = cand[i];
    const om = q((kx * wx + ky * wy) * Uc + 0.35 * sig * k * gauss(r));     // frozen turbulence + slow evolution
    const d = comp(), a = sig * Math.sqrt(fSp * 2 / NS);
    modes.push([kx, ky, om, r() * 2 * Math.PI, a * d[0], a * d[1], a * d[2]]);
  }
  // eddies bigger than the tile: the whole canopy surges and veers together
  const NU = 10, fs = [];
  const f0 = tl.loop ? -1.6 : -2.0;
  for (let i = 0; i < NU; i++) fs.push(Math.pow(10, f0 + (0.3 - f0) * (i + r()) / NU));
  const S = f => (Lu / U) / Math.pow(1 + 70.8 * (f * Lu / U) ** 2, 5 / 6);
  let Ssum = 0; const sf = fs.map((f, i) => { const df = f * 0.5; const v = S(f) * df; Ssum += v; return v; });
  fs.forEach((f, i) => {
    const om = tl.loop ? Math.max(q(2 * Math.PI * f), 2 * Math.PI / Tl) : 2 * Math.PI * f, d = comp();
    const a = sig * Math.sqrt((1 - fSp) * gust * 2 * sf[i] / Ssum);
    modes.push([0, 0, om, r() * 2 * Math.PI, a * d[0], a * d[1], a * d[2]]);
  });
  return {modes, U, wx, wy, sig};
}
function windSetup(T, P, tl) { const g = windSetupGen(T, P, tl); while (!g.next().done); }
/* The simulation set-up is a generator so it can run in short slices between frames: changing a wind slider
   keeps the preview moving with the old wind until the new one is ready, instead of freezing the page. */
function* windSetupGen(T, P, tl) {
  const {B, G, sp} = T;
  const WM = windModes(T, P, tl), M = WM.modes.length, U = WM.U;
  const palm = sp.kind === 'palm';
  const ztop = T.patch ? P.canopyTop : Math.max(...B.treeH);
  const prof = z => Math.exp(-2.0 * clamp(1 - z / ztop, 0, 1.5));          // mean wind dies away down into the crown
  const tprof = z => Math.exp(-1.0 * clamp(1 - z / ztop, 0, 1.5));
  // groups: trees (whole-crown sway), then limbs, branches, twig sprays
  const groups = [];
  B.treeInfo.forEach((t, i) => groups.push({lvl:0, par:-1, c:0, x:t.x, y:t.y, z:t.H * 0.75, len:t.H, fn:sp.fn * Math.pow(11 / t.H, 0.8), defl:(palm ? 0.03 : 0.015) * (T.patch ? 0.3 : 1) * P.swayBranch}));
  const off = [groups.length];
  const fnL = [[1.4, 0.45, 2.5], [2.0, 0.9, 4.0], [2.6, 1.8, 6.0]], deflL = [0.05, 0.07, 0.09];
  const nodeW = (L, gi, node) => { const gg = G.lv[L][gi]; return Math.pow(clamp(G.ns[L][node] / Math.max(gg.len, 0.05), 0, 1), 1.5); };
  for (let L = 0; L < 3; L++) {
    G.lv[L].forEach((g, gi) => {
      const par = L === 0 ? g.tree : off[L - 1] + g.par;
      // where the parent's own bending carries this group's base
      const c = L === 0 ? Math.pow(clamp(B.z[g.node] / Math.max(B.treeH[B.tree[g.node]], 1), 0, 1.3), 2) : nodeW(L - 1, g.par, g.node);
      const len = Math.max(g.len, 0.05);
      let fn = clamp(fnL[L][0] / Math.sqrt(len), fnL[L][1], fnL[L][2]);
      if (palm && L === 0) fn = clamp(0.9 / Math.sqrt(len / 3), 0.5, 1.5);
      // sample the wind part-way out along the group
      const e = Math.hypot(g.dx, g.dy, g.dz) || 1, h = 0.5 * len;
      groups.push({lvl:L + 1, par, c, x:g.x + g.dx / e * h, y:g.y + g.dy / e * h, z:g.z + g.dz / e * h, len, fn,
                   defl:(palm && L === 0 ? 0.12 : deflL[L]) * (L === 0 ? P.swayBranch : P.swayTwig)});
    });
    off.push(groups.length);
  }
  const ng = groups.length;
  // per group: stiffness, damping, drag coefficient (per unit modal mass) from the static bend at 5 m/s
  const r = rng(P.seed * 37 + 3);
  const om = new Float64Array(ng), kap = new Float64Array(ng), par = new Int32Array(ng), cc = new Float64Array(ng);
  const pz = new Float64Array(ng), tz = new Float64Array(ng), sampleOf = new Int32Array(ng);
  groups.forEach((g, i) => {
    g.fn *= 0.85 + 0.3 * r();
    om[i] = 2 * Math.PI * g.fn;
    kap[i] = g.defl * g.len * om[i] * om[i] / Math.pow(5, 1.4) * Math.exp(0.35 * gauss(r));
    par[i] = g.par; cc[i] = g.c; pz[i] = prof(g.z); tz[i] = tprof(g.z);
    // twig sprays feel the same eddy as the branch they hang from
    sampleOf[i] = g.lvl === 3 && g.par >= 0 ? sampleOf[g.par] : i;
  });
  // wind phasors per sampling group
  const samplers = [...new Set(sampleOf)];
  const sIdx = new Int32Array(ng); samplers.forEach((g, k) => { sIdx[g] = k; });
  const nsamp = samplers.length;
  const cs = new Float64Array(nsamp * M * 2);
  const dt = 1 / 120, Tl = tl.loop ? tl.len : Math.min(tl.len, 120);
  const rot = WM.modes.map(m => [Math.cos(m[2] * dt), Math.sin(m[2] * dt)]);
  const setPhase = t => samplers.forEach((g, k) => WM.modes.forEach((m, j) => {
    const th = m[0] * groups[g].x + m[1] * groups[g].y - m[2] * t + m[3];
    cs[(k * M + j) * 2] = Math.cos(th); cs[(k * M + j) * 2 + 1] = Math.sin(th);
  }));
  const W = new Float64Array(nsamp * 3);
  const windAt = () => {
    for (let k = 0; k < nsamp; k++) {
      let a = 0, b = 0, c = 0;
      for (let j = 0; j < M; j++) {
        const o = (k * M + j) * 2, cth = cs[o], sth = cs[o + 1], m = WM.modes[j];
        a += m[4] * cth; b += m[5] * cth; c += m[6] * cth;
        const [cr, sr] = rot[j];
        cs[o] = cth * cr + sth * sr; cs[o + 1] = sth * cr - cth * sr;     // advance by ω·dt
      }
      W[k * 3] = a; W[k * 3 + 1] = b; W[k * 3 + 2] = c;
    }
  };
  // state: displacement and velocity relative to the parent's carried base; absolute velocity and acceleration
  const qx = new Float64Array(ng * 3), qv = new Float64Array(ng * 3), av = new Float64Array(ng * 3), aa = new Float64Array(ng * 3);
  const zeta = 0.035;
  const step = () => {
    windAt();
    for (let i = 0; i < ng; i++) {
      const k = sIdx[sampleOf[i]], p = par[i], c = cc[i];
      const mx = U * pz[i] * WM.wx, my = U * pz[i] * WM.wy;
      let vax = 0, vay = 0, vaz = 0, pax = 0, pay = 0, paz = 0;
      if (p >= 0) { vax = c * av[p * 3]; vay = c * av[p * 3 + 1]; vaz = c * av[p * 3 + 2]; pax = c * aa[p * 3]; pay = c * aa[p * 3 + 1]; paz = c * aa[p * 3 + 2]; }
      const o = i * 3;
      // air velocity relative to the moving branch
      const Vx = mx + tz[i] * W[k * 3] - (vax + qv[o]), Vy = my + tz[i] * W[k * 3 + 1] - (vay + qv[o + 1]), Vz = tz[i] * W[k * 3 + 2] - (vaz + qv[o + 2]);
      const sp2 = Math.pow(Vx * Vx + Vy * Vy + 0.36 * Vz * Vz + 1e-6, 0.2) * kap[i];
      const w2 = om[i] * om[i], wz2 = w2 * 1.44, d = 2 * zeta * om[i];
      const ax = sp2 * Vx - w2 * qx[o] - d * qv[o] - pax;
      const ay = sp2 * Vy - w2 * qx[o + 1] - d * qv[o + 1] - pay;
      const az = 0.6 * sp2 * Vz - wz2 * qx[o + 2] - d * qv[o + 2] - paz;
      qv[o] += ax * dt; qv[o + 1] += ay * dt; qv[o + 2] += az * dt;
      qx[o] += qv[o] * dt; qx[o + 1] += qv[o + 1] * dt; qx[o + 2] += qv[o + 2] * dt;
      av[o] = vax + qv[o]; av[o + 1] = vay + qv[o + 1]; av[o + 2] = vaz + qv[o + 2];
      aa[o] = pax + ax; aa[o + 1] = pay + ay; aa[o + 2] = paz + az;
    }
  };
  // start every branch already bent by the mean wind, so the start-up transient is small and dies away quickly
  for (let i = 0; i < ng; i++) {
    const mx = U * pz[i] * WM.wx, my = U * pz[i] * WM.wy, sp2 = Math.pow(mx * mx + my * my + 1e-6, 0.2) * kap[i], w2 = om[i] * om[i];
    qx[i * 3] = sp2 * mx / w2; qx[i * 3 + 1] = sp2 * my / w2;
  }
  const warmSteps = Math.round(12 / dt);
  setPhase(-warmSteps * dt);
  for (let s2 = 0; s2 < warmSteps; s2++) { step(); if (s2 % 120 === 119) yield; }
  let rec = null, F = 0, rate = 30, live = null;
  if (tl.loop) {
    // looping: record one period of the (now periodic) response
    rate = Math.max(12, Math.min(30, 6e6 / (ng * 3 * Tl)));
    F = Math.max(2, Math.round(Tl * rate));
    rec = new Float32Array(F * ng * 3);
    let f = 0;
    setPhase(0);
    const nSteps = Math.round(Tl / dt);
    for (let s2 = 0; s2 <= nSteps; s2++) {
      const tNow = s2 * dt;
      while (f < F && f / rate <= tNow + 1e-9) { rec.set(qx.subarray(0, ng * 3), f * ng * 3); f++; }
      if (s2 < nSteps) step();
      if (s2 % 120 === 119) yield;
    }
    // remove the last trace of transient so the loop closes exactly
    const end = Float32Array.from(qx);
    for (let fr = 0; fr < F; fr++) { const w = fr / F; for (let i = 0; i < ng * 3; i++) rec[fr * ng * 3 + i] -= w * (end[i] - rec[i]); }
  } else {
    // not looping: the simulation runs forward live with the timeline, never repeating.
    // Checkpoints every 2 s let it jump back when you scrub; a short history covers motion blur.
    setPhase(0);
    const snap = t => ({t, qx:Float64Array.from(qx), qv:Float64Array.from(qv), av:Float64Array.from(av), aa:Float64Array.from(aa)});
    live = {t:0, n:0, cps:[snap(0)], hist:[], dt,
      restore(cp) { qx.set(cp.qx); qv.set(cp.qv); av.set(cp.av); aa.set(cp.aa); setPhase(cp.t); this.t = cp.t; this.n = Math.round(cp.t / dt); this.hist = []; },
      advance(t) {
        const target = Math.round(t / dt);
        if (target - this.n > 120 * 600) return;            // never stall the page on a huge jump
        while (this.n < target) {
          step(); this.n++; this.t = this.n * dt;
          this.hist.push([this.t, Float32Array.from(qx)]); if (this.hist.length > 90) this.hist.shift();
          const last = this.cps[this.cps.length - 1];
          if (this.t - last.t >= 2 - 1e-9) this.cps.push(snap(this.t));
        }
      },
      at(t) {
        t = Math.max(t, 0);
        const h = this.hist;
        if (t < this.t - 1e-9 && (!h.length || t < h[0][0] - 1e-9)) {
          let cp = this.cps[0]; for (const c of this.cps) if (c.t <= t + 1e-9) cp = c;
          this.restore(cp);
        }
        if (t > this.t) this.advance(t);
        if (t < this.t - 1e-9 && h.length) { let best = h[h.length - 1]; for (const e of h) if (Math.abs(e[0] - t) < Math.abs(best[0] - t)) best = e; return best[1]; }
        return qx;
      }};
    // a short run to estimate the sway for the info line
    rec = new Float32Array(2 * ng * 3); F = 0;
  }
  // node weights: each level's bending shape along its group
  const n = B.x.length, wts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const H = B.treeH[B.tree[i]];
    wts[i * 4] = Math.pow(clamp(B.z[i] / H, 0, 1.3), 2);
    for (let L = 0; L < 3; L++) { const gi = G.ng[L][i]; wts[i * 4 + 1 + L] = gi >= 0 ? nodeW(L, gi, i) : 0; }
  }
  // per-leaf flutter: frequency rises a little with wind; whether it flutters at all is decided per frame by the local wind
  const nL = TR.nLeaves, fl = new Float32Array(nL * 4);
  const qf = f2 => tl.loop ? Math.max(1, Math.round(f2 * tl.len)) / tl.len : f2;
  const famp = sp.flutAmp * P.flutter;
  const fBase = sp.flutHz * (0.75 + 0.25 * clamp(U / 3, 0.3, 2.5));
  for (let i = 0; i < nL; i++) {
    const f2 = fBase * (0.75 + 0.5 * r()), a = r();
    fl[i * 4] = qf(f2); fl[i * 4 + 1] = qf(f2 * 1.63); fl[i * 4 + 2] = r() * Math.PI * 2; fl[i * 4 + 3] = famp * (0.15 + 1.4 * a * a);
  }
  if (TR.data !== T) return;   // the tree changed while this ran
  gl.bindBuffer(gl.ARRAY_BUFFER, TR.flutBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, fl);
  // wind modes for the leaves (evaluated on the GPU at every leaf)
  const wk = new Float32Array(32 * 4), wa = new Float32Array(32 * 4);
  WM.modes.slice(0, 32).forEach((m, j) => { wk.set([m[0], m[1], m[2], m[3]], j * 4); wa.set([m[4], m[5], m[6], 0], j * 4); });
  let rms = 0; const top = off[1] > off[0] ? off[0] : 0;
  let mean = [0, 0];
  if (F) {
    for (let fr = 0; fr < F; fr++) { const o = (fr * ng + top) * 3; rms += rec[o] ** 2 + rec[o + 1] ** 2; }
    for (let fr = 0; fr < F; fr++) { const o = (fr * ng + top) * 3; mean[0] += rec[o] / F; mean[1] += rec[o + 1] / F; }
    rms = Math.sqrt(Math.max(rms / F - mean[0] ** 2 - mean[1] ** 2, 0));
  } else {
    // estimate from the first 10 s of the live run, then rewind
    const o = top * 3, xs = [], ys = [];
    for (let k = 1; k <= 60; k++) { const q2 = live.at(k * 0.1); xs.push(q2[o]); ys.push(q2[o + 1]); if (k % 10 === 0) yield; }
    const mx = xs.reduce((a2, b2) => a2 + b2, 0) / xs.length, my = ys.reduce((a2, b2) => a2 + b2, 0) / ys.length;
    rms = Math.sqrt(xs.reduce((a2, v, i) => a2 + (v - mx) ** 2 + (ys[i] - my) ** 2, 0) / xs.length); mean = [mx, my];
    live.restore(live.cps[0]);
  }
  TR.wind = {rec, F, rate, ng, groups, off, wts, Tl, wk, wa, live, nM:Math.min(32, M), U, wx:WM.wx, wy:WM.wy, ztop, famp,
             twA:0, twF:[1, 1, 1], nG:0, fnLimb:groups[off[0]] ? groups[off[0]].fn : groups[0].fn, rmsTop:rms, lean:Math.hypot(...mean), nGroups:ng - off[0]};
}
function gustAt() { return 1; }
function windEval(T, t) {
  const {B, G} = T, W = TR.wind;
  const ng = W.ng;
  let g;
  if (W.live) g = W.live.at(t);
  else {
    const tt = ((t % W.Tl) + W.Tl) % W.Tl, x = tt * W.rate, f0 = Math.floor(x) % W.F, f1 = (f0 + 1) % W.F, u = x - Math.floor(x);
    const a = f0 * ng * 3, b = f1 * ng * 3, rec = W.rec;
    g = W.gq || (W.gq = new Float32Array(ng * 3));
    for (let i = 0; i < ng * 3; i++) g[i] = rec[a + i] * (1 - u) + rec[b + i] * u;
  }
  const d = TR.dispData, n = B.x.length, off = W.off, wt = W.wts;
  for (let i = 0; i < n; i++) {
    const t0 = B.tree[i] * 3, w0 = wt[i * 4];
    let x2 = g[t0] * w0, y2 = g[t0 + 1] * w0, z2 = g[t0 + 2] * w0;
    for (let L = 0; L < 3; L++) {
      const gi = G.ng[L][i]; if (gi < 0) continue;
      const k = (off[L] + gi) * 3, w = wt[i * 4 + 1 + L];
      x2 += g[k] * w; y2 += g[k + 1] * w; z2 += g[k + 2] * w;
    }
    d[i * 4] = x2; d[i * 4 + 1] = y2; d[i * 4 + 2] = z2; d[i * 4 + 3] = 0;
  }
  gl.bindTexture(gl.TEXTURE_2D, TR.dispTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, TR.rows, gl.RGBA, gl.FLOAT, d);
}
let tapsCache = {sig:'', tex:null, n:0, maxR:0};
function sunTaps(P, n) {
  const sig = [P.sunDisk, P.tileSize, n].join('|');
  if (sig === tapsCache.sig) return tapsCache;
  const th = P.sunDisk * 0.5 * DEG;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const rho = Math.sqrt((i + 0.5) / n), ph = i * 2.39996323;
    data[i * 4] = Math.tan(th * rho * Math.cos(ph)) / P.tileSize;
    data[i * 4 + 1] = Math.tan(th * rho * Math.sin(ph)) / P.tileSize;
    data[i * 4 + 2] = 1 - 0.6 * (1 - Math.sqrt(1 - rho * rho));   // solar limb darkening
  }
  if (tapsCache.tex) gl.deleteTexture(tapsCache.tex);
  tapsCache = {sig, tex:dataTex(n, 1, data), n, maxR:Math.tan(th) / P.tileSize};
  return tapsCache;
}
function treesFor(P, tl = S.tl.trees) {
  const sig = [P.seed, P.species, P.tileSize, P.cover, P.canopyTop, P.canopyDepth, P.leafDensity, P.leafScale, P.trunks, P.framing, P.elemSize, P.recvHeight, Math.round(P.sunElev * 2) / 2].join('|');
  if (sig !== TR.sig) {
    TR.data = genTrees(P);
    uploadTrees(TR.data, P);
    TR.sig = sig; TR.windSig = '';
  }
  const ws = [sig, P.windSpeed, P.windDir, P.turb, P.swayBranch, P.swayTwig, P.flutter, P.gustAmt, P.indep, tl.loop, tl.len].join('|');
  if (ws !== TR.windSig) {
    // a new tree needs its wind now; a wind change on the same tree is simulated just after this frame,
    // so the panel stays responsive and the preview says what is happening
    if (!TR.wind || TR.wind.ng === undefined || TR.windTree !== TR.sig) { windSetup(TR.data, P, tl); TR.windSig = ws; TR.windTree = TR.sig; }
    else if (TR.windPending !== ws) {
      // simulate the new wind in the background, a few milliseconds at a time; the old wind keeps playing meanwhile
      TR.windPending = ws;
      const hud = $('hud'); if (hud && !hud.querySelector('.windchip')) { const chip = document.createElement('span'); chip.className = 'chip ok windchip'; chip.textContent = 'Simulating the wind…'; hud.append(chip); }
      clearTimeout(TR.windTimer);
      const tree = TR.data, treeSig = TR.sig, P2 = {...P}, tl2 = {...tl};
      TR.windTimer = setTimeout(() => {
        const gen = windSetupGen(tree, P2, tl2);
        const pump = () => {
          if (TR.windPending !== ws || TR.sig !== treeSig) return;          // superseded
          const t0 = performance.now();
          while (performance.now() - t0 < 12) { if (gen.next().done) { TR.windSig = ws; TR.windPending = null; dirty = true; const c = document.querySelector('.windchip'); if (c) c.remove(); return; } }
          TR.windTimer = setTimeout(pump, 0);
        };
        pump();
      }, 120);
    }
  }
  return TR.data;
}
function renderTrees(P, res, t, tl) {
  const Q = QUAL[S.quality];
  const T = treesFor(P, tl);
  // a single element framed tightly: the gobo spans only the element's width
  if (T.fit && T.fit < 1) P = {...P, tileSize:P.tileSize * T.fit};
  const tt = tl.loop ? ((t % tl.len) + tl.len) % tl.len : t;
  windEval(T, tt);
  const e = Math.max(P.sunElev, 5) * DEG, sinE = Math.sin(e), cot = 1 / Math.tan(e);
  const zr = P.recvHeight || 0;
  const smax = Math.max((TR.zmax - zr) / sinE, 0.5) + 0.3;
  const ds = smax / 8;
  const sl = mrt('trSlices', res, res);
  bindTarget(sl);
  gl.clearBufferfv(gl.COLOR, 0, [1, 1, 1, 1]); gl.clearBufferfv(gl.COLOR, 1, [1, 1, 1, 1]);
  gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.ZERO);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TR.dispTex);
  const common = p => { i1(p, 'uWrap', TR.frame ? 0 : 1); f1(p, 'uTwCoh', 0); f1(p, 'uLoopT', tl.loop ? tl.len : 0); f1(p, 'uT', tt); f1(p, 'uGustE', Math.pow(gustAt(tt), 2.5)); f1(p, 'uTwA', TR.wind.twA); f3(p, 'uTwF', ...TR.wind.twF); i1(p, 'uDisp', 0); const Wd = TR.wind; gl.uniform4fv(p.u('uWk[0]'), Wd.wk); gl.uniform4fv(p.u('uWa[0]'), Wd.wa); i1(p, 'uNW', Wd.nM); f3(p, 'uWm', Wd.U * Wd.wx, Wd.U * Wd.wy, 0); f1(p, 'uZtop', Wd.ztop); f1(p, 'uFlutU', T.sp.flutU || 1.0); f1(p, 'uLeanK', 0.022 * (P.flutter > 0 ? 1 : 0)); f1(p, 'uLx', T.Lx); f1(p, 'uLy', T.Ly); f1(p, 'uCot', cot); f1(p, 'uSinE', sinE); f1(p, 'uZr', zr); f1(p, 'uDS', ds);
    // painted density (Paint over), sampled by every leaf and twig at its resting place
    const ov = ovlOn() && ovlTarget('trees').used; i1(p, 'uOvlOn', ov ? 1 : 0); if (ov) { tex(p, 'uOvl', ovlTex(ovlTarget('trees')), 3); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TR.dispTex); } };
  if (P.woody) {
    const p = PR.seg; gl.useProgram(p.p); gl.bindVertexArray(TR.segVAO);
    common(p); f1(p, 'uPx', 1 / res); f1(p, 'uTile', P.tileSize);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TR.nSegs * 4);
  }
  {
    const p = PR.leaf3; gl.useProgram(p.p); gl.bindVertexArray(TR.leafVAO);
    common(p); f1(p, 'uT', tt); f1(p, 'uTransl', T.sp.transl);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TR.nLeaves * 4);
  }
  gl.disable(gl.BLEND);
  gl.bindVertexArray(vao);
  gl.bindTexture(gl.TEXTURE_2D, sl.tex); gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, sl.tex2); gl.generateMipmap(gl.TEXTURE_2D);
  const taps = sunTaps(P, Q.treeTaps);
  const H = [], lod = [];
  for (let k = 0; k < 8; k++) {
    const h = (k + 0.5) * ds; H.push(h);
    const r = taps.maxR * h * res;
    lod.push(Math.max(0, Math.log2(Math.max(Math.sqrt(Math.PI * r * r / taps.n), 1e-6)) - 0.4));
  }
  // leaf transmittance is green: chlorophyll absorbs red and blue (typical broadleaf, PROSPECT-like)
  const K = [1, 1, 1];
  const out = tgt('trOut', res, res, 'f16');
  pass(PR.canopy3, out, p => {
    tex(p, 'uS0', sl.tex, 0); tex(p, 'uS1', sl.tex2, 1); tex(p, 'uTaps', taps.tex, 2); i1(p, 'uNTaps', taps.n);
    gl.uniform1fv(p.u('uH[0]'), new Float32Array(H)); gl.uniform1fv(p.u('uLod[0]'), new Float32Array(lod)); f3(p, 'uK', ...K);
  });
  const W = TR.wind, th = P.sunDisk * 0.5 * DEG;
  const zTop = T.patch ? P.canopyTop : T.B.treeInfo.reduce((s, q) => s + q.H, 0) / T.B.treeInfo.length;
  const zBot = T.patch ? Math.max(0.3, P.canopyTop - P.canopyDepth) : zTop * 0.8;
  const dMean = Math.max(0.5 * (zTop + zBot) - zr, 0.1) / sinE;
  const dLo = Math.max(zBot - zr, 0.05) / sinE, dHi = Math.max(zTop - zr, 0.05) / sinE;
  const fr = TR.frame ? (TR.frame.fit < 1 ? `Single element, framed to fill the image: the gobo is ${P.tileSize.toFixed(2)} m across (the element's own width)\n` : `Single element filling ${(TR.frame.extent * 100).toFixed(0)}% of the frame` + (TR.frame.extent > 0.95 ? ' (it touches the edges: raise Tile size or lower Element size)' : '') + '\n') : '';
  info = fr + (T.patch ? `Seamless ${T.sp.name.toLowerCase()} canopy fed by ${T.nTrees} branch${T.nTrees === 1 ? '' : 'es'}` : `${T.nTrees} × ${T.sp.name.toLowerCase()}`) + ` · ${TR.nLeaves.toLocaleString()} leaves · ${TR.nSegs.toLocaleString()} branch segments\n` +
         `Light space: the tile is ${P.tileSize.toFixed(1)} m square across the beam. Project it along the sun and the renderer stretches it ${(1 / sinE).toFixed(2)}× on flat ground\n` +
         `Foliage ${zBot.toFixed(1)}–${zTop.toFixed(1)} m above the lit surface: shadow edges soften by ${(2 * dLo * Math.tan(th) * 100).toFixed(1)}–${(2 * dHi * Math.tan(th) * 100).toFixed(1)} cm (real sun Ø ${P.sunDisk.toFixed(2)}°); gaps throw round sun spots that size\n` +
         `Wind ${P.windSpeed.toFixed(1)} m/s at the tree tops, turbulence ${Math.round((P.turb ?? 0.35) * 100)}% · simulated: ${W.nGroups} limbs, branches and twig sprays, each a damped cantilever pushed by drag on the moving air`+
         `\nLimbs sway near ${W.fnLimb.toFixed(2)} Hz, ±${(W.rmsTop * 100).toFixed(1)} cm, leaning ${(W.lean * 100).toFixed(1)} cm downwind · leaves flutter about ${(T.sp.flutHz * (0.75 + 0.25 * clamp(P.windSpeed / 3, 0.3, 2.5))).toFixed(1)} Hz when the local wind is strong enough` +
         (tl.loop ? `\nEvery motion completes whole cycles in ${fmtLen(tl.len)}` : '');
  return out;
}
