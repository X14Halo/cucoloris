/* =====================================================================
   Cucoloris Lab: the Houdini host shim.
   STARTING POINT: written against the host contract and tested logic in
   the web version, but not yet run inside Houdini.

   cucoloris_panel.py injects this, after Qt's qwebchannel.js, before the
   page's own script runs (QWebEngineScript, DocumentCreation). It defines
   window.CUCOLORIS_HOST, whose calls go to the Python object registered
   on the QWebChannel as "cucoloris" (Bridge in cucoloris_panel.py).

   Every Python slot takes and returns strings; returns are JSON
   {"value": …} or {"error": "message"}. See docs/HOUDINI.md.
   ===================================================================== */
(function () {
  let bridge = null;
  // filled from Bridge.config(): {label, exportTemplate, followTimeline}
  let cfg = {label:'Houdini', exportTemplate:'', followTimeline:false};
  const ready = new Promise((resolve, reject) => {
    const connect = () => {
      if (!(window.qt && window.qt.webChannelTransport && window.QWebChannel)) { reject(new Error('QWebChannel is not available: was qwebchannel.js injected?')); return; }
      new QWebChannel(qt.webChannelTransport, ch => {
        bridge = ch.objects.cucoloris;
        bridge.config(out => { try { cfg = {...cfg, ...JSON.parse(out).value}; } catch (e) {} resolve(); });
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect); else connect();
  });
  // call a Python slot: call('shots') → value, or throws with the Python error message
  const call = (name, ...args) => ready.then(() => new Promise((res, rej) => {
    bridge[name](...args.map(a => typeof a === 'string' ? a : JSON.stringify(a)), out => {
      let r; try { r = JSON.parse(out); } catch (e) { rej(new Error(`${name}: bad reply`)); return; }
      r && r.error ? rej(new Error(r.error)) : res(r ? r.value : null);
    });
  }));

  const toB64 = async blob => {
    const u8 = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = b64 => { const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8.buffer; };
  // read a local file: file:// XHR (needs LocalContentCanAccessFileUrls), else through Python
  const readLocal = path => new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', 'file://' + encodeURI(path.replace(/\\/g, '/')));
    x.responseType = 'arraybuffer';
    x.onload = () => (x.status === 0 || x.status === 200) && x.response ? res(x.response) : rej(new Error('cannot read ' + path));
    x.onerror = () => rej(new Error('cannot read ' + path));
    x.send();
  }).catch(() => call('readFile', path).then(fromB64));
  const fileRef = path => ({name:path, arrayBuffer:() => readLocal(path)});

  const fill = (tpl, ctx) => tpl.replace(/\{(\w+)\}/g, (m, k) => {
    const s = ctx.shot || {};
    const v = {seq:s.seq, shot:s.shot, id:s.id, mode:ctx.mode, name:ctx.name}[k];
    return v === undefined || v === null ? 'lib' : String(v);
  });

  window.CUCOLORIS_HOST = {
    name:'houdini',
    get label() { return cfg.label || 'Houdini'; },
    // [{id, seq, shot, label, first, last}]
    shots:() => call('shots'),
    // the shot's utility EXRs and camera, from the pipeline; the tool reads the EXRs itself
    openShot(def) {
      let info = null;
      const getInfo = () => info || (info = call('shotPasses', def.id));
      const src = {
        units:0, upZ:false,
        camera:frame => call('shotCamera', def.id, String(frame)),
        async read(frame, step) {
          // {units, upZ, layers:{pos, nrm, col}, frames:{"1001": [paths], …}}
          const inf = await getInfo();
          src.units = inf.units || 0; src.upZ = !!inf.upZ;
          const files = new Map(Object.entries(inf.frames).map(([k, v]) => [+k, v.map(fileRef)]));
          return window.cucoloris.exrSource(files, inf.layers).read(frame, step);
        },
      };
      return src;
    },
    // e.g. "/shows/{seq}/{shot}/lighting/gobos/{name}" from Bridge.config()
    exportDir:ctx => cfg.exportTemplate ? fill(cfg.exportTemplate, ctx) : '',
    async writeFile(path, blob) { return call('writeFile', path, await toB64(blob)); },
    sendLight:(rig, files) => call('sendLight', {rig, files}),
    frameChanged:frame => { if (cfg.followTimeline) call('setFrame', String(frame)).catch(() => {}); },
  };
})();
