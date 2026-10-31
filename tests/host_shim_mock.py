#!/usr/bin/env python3
"""Exercises houdini/cucoloris_host.js against a mock of the Python bridge, in a browser, without Houdini.

What it proves: with the shim in place, the tool lists the pipeline's shots, reads a shot from utility EXRs on
disk (P / N / albedo layers) with the camera handed over as a USD-style matrix, writes the export through
writeFile, and calls sendLight with a light rig whose light sits where the web version puts it.
What it cannot prove: anything about Qt, QWebChannel or hou themselves (that needs Houdini).

    python3 tests/host_shim_mock.py [--software] [--browser PATH]
Needs: pip install playwright OpenEXR numpy usd-core
"""
import argparse, asyncio, base64, json, os, sys
import numpy as np, OpenEXR
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, 'tests', '.tmp', 'shim'); os.makedirs(TMP, exist_ok=True)
ap = argparse.ArgumentParser(); ap.add_argument('--browser'); ap.add_argument('--software', action='store_true')
ARGS = ap.parse_args()
PAGE = open(os.path.join(ROOT, 'dist', 'cucoloris-lab.html')).read()
SHIM = open(os.path.join(ROOT, 'houdini', 'cucoloris_host.js')).read()

def launch_kw():
    kw = {'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']} if ARGS.software else {}
    if ARGS.browser: kw['executable_path'] = ARGS.browser
    return kw

async def open_page(p, html):
    path = os.path.join(TMP, 'page.html'); open(path, 'w').write('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>')
    b = await p.chromium.launch(**launch_kw()); pg = await b.new_page(viewport={'width': 1000, 'height': 700})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("try{localStorage.clear(); localStorage.setItem('cucLab.v3', JSON.stringify({res:256, quality:'draft', view:'gobo', ver:10}))}catch(e){}")
    return b, pg, path, errs

