#!/usr/bin/env python3
"""Light rig test: the exported light must put the gobo exactly where the tool's preview does.

For random points around the light's aim point, the gobo uv the tool's own shader maths gives (in the tool's
metres, Y up) is compared with the uv computed from the exported USD layer alone (in the shot's own units and
up axis). Cases: spot and sun, the stand-in sets, both placeholder shots, and the same shots handed over by a
test host as a Z-up scene in centimetres (as a Houdini scene might be), through window.CUCOLORIS_HOST.

    python3 tests/rig_projection.py [--software] [--browser PATH]
Needs: pip install playwright usd-core numpy
"""
import argparse, sys
import asyncio, os, json, math, numpy as np
from playwright.async_api import async_playwright
from pxr import Usd, UsdGeom, Gf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--browser'); ap.add_argument('--software', action='store_true')
ARGS = ap.parse_args()
SRC = open(os.path.join(ROOT, 'dist', 'cucoloris-lab.html')).read()
TMP = os.path.join(ROOT, 'tests', '.tmp'); os.makedirs(TMP, exist_ok=True)
WORST = [0.0]
ZUP = """<script>
window.CUCOLORIS_HOST = {name:'houdini-test', label:'Test host',
  // the placeholder shots, handed over as a Z-up scene in centimetres (as a Houdini scene might be)
  openShot: def => {
    const web = window.__webOpen(def), cv = p => [p[0] * 100, -p[2] * 100, p[1] * 100], cvd = p => [p[0], -p[2], p[1]];
    return {units:0.01, upZ:true,
      camera: n => ({eye:cv(def.cam.eye), at:cv(def.cam.at), up:[0, 0, 1], vfov:def.cam.vfov}),
      async read(n, step) {
        const g = await web.read(n, step), out = {...g};
        const conv = (pass, f) => { const [x, y, z] = pass.data, N = x.length, a = new Float32Array(N), b = new Float32Array(N), c = new Float32Array(N);
          for (let i = 0; i < N; i++) { const q = f([x[i], y[i], z[i]]); a[i] = q[0]; b[i] = q[1]; c[i] = q[2]; } return {W:pass.W, H:pass.H, data:[a, b, c]}; };
        out.pos = conv(g.pos, cv); out.nrm = conv(g.nrm, cvd);
        return out;
      }};
  }};
</script>"""
async def run(page_html, cases):
    open(os.path.join(TMP, 'page.html'),'w').write('<!doctype html><html><head><meta charset="utf-8"></head><body>' + page_html + '</body></html>')
    async with async_playwright() as p:
        kw = {'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']} if ARGS.software else {}
        if ARGS.browser: kw['executable_path'] = ARGS.browser
        b = await p.chromium.launch(**kw)
        pg = await b.new_page(viewport={'width':1200,'height':800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("try{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.setItem('cucLab.v3', JSON.stringify({res:512,quality:'draft',mode:'trees',view:'scene',ver:10}))}}catch(e){}")
        await pg.goto('file://' + os.path.join(TMP, 'page.html'), timeout=180000)
        for i in range(120):
            if await pg.evaluate("!!window.cucoloris"): break
            await pg.wait_for_timeout(500)
        out=[]
        for shot, mode, ltype in cases:
            await pg.evaluate("([s,m,l]) => { cucoloris.selectShot(s); cucoloris.setMode(m); }", [shot, mode, ltype])
            for i in range(240):
                if await pg.evaluate("cucoloris.shotReady()"): break
                await pg.wait_for_timeout(500)
            await pg.wait_for_timeout(1500)
            # set light type and compute tool-side uv for random points through the exposed internals
            res = await pg.evaluate("""(l) => {
              const c = __cuc.SC(); if (l !== null) { c.ltype = l; c.follow = false; c.real = true; c.roll = 23; }
              const L = __cuc.sceneLight(), G = __cuc.goboProjection(c);
              const pts = [], uv = [];
              let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
              for (let i = 0; i < 200; i++) {
                const p = [L.aim[0] + (rnd() - 0.5) * 6, L.aim[1] + (rnd() - 0.5) * 3, L.aim[2] + (rnd() - 0.5) * 6];
                let q;
                if (c.ltype === 1) { const d = [p[0]-L.aim[0], p[1]-L.aim[1], p[2]-L.aim[2]]; q = [0.5 + (d[0]*L.r[0]+d[1]*L.r[1]+d[2]*L.r[2]) / G.sunSize, 0.5 + (d[0]*L.u[0]+d[1]*L.u[1]+d[2]*L.u[2]) / G.sunSize]; }
                else { const v = [p[0]-L.pos[0], p[1]-L.pos[1], p[2]-L.pos[2]], z = v[0]*L.f[0]+v[1]*L.f[1]+v[2]*L.f[2]; if (z <= 0.01) continue;
                  q = [0.5 + 0.5 * (v[0]*L.r[0]+v[1]*L.r[1]+v[2]*L.r[2]) / (z * G.tanC) * G.rep, 0.5 + 0.5 * (v[0]*L.u[0]+v[1]*L.u[1]+v[2]*L.u[2]) / (z * G.tanC) * G.rep]; }
                pts.push(__cuc.shotSpace().pos(p)); uv.push(q);
              }
              return {pts, uv, usda: cucoloris.lightRigUSDA(), ltype:c.ltype};
            }""", ltype)
            out.append((shot, mode, res))
        if errs: print('page errors', errs); WORST[0] = 1
        await b.close()
        return out
def check(label, res):
    open(os.path.join(TMP, 'rig.usda'),'w').write(res['usda'])
    st = Usd.Stage.Open(os.path.join(TMP, 'rig.usda')); p = st.GetPrimAtPath('/cucoloris/gobo_light')
    M = np.array(UsdGeom.Xformable(p).ComputeLocalToWorldTransform(0))
    X, Y, Z, T = M[0,:3], M[1,:3], M[2,:3], M[3,:3]
    err = 0
    for P, q in zip(res['pts'], res['uv']):
        d = np.array(P) - T
        if p.GetTypeName() == 'DistantLight':
            c = np.array(p.GetAttribute('cucoloris:gobo:center').Get()); w = p.GetAttribute('cucoloris:gobo:width').Get()
            u = 0.5 + np.dot(np.array(P) - c, X) / w; v = 0.5 + np.dot(np.array(P) - c, Y) / w
        else:
            fov = p.GetAttribute('cucoloris:gobo:fov').Get(); til = p.GetAttribute('cucoloris:gobo:tiling').Get()
            x, y, z = np.dot(d, X), np.dot(d, Y), -np.dot(d, Z)
            t = math.tan(math.radians(fov / 2))
            u = 0.5 + 0.5 * (x / z) / t * til; v = 0.5 + 0.5 * (y / z) / t * til
        err = max(err, abs(u - q[0]), abs(v - q[1]))
    WORST[0] = max(WORST[0], err)
    print(f'{'ok  ' if err < 1e-4 else 'FAIL'} {label}: {p.GetTypeName()} upAxis={UsdGeom.GetStageUpAxis(st)} mpu={UsdGeom.GetStageMetersPerUnit(st)} pos={T.round(3)} points={len(res["pts"])} max uv error={err:.2e}')
cases = [('', 'trees', 0), ('', 'windows', 1), ('ph_court_mid', 'trees', 1), ('ph_court_mid', 'trees', 0), ('ph_room', 'windows', None)]
for shot, mode, res in asyncio.run(run(SRC, cases)):
    check(f'web  {shot or "stand-in"} {mode}', res)
# __webOpen: the web host's placeholder source, reached after the page builds it
zsrc = ZUP + SRC.replace("const HOST = Object.assign({}, WEB_HOST,", "window.__webOpen = WEB_HOST.openShot;\nconst HOST = Object.assign({}, WEB_HOST,")
for shot, mode, res in asyncio.run(run(zsrc, cases[2:])):
    check(f'Z-up cm host {shot} {mode}', res)
print('the light rig matches the preview' if WORST[0] < 1e-4 else 'MISMATCH'); sys.exit(0 if WORST[0] < 1e-4 else 1)
