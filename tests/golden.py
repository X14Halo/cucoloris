#!/usr/bin/env python3
"""Golden-frame test: keeps the web version and any production port making the same gobo and the same light.

    python3 tests/golden.py            compare against tests/golden/ref
    python3 tests/golden.py --update   (re)write the references from this build

Every case in tests/golden/cases.json is a settings file (as the tool's "Save settings" writes it) plus
frame numbers. For each, the page renders the final gobo with window.cucoloris.renderFrame and compares it
with the reference EXR, and compares cucoloris.lightRig() with the reference light rig.

GPUs differ in the last bits of floating point maths, so images are compared with a tolerance; a real
change (a moved light, a different pattern, a broken level) shows up far above it.
Needs: pip install playwright && playwright install chromium (or --browser to an existing Chromium).
"""
import argparse, asyncio, base64, json, math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLD = os.path.join(ROOT, 'tests', 'golden')
TOL_MEAN, TOL_P99, TOL_RIG = 0.01, 0.08, 1e-4

JS_RENDER = """async ([settings, frame, res, ref]) => {
  const C = window.cucoloris, E = window.__cuc.EXPORT, X = window.__cuc.EXR;
  await C.applySettings(settings);
  for (let i = 0; i < 400 && window.__cuc.TR && window.__cuc.TR.windPending; i++) await new Promise(r => setTimeout(r, 50));
  const img = C.renderFrame(frame, res, {quality:'draft'});
  const rig = C.lightRig();
  if (!ref) {
    const exr = new Uint8Array(await (await E.writeEXR(img, 'half')).arrayBuffer());
    let s = ''; for (let i = 0; i < exr.length; i += 8192) s += String.fromCharCode.apply(null, exr.subarray(i, i + 8192));
    return {exr:btoa(s), rig};
  }
  const bin = atob(ref), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const e = X.open(u8.buffer), L = X.layers(e)[0];
  const names = img.nch === 1 ? ['Y'] : ['R', 'G', 'B'];
  const chans = await X.read(e, L.part, names.map(n => L.comps.find(c => c.comp === n).full), 1);
  const d = [];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) for (let c = 0; c < img.nch; c++)
    d.push(Math.abs(img.data[(y * img.w + x) * img.nch + c] - chans.data[c][y * img.w + x]));
  d.sort((a, b) => a - b);
  return {mean:d.reduce((a, b) => a + b, 0) / d.length, p99:d[Math.floor(d.length * 0.99)], max:d[d.length - 1], rig};
}"""

def rig_diff(a, b, path=''):
    """largest numeric difference between two light rigs (gobo file lists and tool info ignored)"""
    if isinstance(a, dict):
        return max([rig_diff(a[k], b.get(k), path + '.' + k) for k in a if k not in ('files', 'tool', 'settings', 'frameRange')] or [0])
    if isinstance(a, list):
        if not isinstance(b, list) or len(a) != len(b): return math.inf
        return max([rig_diff(x, y, path) for x, y in zip(a, b)] or [0])
    if isinstance(a, (int, float)) and not isinstance(a, bool):
        return abs(a - b) if isinstance(b, (int, float)) else math.inf
    return 0 if a == b else math.inf

async def main(args):
    from playwright.async_api import async_playwright
    cases = json.load(open(os.path.join(GOLD, 'cases.json')))
    page = os.path.abspath(args.page)
    failed = 0
    async with async_playwright() as p:
        kw = {'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']} if args.software else {}
        if args.browser: kw['executable_path'] = args.browser
        b = await p.chromium.launch(**kw)
        pg = await b.new_page(viewport={'width': 1000, 'height': 700})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        # start from defaults, on the gobo view, paused
        await pg.add_init_script("try{localStorage.clear(); localStorage.setItem('cucLab.v3', JSON.stringify({res:256, quality:'draft', view:'gobo', ver:10}))}catch(e){}")
        await pg.goto('file://' + page)
        await pg.wait_for_function('!!window.cucoloris', timeout=120000)
        await pg.evaluate('window.__cuc.S.playing = false')
        for case in cases:
            settings = json.load(open(os.path.join(GOLD, case['settings'])))
            for fr in case['frames']:
                key = f"{case['name']}.{fr}"
                exr_path, rig_path = os.path.join(GOLD, 'ref', key + '.exr'), os.path.join(GOLD, 'ref', key + '.rig.json')
                ref = None if args.update else base64.b64encode(open(exr_path, 'rb').read()).decode()
                r = await pg.evaluate(JS_RENDER, [settings, fr, case.get('res', 256), ref])
                if args.update:
                    os.makedirs(os.path.dirname(exr_path), exist_ok=True)
                    open(exr_path, 'wb').write(base64.b64decode(r['exr']))
                    json.dump(r['rig'], open(rig_path, 'w'), indent=1)
                    print(f'wrote {key}')
                    continue
                rd = rig_diff(json.load(open(rig_path)), r['rig'])
                ok = r['mean'] <= TOL_MEAN and r['p99'] <= TOL_P99 and rd <= TOL_RIG
                failed += not ok
                print(f"{'ok  ' if ok else 'FAIL'} {key:28s} image mean {r['mean']:.5f}  p99 {r['p99']:.5f}  max {r['max']:.4f}  light rig {rd:.2e}")
        if errors: print('page errors:', *errors, sep='\n  '); failed += 1
        await b.close()
    if not args.update: print('all frames match' if not failed else f'{failed} failed')
    return 1 if failed else 0

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--update', action='store_true')
    ap.add_argument('--page', default=os.path.join(ROOT, 'index.html'))
    ap.add_argument('--browser', help='path to a Chromium or Chrome executable')
    ap.add_argument('--software', action='store_true', help='render with SwiftShader (machines without a GPU)')
    sys.exit(asyncio.run(main(ap.parse_args())))