async def main():
    async with async_playwright() as p:
        # 1. the web version: the placeholder courtyard's utility passes and where its light lands
        b, pg, path, errs = await open_page(p, PAGE)
        await pg.goto('file://' + path); await pg.wait_for_function('!!window.cucoloris', timeout=120000)
        await pg.evaluate("cucoloris.selectShot('ph_court_mid')"); await pg.wait_for_function('cucoloris.shotReady()', timeout=240000)
        await pg.wait_for_timeout(1000)
        web_rig = await pg.evaluate('cucoloris.lightRig()')
        passes = await pg.evaluate("""async () => { const g = await __cuc.SHOT.src.read(1001, 2), out = {};
          const enc = a => { const u8 = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
          for (const k of ['pos', 'nrm', 'col']) out[k] = {W:g[k].W, H:g[k].H, data:g[k].data.map(enc)};
          return out; }""")
        await b.close()
        W, H = passes['pos']['W'], passes['pos']['H']
        ch = {}
        for k, layer in (('pos', 'P'), ('nrm', 'N'), ('col', 'albedo')):
            for c, comp in enumerate('RGB'):
                ch[f'{layer}.{comp}'] = np.frombuffer(base64.b64decode(passes[k]['data'][c]), dtype='<f4').reshape(H, W).copy()
        exr = os.path.join(TMP, 'court010_sh0020_utility.1001.exr')
        OpenEXR.File({'compression': OpenEXR.ZIP_COMPRESSION, 'type': OpenEXR.scanlineimage}, ch).write(exr)
        # the shot camera as a pipeline would hand it over: a world matrix (rows: x, y, z axes, translation) and a vertical FOV
        eye, at = np.array([0.8, 1.48, 2.15]), np.array([0.0, 1.3, 0.0])
        f = (at - eye) / np.linalg.norm(at - eye); r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r); u = np.cross(r, f)
        cam = {'matrix': [[*r, 0], [*u, 0], [*(-f), 0], [*eye, 1]], 'vfov': 30}

        # 2. the same page with the Houdini shim and a mock bridge
        out_root = os.path.join(TMP, 'shows')
        mock = """<script>
window.qt = {webChannelTransport:{}};
window.QWebChannel = function (transport, cb) { setTimeout(() => cb({objects:{cucoloris:MOCK}}), 0); };
const R = v => JSON.stringify({value:v});
const MOCK = {
  config: cb => cb(R({label:'Houdini (mock)', exportTemplate:%(out)s + '/{seq}/{shot}/lighting/gobos/{name}', followTimeline:true})),
  // the same optional starting set-up the placeholder courtyard carries, so the two can be compared
  shots: cb => cb(R([{id:'court010_sh0020', seq:'court010', shot:'sh0020', label:'court010 / sh0020', first:1001, last:1001, mode:'trees',
                      preset:{mode:'trees', name:'Oak canopy overhead', v:{framing:1, tileSize:15.5, leafDensity:0.45, elemSize:0.75}},
                      lights:{trees:{ltype:1, follow:true, aim:[0, 1.35, 0], amb:0.2}}}])),
  shotPasses: (id, cb) => cb(R({units:1, upZ:false, layers:{pos:'P', nrm:'N', col:'albedo'}, frames:{'1001':[%(exr)s]}})),
  shotCamera: (id, frame, cb) => cb(R(%(cam)s)),
  readFile: (path, cb) => window.pyRead(path).then(b => cb(R(b))),
  writeFile: (path, b64, cb) => window.pyWrite(path, b64).then(() => cb(R(path))),
  sendLight: (payload, cb) => { window.__sent = JSON.parse(payload); cb(R(true)); },
  setFrame: (n, cb) => { (window.__frames = window.__frames || []).push(+n); if (cb) cb(R(true)); },
};
</script><script>%(shim)s</script>""" % {'out': json.dumps(out_root), 'exr': json.dumps(exr), 'cam': json.dumps(cam), 'shim': SHIM}
        b, pg, path, errs = await open_page(p, mock + PAGE)
        written = {}
        async def py_read(pth): return base64.b64encode(open(pth, 'rb').read()).decode()
        async def py_write(pth, b64):
            os.makedirs(os.path.dirname(pth), exist_ok=True); data = base64.b64decode(b64); open(pth, 'wb').write(data); written[pth] = len(data)
        await pg.expose_function('pyRead', py_read); await pg.expose_function('pyWrite', py_write)
        await pg.goto('file://' + path); await pg.wait_for_function('!!window.cucoloris', timeout=120000)
        await pg.wait_for_function('cucoloris.shots().length > 0', timeout=30000)
        print('host', await pg.evaluate('cucoloris.host()'), '· shots', await pg.evaluate('cucoloris.shots().map(s => s.id)'))
        await pg.evaluate("cucoloris.selectShot('court010_sh0020')"); await pg.wait_for_function('cucoloris.shotReady()', timeout=240000)
        await pg.wait_for_timeout(1000)
        status = await pg.evaluate("__cuc.SHOT.status")
        rig = await pg.evaluate('cucoloris.lightRig()')
        r = await pg.evaluate("cucoloris.exportFrames({res:256, qual:'draft', fmt:'exr', depth:'half', range:'range', from:1, to:2, rig:'on', send:'on'}).then(r => ({written:r.written, dir:r.dir, sent:r.sent}))")
        sent = await pg.evaluate('window.__sent')
        frames = await pg.evaluate('window.__frames || []')
        await pg.screenshot(path=os.path.join(TMP, 'shim_scene.png'))
        await b.close()

    ok = True
    def check(cond, msg):
        nonlocal_ok[0] &= bool(cond); print(('ok   ' if cond else 'FAIL ') + msg)
    nonlocal_ok = [True]
    check('Shot camera from the pipeline' in status, 'the shot camera came from the host: ' + status.split('\n')[-1])
    d = max(abs(a - b) for a, b in zip(rig['light']['position'], web_rig['light']['position']))
    check(d < 2e-3, f'the light sits where the web version puts it (largest difference {d:.2e} m)')
    check(r['written'] == 2 and r['sent'], f"export wrote {r['written']} frames to {r['dir']} and sent the light")
    check(len(written) == 4 and any(k.endswith('.light.usda') for k in written), 'files written through writeFile: ' + ', '.join(os.path.basename(k) for k in sorted(written)))
    check(sent and sent['files']['usd'].startswith(out_root), 'sendLight got the rig and absolute paths')
    from pxr import Usd
    st = Usd.Stage.Open(sent['files']['usd']); a = st.GetPrimAtPath('/cucoloris/gobo_light').GetAttribute('cucoloris:gobo:file')
    check(a.GetTimeSamples() == [1001.0, 1002.0] and a.Get(1002).path.startswith(out_root), 'the USD layer points at the written frames, per frame')
    check(len(frames) > 0, f'frameChanged reached the bridge ({frames[-1] if frames else "-"})')
    if errs: check(False, 'page errors: ' + '; '.join(errs))
    print('the shim works against the mock bridge' if nonlocal_ok[0] else 'SHIM TEST FAILED')
    return 0 if nonlocal_ok[0] else 1

sys.exit(asyncio.run(main()))
