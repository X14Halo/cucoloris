/* =====================================================================
   LIGHT RIG + SETTINGS FILES
   What an export hands to a 3D app besides the gobo images:
   · lightRig()        the scene light, in the shot's own units and up axis,
                       with exactly how the gobo is projected (renderer-neutral)
   · rigUSDA(rig)      the same as a USD layer: one UsdLux light with the
                       gobo described in cucoloris:* attributes
   · settingsFile()    every setting needed to make the same gobo again
                       (pattern, levels, timeline, light, paint layers);
                       applySettings() reads one back
   docs/HOUDINI.md explains each field and how a TD maps it onto a light.
   ===================================================================== */
const RIG_VERSION = 1, SETTINGS_VERSION = 1, TOOL_NAME = 'Cucoloris Lab';

/* The tool works in metres with Y up. A shot keeps its own units and axes: the shot's passes were
   scaled by um (metres per scene unit) and, for a Z-up scene, turned (x, y, z) → (x, z, -y). */
function shotSpace() {
  const fr = shotActive() && SHOT.frame, um = fr ? fr.um || 1 : 1, upZ = !!(fr && SHOT.src && SHOT.src.upZ);
  const dir = v => upZ ? [v[0], -v[2], v[1]] : [v[0], v[1], v[2]];
  return {um, upZ, upAxis:upZ ? 'Z' : 'Y', dir, pos:p => dir(p).map(x => x / um), len:l => l / um,
          label:fr ? 'shot world space' : 'the stand-in set (metres, Y up)'};
}
const r6 = v => Math.round(v * 1e6) / 1e6;
const r6v = a => a.map(r6);

/* info: {files:[{frame, path}], pattern, hashPattern, format, depth, colorSpace, channels, res, fps, settingsPath} */
function lightRig(info = {}) {
  const c = SC(), L = sceneLight(), G = goboProjection(c), sp = shotSpace(), sun = c.ltype === 1;
  const def = shotActive() ? shotDef(S.shotSel) : null;
  // light axes: +X right and +Y up across the gobo image, light shines down -Z (the USD / Houdini convention)
  const X = sp.dir(L.r), Y = sp.dir(L.u), Z = sp.dir(v3.mul(L.f, -1)), T = sp.pos(L.pos);
  const matrix = [[...X, 0], [...Y, 0], [...Z, 0], [...T, 1]].map(r6v);
  const dist = c.dist, ev = c.ev, col = hex3(c.color);
  const wrap = ['repeat', 'white', 'black', 'repeat-u'][G.single];
  const files = info.files || [];
  const frames = files.map(f => f.frame);
  return {
    schema:'cucoloris.lightrig', version:RIG_VERSION,
    tool:{name:TOOL_NAME, host:HOST.name, stateVersion:10},
    shot:def ? {id:def.id, seq:def.seq, shot:def.shot, first:def.first, last:def.last, placeholder:!!def.placeholder} : null,
    space:{upAxis:sp.upAxis, metersPerUnit:sp.um, note:`Positions are in ${sp.label}.`},
    mode:S.mode, pattern:MODES[S.mode].short,
    light:{
      type:sun ? 'distant' : 'spot',
      position:r6v(T), aim:r6v(sp.pos(L.aim)),
      right:r6v(X), up:r6v(Y), forward:r6v(sp.dir(L.f)),
      matrix,                                                           // row-major, row vectors: x axis, y axis, z axis, translation
      distanceToAim:r6(sp.len(dist)),
      ...(sun ? {angle:0.53} : {
        coneAngle:r6(G.cone),                                           // full angle the square image spans, edge to edge
        coneShape:c.shape ? 'square' : 'round',
        coneSoftness:r6(c.soft),                                        // fraction of the beam radius the edge fades over
        sourceRadius:r6(sp.len(0.04)),
      }),
      exposure:r6(ev), color:r6v(col),
      irradianceAtAim:r6(Math.pow(2, ev) * (sun ? 1 : 25 / Math.max(dist * dist, 1e-6))),   // in the tool's preview units, on a surface facing the light
    },
    gobo:{
      files, frameRange:frames.length ? [Math.min(...frames), Math.max(...frames)] : null,
      pattern:info.pattern || null, hashPattern:info.hashPattern || null, fps:info.fps || S.fps,
      format:info.format || null, bitDepth:info.depth || null, colorSpace:info.colorSpace || 'linear', channels:info.channels || 'rgb', resolution:info.res || null,
      projection:sun ? {kind:'orthographic', width:r6(sp.len(G.sunSize)), center:r6v(sp.pos(L.aim))}
                     : {kind:'perspective', fov:r6(G.cone), tiling:r6(G.rep)},
      wrap,
      blur:r6(c.blur / 100),                                            // defocus as a fraction of the image width
      imageAxes:'Image left to right runs along the light +X axis, bottom to top along +Y. A pixel at uv (0..1, v up) lands where the light-space direction (x, y, -1) has x = (2u - 1) * tan(fov / 2) / tiling, y = (2v - 1) * tan(fov / 2) / tiling.',
    },
    settings:info.settingsPath || null,
  };
}

