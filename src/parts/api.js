/* =====================================================================
   SCRIPTING API: window.cucoloris
   The same calls the panel makes, for a host (Houdini through a
   QWebChannel bridge), a pipeline script driving a headless browser on
   the farm, or a test. Stable names; docs/HOUDINI.md lists them.
   ===================================================================== */
window.cucoloris = Object.freeze({
  version:'1.0',
  rigVersion:RIG_VERSION, settingsVersion:SETTINGS_VERSION,
  host:() => HOST.name,
  modes:() => Object.keys(MODES),
  shots:() => SHOTLIST.map(d => ({id:d.id, seq:d.seq, shot:d.shot, first:d.first, last:d.last, label:d.label, placeholder:!!d.placeholder})),
  // the pattern ('under', 'over', 'hull', 'trees', 'windows', 'shapes') and the shot ('' for the stand-in sets)
  setMode(m) { if (!MODES[m]) throw new Error(`Unknown pattern "${m}".`); S.mode = m; buildModes(); buildPanel(); buildTimeline(); dirty = true; viewDirty = true; save(); },
  getMode:() => S.mode,
  selectShot(id) { if (id && !shotDef(id)) throw new Error(`No shot "${id}".`); selectShot(id || '', true); },
  shotReady:() => !shotActive() || shotReady(),
  // frame numbers as the export writes them (the shot's own numbers in a shot, otherwise from the first file number)
  getFrame() { const F = EXPORT.frames(); return F.num(F.cur); },
  setFrame(n) {
    const F = EXPORT.frames();
    const f = F.shot ? n : n - ((S.exp.first | 0) - 1);
    S.t = Math.max(0, F.time(f)); dirty = true; viewDirty = true;
  },
  // every setting, as a settings file (a plain object), and back
  getSettings:() => settingsFile(),
  applySettings:o => applySettings(o),
  // the light as it stands, in shot space, and as a USD layer (gobo file paths are filled in by an export)
  lightRig:info => lightRig(info),
  lightRigUSDA:info => rigUSDA(lightRig(info)),
  // render one frame of the final gobo: {w, h, nch, data: Float32Array, linear, rows top to bottom}
  renderFrame(n, res = 1024, opts = {}) {
    if (EXPORT.busy) throw new Error('An export is running.');
    const keep = {res:S.res, t:S.t, quality:S.quality};
    try {
      if (n !== undefined && n !== null) this.setFrame(n);
      S.res = res; if (opts.quality) S.quality = opts.quality;
      return EXPORT.grab(res, opts.channels === 'y' ? 1 : 3);
    } finally {
      S.res = keep.res; S.t = keep.t; S.quality = keep.quality;
      const T = targets.expF; if (T) { gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); delete targets.expF; }
      dirty = true;
    }
  },
  // run an export: any export dialog setting can be given ({fmt, depth, res, range, from, to, first, chans, enc, qual, name, rig, send})
  exportFrames:(opts = {}, onProgress) => EXPORT.run(onProgress, opts),
  cancelExport() { if (EXPORT.busy) document.querySelector('[data-stop]').click(); },
  openExportDialog:() => EXPORT.open(),
  // building blocks for a host's openShot(): a shot read from utility EXRs (see exrSource in parts/shot.js)
  exrSource:(filesByFrame, layers, opts) => exrSource(filesByFrame, layers, opts),
  // the gobo encoders, for a host that writes files its own way: each takes {w, h, nch, data} from renderFrame
  encode:(img, opts) => EXPORT.encode(img, {...EXPORT.DEF, ...opts}),
});
