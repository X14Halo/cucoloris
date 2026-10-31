const water = {sig:'', tex:null, N:0, kappa:0};
function waterSpectrum(P, N) {
  const sig = [P.seed, P.tileSize, P.wavelength, P.slope, P.tail, P.peak, P.directional, P.windDir, P.opposing, P.ripple, N].join('|');
  if (sig === water.sig) return water;
  const L = P.tileSize, r = rng(P.seed * 9781 + 17);
  const kp = 2 * Math.PI / P.wavelength;
  const sExp = 1 + 24 * P.directional * P.directional;
  const th0 = P.windDir * DEG;
  const kr = 2 * Math.PI / 0.025;
  const kcut = Math.min(Math.PI * N / L * 0.8, 2 * Math.PI / 0.005);
  const ktail = kp * (1.5 + 10 * P.tail * P.tail);
  const NN = N * N;
  const Fg = new Float64Array(NN), Fr = new Float64Array(NN), K = new Float64Array(NN);
  let sg = 0, sr = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const nx = i < N / 2 ? i : i - N, ny = j < N / 2 ? j : j - N;
    if (!nx && !ny) continue;
    const kx = 2 * Math.PI * nx / L, ky = 2 * Math.PI * ny / L, k = Math.hypot(kx, ky);
    const th = Math.atan2(ky, kx) - th0;
    const c2 = Math.cos(th / 2) ** 2, s2 = 1 - c2;
    const D = Math.pow(c2, sExp) + P.opposing * Math.pow(s2, sExp);
    const sw = k <= kp ? 0.07 : 0.09;
    const rr = Math.exp(-Math.pow(Math.sqrt(k / kp) - 1, 2) / (2 * sw * sw));
    const cut = Math.exp(-((k / kcut) ** 2));
    const Sg = Math.pow(k, -3) * Math.exp(-1.25 * (kp / k) ** 2) * Math.pow(P.peak, rr) * cut * Math.exp(-((k / ktail) ** 2));
    const Dr = c2 * c2 + 0.3 * P.opposing * s2 * s2;
    // ripples the grid cannot resolve are dropped, not pushed into longer waves: normalise over the uncut band
    const Sr0 = Math.pow(k, -3) * Math.exp(-Math.pow(Math.log(k / kr), 2) / (2 * 0.35 * 0.35));
    const idx = j * N + i;
    Fg[idx] = Sg / k * D; Fr[idx] = Sr0 * cut / k * Dr; K[idx] = k;
    sg += k * k * Fg[idx]; sr += k * k * Sr0 / k * Dr;
  }
  const data = new Float32Array(NN * 4), dataR = new Float32Array(NN * 4);
  let kap = 0;
  const r2 = rng(P.seed * 7193 + 5);
  for (let idx = 0; idx < NN; idx++) {
    const e = 0.5 * (sg > 0 ? P.slope * P.slope * Fg[idx] / sg : 0);
    const er = 0.5 * (sr > 0 && P.ripple > 0 ? P.ripple * P.ripple * Fr[idx] / sr : 0);
    const a = Math.sqrt(e) / Math.SQRT2, ar = Math.sqrt(er) / Math.SQRT2;
    data[idx * 4] = a * gauss(r); data[idx * 4 + 1] = a * gauss(r);
    dataR[idx * 4] = ar * gauss(r2); dataR[idx * 4 + 1] = ar * gauss(r2);
    kap += Math.pow(K[idx], 4) * (e + er) * 2;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const idx = j * N + i, m = ((N - j) % N) * N + ((N - i) % N);
    data[idx * 4 + 2] = data[m * 4]; data[idx * 4 + 3] = data[m * 4 + 1];
    dataR[idx * 4 + 2] = dataR[m * 4]; dataR[idx * 4 + 3] = dataR[m * 4 + 1];
  }
  if (water.tex) gl.deleteTexture(water.tex);
  if (water.texR) gl.deleteTexture(water.texR);
  water.tex = dataTex(N, N, data);
  water.texR = dataTex(N, N, dataR);
  Object.assign(water, {sig, N, kappa:Math.sqrt(kap / 2)});
  return water;
}
function runFFT(spec, N, tag = 'w') {
  let src = spec;
  const a = tgt(tag + 'fa', N, N, 'f32'), b = tgt(tag + 'fb', N, N, 'f32');
  for (const horiz of [1, 0]) {
    for (let sub = 2; sub <= N; sub *= 2) {
      const dst = src === a ? b : a;
      pass(PR.fft, dst, p => { tex(p, 'uSrc', src.tex, 0); i1(p, 'uN', N); i1(p, 'uSub', sub); i1(p, 'uHoriz', horiz); });
      src = dst;
    }
  }
  return src;
}