/* ---------- USD ---------- */
const usdStr = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const usdAsset = s => '@' + String(s).replace(/@/g, '') + '@';
const usdNum = v => { const s = (+v).toPrecision(9); return String(parseFloat(s)); };
const usdTup = a => '(' + a.map(usdNum).join(', ') + ')';
function rigUSDA(rig) {
  const L = rig.light, G = rig.gobo, sun = L.type === 'distant';
  const fr = G.frameRange, files = G.files || [];
  const lines = [];
  const add = s => lines.push(s);
  add('#usda 1.0');
  add('(');
  add(`    defaultPrim = "cucoloris"`);
  add(`    doc = ${usdStr(`${TOOL_NAME} light rig: ${rig.pattern} gobo${rig.shot ? ` for ${rig.shot.seq} / ${rig.shot.shot}` : ''}. The gobo is described in the cucoloris:* attributes; docs/HOUDINI.md says how to hook them up to your renderer's gobo / cookie filter.`)}`);
  add(`    metersPerUnit = ${usdNum(rig.space.metersPerUnit)}`);
  add(`    upAxis = "${rig.space.upAxis}"`);
  if (fr) { add(`    startTimeCode = ${fr[0]}`); add(`    endTimeCode = ${fr[1]}`); }
  add(`    framesPerSecond = ${usdNum(G.fps)}`);
  add(`    timeCodesPerSecond = ${usdNum(G.fps)}`);
  add(')');
  add('');
  add('def Xform "cucoloris" (');
  add('    customData = {');
  add(`        string tool = ${usdStr(TOOL_NAME)}`);
  add(`        int rigVersion = ${rig.version}`);
  add(`        string host = ${usdStr(rig.tool.host)}`);
  if (rig.shot) add(`        string shot = ${usdStr(rig.shot.seq + '/' + rig.shot.shot)}`);
  add('    }');
  add(')');
  add('{');
  if (sun) add('    def DistantLight "gobo_light"');
  else { add('    def SphereLight "gobo_light" ('); add('        prepend apiSchemas = ["ShapingAPI"]'); add('    )'); }
  add('    {');
  add('        float inputs:intensity = 1');
  add(`        float inputs:exposure = ${usdNum(L.exposure)}`);
  add(`        color3f inputs:color = ${usdTup(L.color)}`);
  if (sun) add(`        float inputs:angle = ${usdNum(L.angle)}`);
  else {
    add(`        float inputs:radius = ${usdNum(L.sourceRadius)}`);
    // a square beam has no USD equivalent: open the cone to the image corners and let the gobo's edges trim it
    const half = L.coneShape === 'square' ? Math.atan(Math.tan(L.coneAngle / 2 * DEG) * Math.SQRT2) / DEG : L.coneAngle / 2;
    add(`        float inputs:shaping:cone:angle = ${usdNum(half)}`);
    add(`        float inputs:shaping:cone:softness = ${usdNum(L.coneSoftness)}`);
  }
  add(`        matrix4d xformOp:transform = ( ${L.matrix.map(usdTup).join(', ')} )`);
  add('        uniform token[] xformOpOrder = ["xformOp:transform"]');
  add('');
  // the gobo, renderer-neutral
  if (files.length) {
    add(`        custom asset cucoloris:gobo:file = ${usdAsset(files[0].path)}`);
    if (files.length > 1) {
      add('        custom asset cucoloris:gobo:file.timeSamples = {');
      for (const f of files) add(`            ${f.frame}: ${usdAsset(f.path)},`);
      add('        }');
    }
  }
  if (G.pattern) add(`        custom string cucoloris:gobo:filePattern = ${usdStr(G.pattern)}`);
  if (G.hashPattern) add(`        custom string cucoloris:gobo:fileHashPattern = ${usdStr(G.hashPattern)}`);
  if (fr) add(`        custom int2 cucoloris:gobo:frameRange = (${fr[0]}, ${fr[1]})`);
  add(`        custom token cucoloris:gobo:colorSpace = ${usdStr(G.colorSpace)}`);
  add(`        custom token cucoloris:gobo:projection = ${usdStr(G.projection.kind)}`);
  if (sun) {
    add(`        custom float cucoloris:gobo:width = ${usdNum(G.projection.width)}`);
    add(`        custom point3d cucoloris:gobo:center = ${usdTup(G.projection.center)}`);
  } else {
    add(`        custom float cucoloris:gobo:fov = ${usdNum(G.projection.fov)}`);
    add(`        custom float cucoloris:gobo:tiling = ${usdNum(G.projection.tiling)}`);
    add(`        custom token cucoloris:beamShape = ${usdStr(L.coneShape)}`);
  }
  add(`        custom token cucoloris:gobo:wrap = ${usdStr(G.wrap)}`);
  add(`        custom float cucoloris:gobo:blur = ${usdNum(G.blur)}`);
  add(`        custom point3d cucoloris:aim = ${usdTup(L.aim)}`);
  add(`        custom float cucoloris:irradianceAtAim = ${usdNum(L.irradianceAtAim)}`);
  add(`        custom string cucoloris:mode = ${usdStr(rig.mode)}`);
  if (rig.settings) add(`        custom asset cucoloris:settings = ${usdAsset(rig.settings)}`);
  add('    }');
  add('}');
  return lines.join('\n') + '\n';
}

/* ---------- settings: everything needed to make the same gobo again ---------- */
const plain = o => JSON.parse(JSON.stringify(o, (k, v) => k.startsWith('_') ? undefined : v));
function settingsFile() {
  const m = S.mode, def = shotActive() ? shotDef(S.shotSel) : null;
  const layer = (T, used) => (T && used) ? T.cv.toDataURL('image/png') : null;
  const usesOwn = MODES[m].kind === 'shapes' && S.p[m].paintMode;
  const ov = OVL[m] || null;
  return {
    schema:'cucoloris.settings', version:SETTINGS_VERSION,
    savedWith:{tool:TOOL_NAME, host:HOST.name, stateVersion:10, date:new Date().toISOString()},
    mode:m, fps:S.fps,
    pattern:plain(S.p[m]), levels:plain(S.post[m]), timeline:plain(S.tl[m]),
    light:plain(SC()), lightSpace:'tool (metres, Y up)',
    shot:def ? {id:def.id, seq:def.seq, shot:def.shot} : null,
    paintOver:{on:!!(S.ovl.on || {})[m], image:layer(ov, ov && ov.used)},
    paintYourOwn:usesOwn ? {image:layer(paintCanvas(), true)} : null,
    export:plain(S.exp || {}),
  };
}
async function applySettings(o) {
  if (typeof o === 'string') o = JSON.parse(o);
  if (!o || o.schema !== 'cucoloris.settings') throw new Error('This is not a Cucoloris Lab settings file.');
  if (o.version > SETTINGS_VERSION) throw new Error(`This settings file is version ${o.version}; this copy of the tool reads up to ${SETTINGS_VERSION}.`);
  const m = o.mode;
  if (!MODES[m]) throw new Error(`Unknown pattern "${m}".`);
  if (o.shot && o.shot.id !== S.shotSel && shotDef(o.shot.id)) {
    selectShot(o.shot.id);
    // the shot's light exists once its passes are read
    for (let i = 0; i < 300 && !shotReady(); i++) await new Promise(r => setTimeout(r, 100));
  }
  S.mode = m;
  S.p[m] = {...DEFAULTS[m], ...(o.pattern || {})};
  S.post[m] = {...MODES[m].post, ...(o.levels || {})};
  S.tl[m] = {...MODES[m].tl, ...(o.timeline || {})};
  if (o.fps) S.fps = o.fps;
  if (o.light) Object.assign(SC(), o.light);
  if (o.export) S.exp = {...S.exp, ...o.export};
  const draw = (T, url) => new Promise(res => { const im = new Image(); im.onload = () => { T.ctx.drawImage(im, 0, 0, T.N, T.N); T.dirty = true; T.used = true; paintSave(T); res(); }; im.onerror = res; im.src = url; });
  if (o.paintOver) {
    S.ovl.on = {...(S.ovl.on || {}), [m]:!!o.paintOver.on};
    if (o.paintOver.image) await draw(ovlTarget(m), o.paintOver.image);
  }
  if (o.paintYourOwn && o.paintYourOwn.image) await draw(paintCanvas(), o.paintYourOwn.image);
  buildModes(); buildPanel(); buildTimeline();
  dirty = true; viewDirty = true; save();
  return true;
}
