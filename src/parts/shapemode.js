/* ---------- Shapes: breakup patterns for adding interest to lights ---------- */
// index = shader id; the dropdown lists the organic family first
// index = shader id. The menu lists soft noise first: very soft organic shapes that come and go slowly, for
// adding interest to a key light without drawing the eye; then the shafts and beams.
const SHAPES = ['Light shafts (fan)', 'Curtain shafts', 'Parallel beams', 'Ragged streaks', 'Splotches', 'Cucoloris board', 'Water reflection shimmer', 'Soft spots', 'Art deco fan',
                'Soft blobs', 'Leafy breakup', 'Soft mottling', 'Dappled holes', 'Branches & leaves', 'Paint your own',
                'Soft clouds', 'Billows', 'Pools that come and go', 'Marbled flow', 'Uneven wash'];
const SHAPE_ORDER = [9, 15, 11, 16, 17, 18, 19, 7, 0, 1, 2];
const SHAPE_SEAMLESS = [false, false, false, true, true, true, true, true, false, true, true, true, true, true, true, true, true, true, true, true];
const ORGANIC = new Set([9, 10, 11, 12, 13]);
const SOFTNOISE = new Set([7, 9, 11, 15, 16, 17, 18, 19]);
const DIRS = ['Vertical', 'Diagonal ╲', 'Horizontal', 'Diagonal ╱'];
// quick starting points for the motion; each sets every motion control
const MOTION_OFF = {sway:0, flutter:0, drift:0, gust:0, flow:0, morph:0, breath:0, blend:0};
const MOTION_LOOKS = [
  ['Still', {...MOTION_OFF}],
  ['Slow morph', {...MOTION_OFF, blend:0.5, blendT:8, flow:0.1}],
  ['Lively morph', {...MOTION_OFF, blend:0.8, blendT:3, flow:0.2, morph:0.1}],
  ['Drifting', {...MOTION_OFF, drift:0.15, gust:0.3, blend:0.3, blendT:10}],
  ['Slow swirl', {...MOTION_OFF, flow:0.5, morph:0.06}],
  ['Evolving', {...MOTION_OFF, morph:0.2, flow:0.2}],
];
MODES.shapes = {
  short:'Shapes', kind:'shapes', tileable:true, tl:{loop:true, len:10, shutter:0},
  onParam(k, P) {
    if (k === 'paintMode') { if (P.paintMode) { if ((P.shape | 0) !== 14) P.prevShape = P.shape; P.shape = 14; } else P.shape = P.prevShape ?? 9; return true; }
    if (k === 'pbPool') { P.framing = P.pbPool ? 1 : 0; return true; }
    if (k === 'blend') { const on = (P.blend ?? 0) > 0, ch = on !== this._blendOn; this._blendOn = on; return ch; } return k === 'shape' || k === 'framing' || k === 'stretch' || k === 'pbTool' || k === 'drift'; },
  get tileableNow() { const P = S.p.shapes; return SHAPE_SEAMLESS[P.shape | 0] && (P.framing | 0) === 0; },
  get groups() {
    const P = S.p.shapes, sh = P.shape | 0;
    this._blendOn = (P.blend ?? 0) > 0;
    P.paintMode = sh === 14; P.pbPool = (P.framing | 0) === 1;
    const fan = sh === 0 || sh === 1, beams = sh === 2, soft = SOFTNOISE.has(sh), paint = sh === 14;
    const g = [
      {k:'framing', l:'Framing', opts:['As designed' + (SHAPE_SEAMLESS[sh] ? ' (seamless tile)' : ''), 'Light pool, dark edges'], h:'A light pool lets light through only in the middle of the frame, fading softly to black toward the edges.'},
      {k:'shape', l:'Shape', opts:SHAPE_ORDER.map(i => SHAPES[i]), vals:SHAPE_ORDER},
    ];
    if ((P.framing | 0) === 1) g.push({k:'poolSize', l:'Pool size', min:0.3, max:1.4, step:0.01}, {k:'poolSoft', l:'Pool edge softness', min:0.05, max:1, step:0.01});
    g.push({k:'blur', l:'Blur', min:0, max:20, step:0.05, u:'%', h:'Defocus of the whole gobo, as a percentage of its width. Soft noise usually wants several percent.'});
    const look = [];
    if (soft) {
      look.push(
        {k:'scale', l:sh === 19 ? 'Unevenness across' : sh === 17 || sh === 7 ? 'Pools across' : sh === 18 ? 'Bands across' : 'Shapes across', min:1, max:16, step:1, h:'How many main shapes fit across the tile. Whole numbers keep it seamless.'},
        {k:'amount', l:sh === 19 ? 'Brightness' : sh === 17 || sh === 7 ? 'Pool size' : 'Light coverage', min:0.05, max:0.95, step:0.01, h:'How much of the frame is lit.'},
        {k:'soft', l:'Softness', min:0, max:1, step:0.01, h:'How gradually light turns to shadow. Near 1 the shapes are just gentle swells of light.'},
        {k:'darkest', l:'Darkest shadow', min:0, max:0.9, step:0.01, h:'Lifts the shadows so the pattern only modulates the light rather than cutting it. 0.3–0.6 keeps it subtle on a character.'},
      );
      if (sh !== 17 && sh !== 7) look.push(
        {k:'brk', l:'Detail', min:0, max:1, step:0.01, h:'How many finer layers of noise sit on top of the main shapes.'},
        {k:'rough', l:'Roughness', min:0.2, max:0.8, step:0.01, h:'How strong each finer layer is. Low keeps the shapes smooth and broad; high makes them busier.'},
      );
      look.push({k:'warp', l:sh === 18 ? 'Swirl' : 'Flow distortion', min:0, max:1.5, step:0.01, h:'Swirls the shapes into flowing, organic forms.'});
      if (sh === 9 || sh === 11 || sh === 15) look.push({k:'clump', l:'Clumping', min:0, max:1.5, step:0.01, h:'Gathers the shapes into clusters with larger open gaps between them.'});
      if (sh === 17 || sh === 7) look.push({k:'wVar', l:'Variation', min:0, max:1, step:0.01, h:'How much the pools differ in size and brightness.'});
      if (sh !== 17 && sh !== 7 && sh !== 18) look.push({k:'stretch', l:'Stretch', min:1, max:5, step:1, fmt:v => v + '×', h:'Elongates the shapes, for streaky light.'});
      if ((P.stretch || 1) > 1 && sh !== 17 && sh !== 7 || sh === 18) look.push({k:'dir', l:sh === 18 ? 'Band direction' : 'Stretch direction', opts:DIRS});
    }
    if (fan || beams) look.push(
      {k:'count', l:fan ? 'Number of shafts' : 'Number of beams', min:1, max:40, step:1},
      ...(fan ? [{k:'spread', l:'Fan angle', min:5, max:150, step:0.5, u:'°'}, {k:'apexX', l:'Source position', min:-0.6, max:0.6, step:0.01, h:'Where the light comes from, left to right above the frame.'}, {k:'apexY', l:'Source height above frame', min:0, max:2, step:0.01, h:'0 puts the source at the top edge; larger values make the shafts more parallel.'}] : [{k:'angle', l:'Angle', min:-90, max:90, step:0.5, u:'°'}]),
      {k:'width', l:'Width (fill)', min:0.05, max:0.98, step:0.01, h:'How much of the gap between shafts each one fills.'},
      {k:'wVar', l:'Irregularity', min:0, max:1, step:0.01, h:'Variation in width, spacing and brightness from shaft to shaft.'},
      {k:'soft', l:'Edge softness', min:0, max:1, step:0.01},
      {k:'fall', l:'Fade along length', min:0, max:1, step:0.01},
      {k:'brk', l:'Haze breakup', min:0, max:1, step:0.01, h:'Streaky texture inside each shaft, as dust and haze give real light shafts.'},
    );
    // painting has its own section: switching it on sets the generated shapes aside
    const pp = [{k:'paintMode', l:'Paint your own gobo', type:'chk', h:'Turn on to paint the gobo yourself, on the canvas here, on the Gobo preview or right where the light lands in the Scene view. The generated shapes are set aside while it is on.'}];
    if (paint) pp.push(
      {k:'blur', l:'Blur', min:0, max:20, step:0.05, u:'%', h:'Defocus of the whole painted gobo, as a percentage of its width.'},
      {k:'pbPool', l:'Light pool, dark edges', type:'chk', h:'Frames the painting in a soft pool of light that fades to black at the edges.'},
      ...((P.framing | 0) === 1 ? [{k:'poolSize', l:'Pool size', min:0.3, max:1.4, step:0.01}, {k:'poolSoft', l:'Pool edge softness', min:0.05, max:1, step:0.01}] : []),
      ...paintDefs());
    const out = [{name:'Paint your own', params:pp, first:true}, {name:'Shape', params:g, off:paint}];
    if (look.length) out.push({name:'Look', params:look, off:paint});
    if (fan || beams) out.push({name:'Motion', params:[
      {k:'motion', l:'Shimmer', min:0, max:1, step:0.01, h:'Each shaft slowly brightens and dims on its own and wavers a touch, with dust drifting through it.'},
      {k:'shimSpd', l:'Shimmer speed', min:0.1, max:4, step:0.01, log:true, fmt:v => v.toFixed(2) + '×'},
    ]});
    else {
      const bl = (P.blend ?? 0) > 0 && sh !== 17 && sh !== 7;
      out.push({name:'Motion', params:[
        {type:'buttons', items:MOTION_LOOKS.map(([n, v]) => [n, () => { Object.assign(S.p.shapes, v); buildPanel(); changed(); }])},
        {k:'mSpeed', l:'Overall speed', min:0.1, max:20, step:0.01, log:true, fmt:v => v.toFixed(2) + '×', h:'Scales every motion below together.'},
        ...(sh !== 17 && sh !== 7 && !paint ? [{k:'blend', l:'Morph', min:0, max:1, step:0.01, h:'The pattern keeps morphing into new versions of itself, shifted by random offsets: shapes stretch, merge and split into the next arrangement, so it stays the same kind of light but never repeats. Higher values make each new version more different.'}] : []),
        ...(bl ? [{k:'blendT', l:'Time per morph', min:0.5, max:60, step:0.1, log:true, u:'s', h:'How long each morph into the next version takes. The motion never pauses between them.'}] : []),
        {k:'morph', l:sh === 17 || sh === 7 ? 'Wander' : 'Evolve', min:0, max:1, step:0.01, h:sh === 17 || sh === 7 ? 'The pools drift around on their own paths.' : 'The shapes slowly change form in place.'},
        {k:'flow', l:'Flow', min:0, max:1, step:0.01, h:'Slowly turning currents carry the shapes around, so they ooze and swirl rather than slide.'},
        {k:'drift', l:'Drift', min:0, max:3, step:0.01, u:'m/s', h:'The whole pattern travels slowly in one direction.'},
        ...((P.drift ?? 0) > 0 ? [{k:'windDir', l:'Drift direction', min:0, max:360, step:1, u:'°'}, {k:'gust', l:'Unevenness', min:0, max:1, step:0.01, h:'The drift speeds up and slows down, as moving air does.'}] : []),
      ]});
    }
    out.push({name:'Real-world size', params:[{k:'tileSize', l:'Width where it lands', min:0.3, max:20, step:0.1, u:'m', h:'For the scene preview and for matching scale.'}]});
    return out;
  },
  presets:[
    {name:'Morphing light pool', v:{seed:4, shape:9, framing:1, poolSize:1.0, poolSoft:0.6, blur:6, tileSize:3, count:9, spread:70, apexX:0, apexY:0.15, angle:0, width:0.55, wVar:0.5, soft:0.7, fall:0.55,
      brk:0.4, rough:0.45, darkest:0.2, dir:0, scale:3, amount:0.55, motion:0.5, shimSpd:1, warp:0.9, clump:0.4, stretch:1, pbTool:0, pbInk:0, pbSize:6, pbSoft:0.6, pbFlow:0.6, pbWrap:true, pbScene:true, pbAngle:20, pbLen:6, pbStreak:0.5,
      mSpeed:1, sway:0, swayHz:0.45, flutter:0, drift:0, windDir:0, gust:0, flow:0.15, morph:0.04, breath:0, blend:0.5, blendT:8}},
    {name:'Soft drifting clouds', v:{shape:15, framing:0, blur:6, scale:2, amount:0.5, soft:0.75, brk:0.5, rough:0.5, darkest:0.3, warp:0.6, clump:0.5, drift:0.15, gust:0.3, morph:0.06, flow:0.15, breath:0, blend:0.3, blendT:12}},
    {name:'Wandering pools', v:{shape:17, framing:0, blur:5, scale:3, amount:0.5, soft:0.85, darkest:0.15, warp:0.5, wVar:0.6, morph:0.5, flow:0.15, breath:0}},
    {name:'Subtle soft mottling', v:{shape:11, framing:0, blur:5, scale:3, amount:0.55, soft:0.8, brk:0.4, rough:0.45, darkest:0.45, warp:0.7, clump:0.5, morph:0.08, flow:0.2, breath:0, blend:0.45, blendT:9}},
    {name:'Big soft blobs', v:{shape:9, framing:0, blur:8, scale:2, amount:0.55, soft:0.75, brk:0.3, rough:0.4, darkest:0.15, warp:1.0, clump:0.3, morph:0.06, flow:0.25, breath:0, blend:0.45, blendT:9}},
    {name:'Billowy light', v:{shape:16, framing:0, blur:6, scale:3, amount:0.5, soft:0.85, brk:0.35, rough:0.5, darkest:0.2, warp:0.5, morph:0.08, flow:0.2, breath:0}},
    {name:'Marbled flowing light', v:{blend:0.4, blendT:10, shape:18, framing:0, blur:5, scale:2, amount:0.5, soft:0.8, brk:0.6, rough:0.5, darkest:0.25, warp:1.0, dir:1, flow:0.45, morph:0.06, breath:0}},
    {name:'Gentle uneven wash', v:{shape:19, framing:0, blur:8, scale:2, amount:0.6, soft:0.6, brk:0.3, rough:0.45, darkest:0.4, warp:0.5, morph:0.05, flow:0.15, breath:0, blend:0.45, blendT:9}},
    {name:'Soft streaks', v:{shape:15, framing:0, blur:5, scale:3, amount:0.5, soft:0.7, brk:0.5, rough:0.5, darkest:0.25, warp:0.4, clump:0.3, stretch:4, dir:1, drift:0.1, morph:0.05, breath:0}},
    {name:'Soft pool, slow swirl', v:{shape:15, framing:1, poolSize:1.0, poolSoft:0.7, blur:7, scale:3, amount:0.55, soft:0.8, brk:0.4, rough:0.45, darkest:0.1, warp:0.8, clump:0.4, flow:0.5, morph:0.06, breath:0}},
    {name:'Soft spots, drifting', v:{shape:7, framing:0, blur:7, scale:4, amount:0.6, wVar:0.6, soft:0.85, darkest:0.15, drift:0.1, morph:0.3, breath:0}},
    {name:'Paint your own', v:{shape:14, blur:2, framing:0, breath:0, flow:0, morph:0, drift:0}},
    {name:'Light shafts, slow shimmer', v:{shape:0, blur:0.5, count:9, spread:70, apexY:0.15, width:0.55, wVar:0.6, soft:0.6, fall:0.55, brk:0.5, motion:0.6, shimSpd:0.8}},
    {name:'Shafts from the side', v:{shape:0, blur:0.5, count:8, spread:40, apexX:-0.55, apexY:0.1, width:0.4, wVar:0.7, soft:0.5, fall:0.6, brk:0.6, motion:0.5, shimSpd:0.7}},
    {name:'Curtain shafts', v:{shape:1, blur:0.5, count:7, spread:36, apexY:0.1, width:0.7, wVar:0.5, soft:0.3, fall:0.45, brk:0.6, motion:0.4}},
    {name:'Parallel beams', v:{shape:2, blur:0.5, count:6, angle:20, width:0.4, wVar:0.4, soft:0.4, fall:0.3, brk:0.4, motion:0.5}},
  ],
  post:{exposure:0, rolloff:0, gamma:1, contrast:0, black:0, white:1, floor:0, invert:false},
};
