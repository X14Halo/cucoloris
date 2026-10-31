(() => {
'use strict';
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = id => document.getElementById(id);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* =====================================================================
   PARAMETER SCHEMA
   One water simulation, three ways to receive its light:
   underwater surfaces (refracted), overhead surfaces (reflected) and
   vertical surfaces at the waterline such as hulls, walls and rocks
   (reflected).
   ===================================================================== */
const SUN_DISK = {k:'sunDisk', l:'Light source Ø', min:0.1, max:6, step:0.01, u:'°', h:'Angular diameter of the light source. The sun is 0.53°. Pool lamps and overcast-thin sun are larger and soften every line.'};
const WATER = name => ({name, params:[
  {k:'tileSize', l:'Tile size', min:0.5, max:20, step:0.1, u:'m', h:'Real-world width of one tile. Every other size here is physical.'},
  {k:'wavelength', l:'Dominant wavelength', min:0.03, max:5, step:0.01, u:'m', h:'Peak of the wave spectrum. Sets the size of the caustic cells and, through the dispersion relation, how fast they move.'},
  {k:'slope', l:'Surface slope (RMS)', min:0.003, max:0.2, step:0.001, h:'Root-mean-square slope of the waves. Glassy water is below 0.02, still pools 0.03–0.05, open water in a breeze 0.08–0.15.'},
  {k:'tail', l:'Short-wave content', min:0, max:1, step:0.01, h:'Energy in waves shorter than the dominant ones. Low for still pools that only carry gentle residual swell; high for wind-driven water, where short waves crowd the caustics into fine mesh.'},
  {k:'peak', l:'Wave regularity', min:1, max:7, step:0.1, h:'JONSWAP peak enhancement. 1 = broad, irregular wind sea. 7 = narrow, regular swell.'},
  {k:'directional', l:'Directionality', min:0, max:1, step:0.01, h:'0 = waves from every direction. 1 = waves aligned with the wave direction.'},
  {k:'windDir', l:'Wave direction', min:0, max:360, step:1, u:'°'},
  {k:'opposing', l:'Reflected waves', min:0, max:1, step:0.01, h:'Waves bouncing back off pool walls, hulls or a seawall. Turns travelling patterns into ones that shimmer in place.'},
  {k:'ripple', l:'Wind ripples (RMS slope)', min:0, max:0.15, step:0.001, h:'Capillary ripples 1–4 cm long raised by gusts, inside each gust patch. They oscillate at about 8–10 Hz, as real ones do.'},
  {k:'ripPatch', l:'Ripple patchiness', min:0, max:1, step:0.01, h:'Real wind ripples come in drifting gust patches (cat\'s paws) with glassy water between them. 0 spreads them evenly everywhere.'},
  {k:'chop', l:'Crest sharpening', min:0, max:1, step:0.01, h:'Choppy (Gerstner) horizontal displacement from the simulation.'},
]});
const IMPERF = {name:'Imperfections', params:[
  {k:'uneven', l:'Uneven wave energy', min:0, max:1, step:0.01, h:'Real water is never uniform: sheltered corners, wave groups and leftover swell leave some areas busier than others. The pattern of busy and calm areas drifts slowly.'},
]};
const MOTION = {name:'Motion', params:[
  {k:'timeScale', l:'Time scale', min:0.05, max:2, step:0.01, u:'×', h:'1 = real speed from the gravity–capillary dispersion relation. Lower it only as a deliberate art-direction choice.'},
]};
const WATER_TYPES = [
  {name:'Pool (fresh, treated)', sal:0, b:0.01},
  {name:'Clear ocean', sal:35, b:0.03},
  {name:'Coastal', sal:33, b:0.3},
  {name:'Turbid coastal', sal:30, b:1.0},
  {name:'Lake or river', sal:0, b:0.35},
];
/*@@PART trspecies@@*/
const LEVELS = {exposure:-1.3, rolloff:0.35, gamma:1, contrast:0, black:0, white:1, floor:0, invert:false};

const MODES = {
  under: {
    short:'Underwater', target:0, tileable:true, tl:{loop:true, len:10, shutter:180},
    groups:[
      WATER('Water surface'),
      IMPERF,
      {name:'Light path', params:[
        {k:'depth', l:'Depth below surface', min:0.1, max:15, step:0.05, u:'m', h:'Distance from the water surface to the surface receiving the caustics.'},
        {k:'sunElev', l:'Sun elevation (in air)', min:10, max:90, step:0.5, u:'°'},
        {k:'sunAz', l:'Sun azimuth', min:0, max:360, step:1, u:'°'},
        SUN_DISK,
        {k:'waterType', l:'Water', opts:WATER_TYPES.map(w => w.name), h:'Sets salinity (which shifts the refractive index) and the scattering coefficient of the water column.'},
        {k:'scatterK', l:'Scattering', min:0, max:4, step:0.01, u:'×', h:'Scales the water type’s scattering coefficient. Light scattered out of each ray spreads into a soft forward halo and lowers caustic contrast with depth.'},
        {k:'dispersion', l:'Dispersion', min:0, max:5, step:0.05, u:'×', h:'Wavelength-dependent refraction from the measured index of refraction of water (Quan–Fry). 1 = real water. Colour fringes appear only where they exceed a pixel.'},
        {k:'bakeColor', l:'Bake water absorption into colour', type:'chk', h:'Applies pure-water spectral absorption along each ray’s path. Leave off when your scene’s water volume already absorbs the light.'},
      ]},
      MOTION,
    ],
    presets:[
      {name:'Tropical shallows', v:{seed:7, tileSize:6, wavelength:0.8, slope:0.065, tail:0.35, peak:2.5, directional:0.6, windDir:30, opposing:0.1, ripple:0.004, ripPatch:0.75, uneven:0.35, chop:0.2, depth:2.2, sunElev:62, sunAz:40, sunDisk:0.53, waterType:1, scatterK:1, dispersion:1, bakeColor:false, timeScale:1}},
      {name:'Beach, ankle deep', v:{tileSize:1.2, wavelength:0.12, slope:0.08, tail:0.5, peak:1.5, directional:0.7, opposing:0.15, ripple:0.004, uneven:0.5, chop:0.3, depth:0.3, sunElev:55, waterType:2}},
      {name:'Beach, waist deep', v:{tileSize:3, wavelength:0.45, slope:0.07, tail:0.6, peak:2, directional:0.8, opposing:0.1, ripple:0.003, uneven:0.45, chop:0.3, depth:1.0, sunElev:55, waterType:2}},
      {name:'Open ocean, 3 m', v:{tileSize:10, wavelength:2.5, slope:0.07, tail:0.5, peak:2, directional:0.5, opposing:0, ripple:0.004, uneven:0.4, depth:3, sunElev:60, waterType:1}},
      {name:'Reef at 6 m', v:{tileSize:12, wavelength:2.4, slope:0.08, tail:0.45, peak:2.5, directional:0.5, opposing:0, ripple:0.003, depth:6, waterType:1}},
      {name:'Murky coast, 8 m', v:{tileSize:14, wavelength:4, slope:0.06, tail:0.4, peak:2.5, directional:0.6, opposing:0.05, ripple:0.003, depth:8, sunElev:45, waterType:2}},
      {name:'Lake shallows, calm', v:{tileSize:1.5, wavelength:0.18, slope:0.05, tail:0.3, peak:1.2, directional:0.3, opposing:0.2, ripple:0.002, uneven:0.5, depth:0.6, sunElev:55, waterType:4}},
      {name:'Lake, breezy', v:{tileSize:3, wavelength:0.5, slope:0.06, tail:0.6, peak:1.3, directional:0.6, opposing:0.1, ripple:0.006, ripPatch:0.8, uneven:0.5, depth:1.2, sunElev:50, waterType:4}},
      {name:'River riffle', v:{tileSize:1.5, wavelength:0.2, slope:0.09, tail:0.7, peak:1.1, directional:0.85, opposing:0.6, ripple:0.005, uneven:0.6, chop:0.4, depth:0.4, sunElev:55, waterType:4}},
      {name:'Clear river pool', v:{tileSize:2, wavelength:0.25, slope:0.05, tail:0.35, peak:1.3, directional:0.5, opposing:0.25, ripple:0.002, uneven:0.45, depth:1.0, sunElev:50, waterType:4}},
      {name:'Swimming pool', v:{tileSize:3, wavelength:0.32, slope:0.05, tail:0.3, peak:1.2, directional:0.15, opposing:0.55, ripple:0, depth:1.5, sunElev:62, waterType:0}},
    ],
    post:{...LEVELS},
  },
  over: {
    short:'Underside (reflected)', target:1, tileable:true, tl:{loop:true, len:10, shutter:180},
    groups:[
      WATER('Water surface'),
      IMPERF,
      {name:'Light path', params:[
        {k:'depth', l:'Height above water', min:0.1, max:15, step:0.05, u:'m', h:'Height of the ceiling, dock or hull underside above the water.'},
        {k:'sunElev', l:'Sun elevation', min:10, max:85, step:0.5, u:'°'},
        {k:'sunAz', l:'Sun azimuth', min:0, max:360, step:1, u:'°'},
        SUN_DISK,
      ]},
      MOTION,
    ],
    presets:[
      {name:'Under a dock on a lake', v:{seed:5, tileSize:4, wavelength:0.9, slope:0.013, tail:0.2, peak:2, directional:0.4, windDir:20, opposing:0.3, ripple:0, ripPatch:0.75, uneven:0.4, chop:0.2, depth:1.8, sunElev:35, sunAz:40, sunDisk:0.53, timeScale:1}},
      {name:'Pier over the ocean', v:{tileSize:10, wavelength:3, slope:0.05, tail:0.5, peak:2.5, directional:0.6, opposing:0.05, ripple:0.003, uneven:0.4, depth:4, sunElev:45}},
      {name:'Rocky overhang at the sea', v:{tileSize:6, wavelength:2, slope:0.04, tail:0.45, peak:2, directional:0.5, opposing:0.35, ripple:0.003, uneven:0.5, depth:1.5, sunElev:40}},
      {name:'Bridge over a river', v:{tileSize:10, wavelength:1.6, slope:0.012, tail:0.3, peak:2.5, directional:0.7, opposing:0.2, uneven:0.5, depth:5, sunElev:30}},
      {name:'Boat overhang, light chop', v:{tileSize:3, wavelength:0.6, slope:0.016, tail:0.3, peak:1.6, directional:0.35, opposing:0.3, ripple:0.002, depth:0.7, sunElev:45}},
      {name:'Boathouse ceiling, calm lake', v:{tileSize:4, wavelength:0.5, slope:0.01, tail:0.2, peak:1.4, directional:0.3, opposing:0.4, uneven:0.5, depth:2.2, sunElev:30}},
    ],
    post:{...LEVELS},
  },
  hull: {
    short:'Hull & walls (reflected)', target:2, tileable:false, tl:{loop:true, len:10, shutter:180},
    groups:[
      WATER('Water surface'),
      IMPERF,
      {name:'Light path', params:[
        {k:'sunElev', l:'Sun elevation', min:5, max:75, step:0.5, u:'°', h:'Lower sun stretches the pattern into horizontal bands; higher sun stretches it upward.'},
        {k:'sunAz', l:'Sun angle to the wall', min:-75, max:75, step:0.5, u:'°', h:'0 = the sun faces the wall squarely across the water.'},
        {k:'fade', l:'Edge fade', min:0, max:0.5, step:0.01, h:'Fades the pattern out toward the top, bottom and sides so the light has no hard edge or seam anywhere. 0 keeps the full tile (it then repeats sideways).'},
        {k:'lean', l:'Surface lean', min:-30, max:50, step:0.5, u:'°', h:'Positive leans the surface out over the water, like a flared bow; negative leans it away, like a sloping rock.'},
        SUN_DISK,
      ]},
      MOTION,
    ],
    presets:[
      {name:'Yacht hull, harbour', v:{seed:9, tileSize:3, wavelength:0.7, slope:0.015, tail:0.35, peak:1.4, directional:0.1, windDir:60, opposing:0.5, ripple:0, ripPatch:0.75, uneven:0.35, chop:0.2, fade:0.2, sunElev:50, sunAz:0, lean:15, sunDisk:0.53, timeScale:1}},
      {name:'Boat side, open sea', v:{tileSize:6, wavelength:2.2, slope:0.03, tail:0.45, peak:2.2, directional:0.6, opposing:0.1, ripple:0.003, uneven:0.4, sunElev:45, lean:10}},
      {name:'Seawall, choppy', v:{tileSize:4, wavelength:1.2, slope:0.026, tail:0.45, peak:1.4, directional:0.4, opposing:0.6, ripple:0, sunElev:40, sunAz:0, lean:0}},
      {name:'Rock face by a lake', v:{tileSize:3, wavelength:0.45, slope:0.02, tail:0.35, directional:0.15, windDir:45, opposing:0.1, sunElev:45, sunAz:0, lean:-8}},
      {name:'River bank under a bridge', v:{tileSize:4, wavelength:0.6, slope:0.018, tail:0.4, peak:1.4, directional:0.8, opposing:0.3, uneven:0.5, sunElev:30, sunAz:0, lean:-5}},
      {name:'Canal wall, still water', v:{tileSize:3, wavelength:0.5, slope:0.008, tail:0.2, peak:1.5, directional:0.3, opposing:0.6, uneven:0.4, sunElev:35, sunAz:0, lean:0}},
      {name:'Low sun bands', v:{tileSize:2, wavelength:0.6, slope:0.012, tail:0.25, opposing:0.4, sunElev:22, sunAz:0, lean:0}},
    ],
    post:{...LEVELS},
  },
  trees: {
    short:'Tree shadows', kind:'trees', tileable:true, tl:{loop:false, len:60, shutter:180},
    groups:[
      {name:'Trees', params:[
        {k:'species', l:'Species', opts:SPECIES.map(s => s.name)},
        {k:'tileSize', l:'Tile size (across the beam)', min:2, max:30, step:0.5, u:'m', h:'Width of one tile measured perpendicular to the sunlight. The pattern tiles seamlessly in both directions.'},
        {k:'cover', l:'Canopy cover', min:0.1, max:1.5, step:0.01, h:'How much of the sky the canopy fills. Lower values open larger gaps between branch clusters.'},
        {k:'canopyTop', l:'Height of tree tops', min:2, max:25, step:0.1, u:'m', h:'Top of the canopy above the ground. One storey is about 3 m.'},
        {k:'canopyDepth', l:'Canopy depth', min:0.5, max:10, step:0.1, u:'m', h:'Thickness of the leafy layer below the tree tops. Nothing hangs lower than this, so all shadows come from up in the canopy.'},
        {k:'leafDensity', l:'Leaf density', min:0.2, max:2, step:0.01, u:'×', h:'Scales the leaf area index of the crown.'},
        {k:'leafScale', l:'Leaf size', min:0.5, max:2, step:0.01, u:'×'},
        {k:'framing', l:'Framing', opts:['Seamless canopy', 'Single element in white', 'Light pool, dark edges'], h:'Single element keeps one cluster of branches, centred, with open sunlight all around it. Light pool lets light through only in the middle: the canopy thickens toward the edges and the frame ends in black.'},
        {k:'poolSize', l:'Light pool size', min:0.3, max:1.4, step:0.01, h:'Only used with the light pool framing.'},
        {k:'poolSoft', l:'Light pool edge softness', min:0.05, max:1, step:0.01, h:'Only used with the light pool framing.'},
        {k:'elemSize', l:'Element size', min:0.05, max:1, step:0.01, h:'How much of the canopy the single element takes. Raise Tile size if it touches the frame edges.'},
        {k:'woody', l:'Branches and twigs', type:'chk'},
        {k:'trunks', l:'Trunk shadows', type:'chk', h:'Off keeps only the canopy, as when you look up into the trees from beneath them.'},
      ]},
      {name:'Sun', params:[
        {k:'sunElev', l:'Sun elevation', min:8, max:90, step:0.5, u:'°'},
        SUN_DISK,
        {k:'recvHeight', l:'Lit surface height', min:0, max:8, step:0.05, u:'m', h:'Height above the ground of the surface receiving the shadow. Raising it brings it closer to the foliage, so leaf shapes sharpen.'},
      ]},
      {name:'Wind', params:[
        {k:'windSpeed', l:'Wind speed', min:0, max:15, step:0.1, u:'m/s', h:'At canopy height. 1–3 light air to light breeze, 4–6 gentle to moderate breeze, 8+ fresh breeze.'},
        {k:'windDir', l:'Wind direction (to the sun)', min:0, max:360, step:1, u:'°'},
        {k:'gustAmt', l:'Large gusts', min:0, max:3, step:0.01, u:'×', h:'Extra energy in the big, slow eddies that make the whole canopy surge and veer together. 0 is an ordinary breeze.'},
                {k:'indep', l:'Local eddies', min:0, max:1, step:0.01, h:'How much of the turbulence is in eddies smaller than the tile, which sweep through the canopy and move each branch at its own time, rather than surges of the whole canopy.'},
        {k:'turb', l:'Turbulence', min:0.05, max:0.6, step:0.01, h:'Turbulence intensity (σu / U). Inside and above canopies it is typically 0.3–0.5.'},
        {k:'swayBranch', l:'Limb flexibility', min:0, max:4, step:0.01, u:'×', h:'How far the limbs bend under the wind. 1 is a typical hardwood; palms are much more flexible already.'},
        {k:'swayTwig', l:'Branch and twig flexibility', min:0, max:4, step:0.01, u:'×', h:'How easily the smaller branches and leaf sprays bend. They are stiffer but lighter, so they swing faster.'},
        {k:'flutter', l:'Leaf flutter', min:0, max:4, step:0.01, u:'×', h:'Leaves twisting on their stalks once the local wind passes a threshold (aspen at about 0.5 m/s, oak nearer 1.2 m/s), and leaning over as it rises.'},
      ]},
    ],
    presets:[
      {name:'Oak canopy overhead', v:{seed:3, species:0, tileSize:3, cover:1.0, canopyTop:9, canopyDepth:4, leafDensity:1, leafScale:1, woody:true, trunks:false, sunElev:60, sunDisk:0.53, recvHeight:0, windSpeed:2, windDir:20, turb:0.35, framing:0, elemSize:0.35, poolSize:1.0, poolSoft:0.55, gustAmt:0, gustRate:4, indep:0.5, swayBranch:1, swayTwig:1, flutter:1}},
      {name:'Round sun spots, tall canopy', v:{species:0, tileSize:3, cover:0.9, canopyTop:16, canopyDepth:5, leafDensity:0.85, sunElev:65}},
      {name:'Maple, park shade', v:{species:1, tileSize:3, cover:0.9, canopyTop:10, canopyDepth:4, sunElev:55}},
      {name:'Birch, light breeze', v:{species:2, tileSize:3, cover:1.0, canopyTop:9, canopyDepth:4, windSpeed:3, sunElev:50}},
      {name:'Aspen, gentle shimmer', v:{species:3, tileSize:3, cover:1.0, canopyTop:9, canopyDepth:4, windSpeed:3, sunElev:55}},
      {name:'Pine canopy', v:{species:4, tileSize:4, cover:0.9, canopyTop:14, canopyDepth:5, sunElev:50}},
      {name:'Palm overhead', v:{species:5, framing:1, tileSize:10, elemSize:0.45, cover:1, canopyTop:8, canopyDepth:2.5, windSpeed:4, sunElev:65}},
      {name:'One storey up', v:{species:1, tileSize:3, cover:1.0, canopyTop:4, canopyDepth:1.5, sunElev:50}},
      {name:'Single branch, white frame', v:{species:1, tileSize:5, cover:1.0, canopyTop:5, canopyDepth:2.5, framing:1, elemSize:0.55, sunElev:60}},
      {name:'Oak sprig, white frame', v:{species:0, tileSize:4, cover:1.0, canopyTop:3.5, canopyDepth:1.8, framing:1, elemSize:0.5, sunElev:55}},
      {name:'Aspen pool of light', v:{species:3, tileSize:5.5, cover:0.75, canopyTop:9, canopyDepth:4, windSpeed:3, sunElev:55, framing:2, poolSize:1.0, poolSoft:0.6}},
      {name:'Late-afternoon oak', v:{species:0, tileSize:3, cover:0.7, canopyTop:9, canopyDepth:4, leafDensity:0.5, sunElev:15}},
    ],
    post:{exposure:0, rolloff:0, gamma:1, contrast:0, black:0, white:1, floor:0, invert:false},
  },
};

// Controls in order of importance: what sets up the shot first, then the look, then the fine detail.
for (const m of ['under', 'over', 'hull']) {
  const all = {};
  MODES[m].groups.forEach(g => g.params.forEach(d => { all[d.k] = d; }));
  const pick = ks => ks.filter(k => all[k]).map(k => all[k]);
  MODES[m].groups = [
    {name:'Shot setup', params:pick(['waterType', 'depth', 'tileSize', 'sunElev', 'sunAz', 'lean', 'fade'])},
    {name:'Waves', params:pick(['wavelength', 'slope', 'tail', 'chop', 'peak', 'directional', 'windDir', 'opposing', 'ripple', 'ripPatch'])},
    IMPERF,
    {name:'Optics', params:pick(['scatterK', 'sunDisk', 'dispersion', 'bakeColor'])},
    MOTION,
  ];
}
{
  const TG = MODES.trees.groups, all = {};
  TG.forEach(g => g.params.forEach(d => { all[d.k] = d; }));
  MODES.trees.onParam = k => k === 'framing';
  Object.defineProperty(MODES.trees, 'groups', {get() {
    const fr = (S.p.trees.framing | 0);
    const top = [all.framing, ...(fr === 1 ? [all.elemSize] : fr === 2 ? [all.poolSize, all.poolSoft] : []),
                 all.species, all.tileSize, all.cover, all.canopyTop, all.canopyDepth, all.leafDensity, all.leafScale, all.woody, all.trunks];
    return [{name:'Trees', params:top}, ...TG.slice(1)];
  }});
}
/*@@PART winmode@@*/
/*@@PART shapemode@@*/
const POST = [
  {k:'exposure', l:'Preview exposure', min:-6, max:4, step:0.05, u:'EV', h:'Preview only. The pattern itself is linear with a mean of 1.0, so it redistributes the light without dimming it.'},
  {k:'rolloff', l:'Highlight rolloff', min:0, max:1, step:0.01, h:'Compresses hot caustic peaks instead of clipping them.'},
  {k:'gamma', l:'Gamma', min:0.3, max:3, step:0.01},
  {k:'contrast', l:'S-curve', min:0, max:1, step:0.01},
  {k:'black', l:'Black point', min:0, max:0.5, step:0.005},
  {k:'white', l:'White point', min:0.2, max:2, step:0.01},
  {k:'floor', l:'Ambient fill', min:0, max:0.5, step:0.005, h:'Lifts the darkest value so the gobo never fully blocks the light.'},
  {k:'invert', l:'Invert', type:'chk'},
];

// nothing loops by default: every simulation runs forward with exact physics
for (const m of Object.keys(MODES)) MODES[m].tl = {...MODES[m].tl, loop:false, len:Math.max(MODES[m].tl.len, 60)};
const DEFAULTS = {};
for (const [m, def] of Object.entries(MODES)) DEFAULTS[m] = {...def.presets[0].v};

/* =====================================================================
   STATE (+ per-viewer persistence)
   ===================================================================== */
const small = Math.min(innerWidth, innerHeight) < 700 || matchMedia('(pointer:coarse)').matches;
const S = {
  mode:'trees', p:{}, post:{}, tl:{}, fps:24, t:0, playing:true,
  res: small ? 512 : 1024, quality: small ? 'draft' : 'high', tiles:1, heat:false, seams:false, view:'gobo',
};
for (const m of Object.keys(MODES)) { S.p[m] = {...DEFAULTS[m]}; S.post[m] = {...MODES[m].post}; S.tl[m] = {...MODES[m].tl}; }
const STORE = 'cucLab.v3';
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved) {
    for (const m of Object.keys(MODES)) {
      if (saved.p && saved.p[m]) Object.assign(S.p[m], saved.p[m]);
      // v4: trees default to a steady breeze without gust events
      if (!(saved.ver >= 4) && m === 'trees') S.p[m].gustAmt = 0;
      if (saved.post && saved.post[m]) Object.assign(S.post[m], saved.post[m]);
      if (saved.tl && saved.tl[m]) Object.assign(S.tl[m], saved.tl[m]);
      // v7: nothing loops by default
      if (!(saved.ver >= 7)) S.tl[m] = {...S.tl[m], loop:false, len:Math.max(S.tl[m].len, 60)};
      // v8: Shapes became a family of soft noise patterns; earlier shape settings start fresh
      if (!(saved.ver >= 8) && m === 'shapes') S.p[m] = {...DEFAULTS[m]};
      // v9: framed gobos fill the image
      if (!(saved.ver >= 9) && S.p[m].poolSize !== undefined && S.p[m].poolSize < 1) S.p[m].poolSize = 1;
      // v10: no more ebb & flow (brightness pumping); shapes morph instead
      if (!(saved.ver >= 10) && m === 'shapes') { S.p[m].breath = 0; if (!(S.p[m].blend > 0)) S.p[m].blend = DEFAULTS[m].blend; }
    }
    S.savedVer = saved.ver;
    for (const k of ['mode', 'fps', 'res', 'quality', 'tiles', 'view', 'scenes', 'cams', 'userFraming', 'ovl', 'shot', 'shotSel', 'shotLights', 'shotCams', 'tlBackup', 'exp']) if (saved[k] !== undefined) S[k] = saved[k];
    if (!MODES[S.mode]) S.mode = 'trees';
  }
} catch (e) {}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  if (window.__noSave) return;
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({p:S.p, post:S.post, tl:S.tl, mode:S.mode, fps:S.fps, res:S.res, quality:S.quality, tiles:S.tiles, view:S.view, scenes:S.scenes, cams:S.cams, userFraming:S.userFraming, ovl:S.ovl, shot:S.shot, shotSel:S.shotSel, shotLights:S.shotLights, shotCams:S.shotCams, tlBackup:S.tlBackup, exp:S.exp, ver:10})); } catch (e) {}
  }, 300);
}
const TL = () => S.tl[S.mode];

/* =====================================================================
   WEBGL SETUP
   ===================================================================== */
const cv = $('cv');
const errEl = $('err');
function showErr(msg) { errEl.hidden = false; errEl.textContent = msg; }
const gl = cv.getContext('webgl2', {antialias:false, alpha:false, premultipliedAlpha:false, preserveDrawingBuffer:false, powerPreference:'high-performance'});
if (!gl) { showErr('This tool needs WebGL 2. Open it in a current version of Chrome, Edge, Firefox or Safari.'); return; }
const floatOK = !!gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
if (!floatOK) showErr('This GPU or browser cannot render to float textures (EXT_color_buffer_float), which the water simulation needs.');
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define PI 3.14159265359
#define TAU 6.28318530718
`;
/*@@PART glsl_common_a@@*/
/*@@PART glsl_common_b@@*/
/*@@PART spec2@@*/

/*@@PART trshaders@@*/
/* ---------- Sun-disk convolution with limb darkening. On walls the blur grows with height,
              because the light has travelled further from the water. ---------- */
const FS_DISK = COMMON + `
uniform sampler2D uSrc;
uniform float uRad, uRad2, uMix, uGain, uLimb, uLod, uLod2, uRadK, uSrcRes;
uniform int uTaps, uClampY;
vec3 disk(vec2 uv, float r, float lod){
  vec3 s = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 256; i++){
    if (i >= uTaps) break;
    float rho = sqrt((float(i) + 0.5) / float(uTaps));
    float th = float(i) * 2.39996323;
    vec2 p = uv + r * rho * vec2(cos(th), sin(th));
    if (uClampY == 1) p.y = clamp(p.y, 0.0005, 0.9995);
    float w = 1.0 - uLimb * (1.0 - sqrt(max(0.0, 1.0 - rho * rho)));
    s += w * textureLod(uSrc, p, lod).rgb; ws += w;
  }
  return s / ws;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float r = uRad, lod = uLod;
  if (uRadK > 0.0){
    r = max(uRad + uRadK * uv.y, 0.6 / uSrcRes);
    lod = max(0.0, log2(max(r * uSrcRes * sqrt(PI / float(uTaps)), 1e-6)) - 0.25);
  }
  vec3 c = disk(uv, r, lod);
  if (uMix > 0.0) c = mix(c, disk(uv, uRad2, uLod2), uMix);
  fragColor = vec4(c * uGain, 1.0);
}`;

/*@@PART glsl_post@@*/
const FS_COPY = COMMON + `
uniform sampler2D uSrc; uniform float uGain;
void main(){ fragColor = vec4(texture(uSrc, gl_FragCoord.xy / uRes).rgb * uGain, 1.0); }`;

/*@@PART gl_program@@*/
const PR = {
  spec: program(VS_FULL, FS_SPEC, 'water spectrum'),
  fft: program(VS_FULL, FS_FFT, 'FFT'),
  mesh: program(VS_MESH, FS_MESH, 'caustic mesh'),
  wall: program(VS_WALL, FS_MESH, 'wall caustic mesh'),
  disk: program(VS_FULL, FS_DISK, 'disk blur'),
  post: program(VS_FULL, FS_POST, 'post'),
  disp: program(VS_FULL, FS_DISP, 'display'),
  copy: program(VS_FULL, FS_COPY, 'copy'),
  leaf3: program(VS_LEAF3, FS_LEAF3, 'tree leaves'),
  seg: program(VS_SEG, FS_SEG, 'tree branches'),
  canopy3: program(VS_FULL, FS_CANOPY3, 'canopy integration'),
};

/*@@PART helpers@@*/
const QUAL = {
  draft: {ss:1.0, N:256, over:1, taps:24, sub:1, bands:3, treeTaps:24},
  high:  {ss:1.5, N:1024, over:1, taps:64, sub:4, bands:6, treeTaps:64},
  ultra: {ss:2.0, N:2048, over:2, taps:128, sub:8, bands:12, treeTaps:160},
};
function mrtF(name, w, h) {
  let t = targets[name];
  if (t && t.w === w && t.h === h) return t;
  if (t) { gl.deleteTexture(t.tex); gl.deleteTexture(t.tex2); gl.deleteFramebuffer(t.fb); }
  const a = makeTex(w, h, 'f32', false), b = makeTex(w, h, 'f32', false);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  t = targets[name] = {tex:a, tex2:b, fb, w, h};
  return t;
}
const linearFloat = !!gl.getExtension('OES_texture_float_linear');
function filt(texo, linear) {
  gl.bindTexture(gl.TEXTURE_2D, texo);
  const f = linear && linearFloat ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
}
/*@@PART rng@@*/
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
let info = '';
const fmtLen = s => s >= 120 ? (s / 60).toFixed(s % 60 ? 1 : 0) + ' min' : (+s).toFixed(s % 1 ? 1 : 0) + ' s';
const fresnel = (cosi, n = 1.333) => {
  const sint = Math.sqrt(Math.max(0, 1 - cosi * cosi)) / n, cost = Math.sqrt(Math.max(0, 1 - sint * sint));
  const rs = (cosi - n * cost) / (cosi + n * cost), rp = (n * cosi - cost) / (n * cosi + cost);
  return 0.5 * (rs * rs + rp * rp);
};

/* =====================================================================
   WATER
   A Tessendorf spectral simulation: every lattice wave vector carries a
   complex amplitude drawn from a JONSWAP spectrum (plus capillary
   ripples) and evolves by the gravity–capillary dispersion relation.
   Inverse FFT gives slopes and choppy displacement each frame. Light is
   traced through that surface with an energy-conserving photon mesh,
   so the result is linear with a mean of exactly 1.
   ===================================================================== */
/*@@PART water@@*/
/* ---------- Optics of water ---------- */
// Refractive index of water, Quan & Fry (1995), 20 °C; λ in nm, salinity S in PSU
function nWater(lam, S) {
  const T = 20;
  return 1.31405 + (1.779e-4 - 1.05e-6 * T + 1.6e-8 * T * T) * S - 2.02e-6 * T * T
       + (15.868 + 0.01155 * S - 0.00423 * T) / lam - 4382 / (lam * lam) + 1.1455e6 / (lam * lam * lam);
}
// Pure-water absorption (1/m), Pope & Fry (1997), sampled
const ABS = [[400, 0.0066], [425, 0.0048], [450, 0.0092], [475, 0.0114], [500, 0.0204], [525, 0.0425], [550, 0.0565], [575, 0.0894], [600, 0.2224], [625, 0.2834], [650, 0.34], [675, 0.45], [700, 0.65]];
const absorb = lam => { for (let i = 1; i < ABS.length; i++) if (lam <= ABS[i][0]) { const [l0, a0] = ABS[i - 1], [l1, a1] = ABS[i]; return a0 + (a1 - a0) * (lam - l0) / (l1 - l0); } return 0.65; };
// CIE 1931 colour matching (Wyman, Sloan & Shirley 2013 fit) → linear sRGB
const g3 = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
function cmf(l) {
  const X = 1.056 * g3(l, 599.8, 37.9, 31.0) + 0.362 * g3(l, 442.0, 16.0, 26.7) - 0.065 * g3(l, 501.1, 20.4, 26.2);
  const Y = 0.821 * g3(l, 568.8, 46.9, 40.5) + 0.286 * g3(l, 530.9, 16.3, 31.1);
  const Z = 1.217 * g3(l, 437.0, 11.8, 36.0) + 0.681 * g3(l, 459.0, 26.0, 13.8);
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
}
function spectralBands(K) {
  const out = [], sum = [0, 0, 0];
  for (let i = 0; i < K; i++) {
    const lam = 400 + (i + 0.5) * 300 / K;
    let w = [0, 0, 0];
    for (let s = 0; s < 8; s++) { const c = cmf(400 + (i + (s + 0.5) / 8) * 300 / K); for (let k = 0; k < 3; k++) w[k] += Math.max(0, c[k]); }
    out.push({lam, w}); for (let k = 0; k < 3; k++) sum[k] += w[k];
  }
  out.forEach(b => { b.w = b.w.map((v, k) => v / sum[k]); });
  return out;
}

/* Wind ripples arrive in gust patches (cat's paws) that drift downwind and come and go
   over a few seconds, leaving glassy water between them. The patch field tiles with the
   water and loops with the timeline. */
const FS_RMASK = COMMON + `
uniform float uT, uPatch, uZ, uUneven, uZ2; uniform vec2 uDrift; uniform int uF, uPz, uF2, uPz2;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 q = uv * float(uF) - uDrift;
  float z = uZ;
  float n = pn3(vec3(q, z), ivec2(uF, 0), ivec2(0, uF), uPz, 11u)
          + 0.5 * pn3(vec3(q * 2.0, z * 2.0), ivec2(uF * 2, 0), ivec2(0, uF * 2), uPz * 2, 12u);
  float m = smoothstep(-0.05, 0.45, n);
  // slowly drifting busy and calm areas of the main waves
  float g = pn3(vec3(uv * float(uF2), uZ2), ivec2(uF2, 0), ivec2(0, uF2), uPz2, 13u) + 0.5 * pn3(vec3(uv * float(uF2 * 2), uZ2 * 2.0), ivec2(uF2 * 2, 0), ivec2(0, uF2 * 2), uPz2 * 2, 14u);
  fragColor = vec4(mix(1.0, m, uPatch), clamp(1.0 + 1.3 * uUneven * g, 0.15, 2.2), 0.0, 1.0);
}`;
PR.rmask = program(VS_FULL, FS_RMASK, 'ripple patches');
function rippleMask(P, t, tl) {
  const out = tgt('rmask', 256, 256, 'f16');
  const L = P.tileSize, F = Math.max(1, Math.round(L / 1.6));
  const T = tl.len, tt = tl.loop ? ((t % T) + T) % T : t;
  // patches ride the wind at ~1.5 m/s and live a few seconds; both snap to the loop
  const Pz = tl.loop ? Math.max(1, Math.round(T / 5)) : 1000;
  const shift = tl.loop ? Math.round(1.5 * T / L) * L / T : 1.5;
  const d = shift * tt / L * F, th = (P.windDir || 0) * DEG;
  pass(PR.rmask, out, p => {
    f1(p, 'uPatch', P.ripple > 0 ? clamp(P.ripPatch ?? 0.75, 0, 1) : 0); i1(p, 'uF', F); i1(p, 'uPz', Pz);
    f1(p, 'uZ', tl.loop ? tt / T * Pz : tt / 5); f2(p, 'uDrift', d * Math.cos(th), d * Math.sin(th));
    const F2 = Math.max(1, Math.round(L / 2.5)), Pz2 = tl.loop ? Math.max(1, Math.round(T / 12)) : 1000;
    i1(p, 'uF2', F2); i1(p, 'uPz2', Pz2); f1(p, 'uZ2', tl.loop ? tt / T * Pz2 : tt / 12); f1(p, 'uUneven', P.uneven || 0);
  });
  return out;
}
/* Disturbances: ring waves from point splashes, by the Cauchy–Poisson solution. Each splash is an
   initial Gaussian hump of radius s; its Fourier modes simply oscillate as cos(ω(k)·age) with the full
   gravity–capillary dispersion, so short ripples outrun longer waves exactly as in water. The modes are
   added straight into the simulated spectrum, which keeps them exactly periodic with the tile. */
function disturbances(P, t, tl) {
  const rate = 0, amt = 0, s = Math.max(P.distSize || 0.05, 0.005);
  const T = tl.loop ? tl.len : 60, tt = ((t % T) + T) % T;
  const life = Math.min(0.92 * T, 12);
  const n = rate > 0 && amt > 0 ? Math.max(1, Math.round(rate / 60 * T)) : 0;
  const r = rng(P.seed * 4271 + 3), src = [];
  for (let i = 0; i < n; i++) {
    const b = (i + 0.2 + 0.6 * r()) / n * T, x = r() * P.tileSize, y = r() * P.tileSize, str = 0.5 + r();
    const age = ((tt - b) % T + T) % T;
    if (age < life) src.push({x, y, age, a:str * (1 - smooth(0.6 * life, life, age))});
  }
  src.sort((p, q) => q.a / (q.age + 1) - p.a / (p.age + 1));
  const act = src.slice(0, 12);
  const A = amt * s / 0.858;                     // peak initial slope = strength
  const data = new Float32Array(48);
  act.forEach((q, i) => data.set([q.x, q.y, q.age, q.a], i * 4));
  return {data, n:act.length, s, k:A * Math.PI * s * s / (P.tileSize * P.tileSize)};
}
function renderCaustics(P, res, t, target, tl) {
  const Q = QUAL[S.quality];
  const N = Q.N, M = N * Q.over;
  const A = Math.min(4096, Math.round(res * Q.ss));
  const W = waterSpectrum(P, N);
  const wt = WATER_TYPES[P.waterType | 0] || WATER_TYPES[0];
  const sal = target === 0 ? wt.sal : 0;
  const nMean = nWater(550, sal);
  const Hw = target === 0 ? Math.max(P.depth, 0.2) : 30;
  // simulate: evolve spectrum, inverse FFT slopes/displacement and height
  const spec = mrtF('wspec', N, N);
  pass(PR.spec, spec, p => {
    tex(p, 'uH0', W.tex, 0); tex(p, 'uH0r', W.texR, 1); i1(p, 'uN', N); f1(p, 'uL', P.tileSize);
    f1(p, 'uT', tl.loop ? ((t % tl.len) + tl.len) % tl.len : t); f1(p, 'uTS', P.timeScale);
    f1(p, 'uLoopT', tl.loop ? tl.len : 0); f1(p, 'uHw', Hw);
    const D = disturbances(P, t, tl);
    gl.uniform4fv(p.u('uDsrc[0]'), D.data); i1(p, 'uNd', D.n); f1(p, 'uDs', D.s); f1(p, 'uDk', D.k);
  });
  const fA = runFFT(spec, N, 'wa');
  const fB = runFFT({tex:spec.tex2}, N, 'wb');
  filt(fA.tex, true); filt(fB.tex, true);
  const rm = rippleMask(P, t, tl);
  const e = P.sunElev * DEG, az = P.sunAz * DEG;
  const th = P.sunDisk * 0.5 * DEG;
  const sigma = Math.hypot(P.slope, P.ripple);
  const L0 = [-Math.cos(e) * Math.cos(az), -Math.cos(e) * Math.sin(az), -Math.sin(e)];
  const acc = tgt('cacc', A, A, 'f16', true);
  bindTarget(acc);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindVertexArray(vao);
  let rSun = 0, radK = 0, mixS = 0, r2 = 0;
  const lines = [];
  if (target === 2) {
    const lam = (P.lean || 0) * DEG, cL = Math.cos(lam), sL = Math.sin(lam);
    const R0 = [L0[0], L0[1], -L0[2]];
    const den0 = R0[0] * cL - R0[2] * sL;
    if (den0 > -0.03) {
      lines.push('The reflected sun runs parallel to or away from this surface, so no caustics reach it. Lower the lean or raise the sun.');
    } else {
      const t1 = -cL / den0, kS = sL + t1 * (R0[0] * sL + R0[2] * cL), latK = t1 * R0[1];
      const xMax = P.tileSize / kS * 1.15 + 0.05;
      const Gx = clamp(Math.ceil(xMax / P.tileSize * M), 8, 8192);
      const my = Math.ceil(clamp(xMax * t1 * 2.5 * sigma / P.tileSize + 0.02, 0.02, 0.8) * M);
      const Gy = M + 2 * my;
      const F0 = fresnel(Math.sin(e), nMean);
      const p = PR.wall; gl.useProgram(p.p);
      tex(p, 'uSa', fA.tex, 0); tex(p, 'uSb', fB.tex, 1); tex(p, 'uSm', rm.tex, 2);
      i1(p, 'uM', M); i1(p, 'uGy', Gy); i1(p, 'uMy', my);
      f1(p, 'uTile', P.tileSize); f1(p, 'uChop', P.chop); f1(p, 'uCosL', cL); f1(p, 'uSinL', sL);
      f1(p, 'uN', nMean); f1(p, 'uF0', F0); f1(p, 'uLatK', latK); f3(p, 'uL', ...L0);
      f3(p, 'uMask', kS, kS, kS); f1(p, 'uA', A);
      gl.drawArrays(gl.TRIANGLES, 0, Gx * Gy * 6);
      radK = Math.tan(th) * (t1 / kS) / Math.sqrt(Math.max(-den0, 0.15));
      lines.push(`Texture spans ${P.tileSize.toFixed(1)} m along the surface × ${P.tileSize.toFixed(1)} m up from the waterline; tiles sideways only`);
      lines.push(`Lit by water up to ${xMax.toFixed(1)} m out · sun-disk blur grows from 0 at the waterline to Ø ${(2 * radK * P.tileSize * 1000).toFixed(0)} mm at the top`);
      lines.push(`Point the fake light up at the surface from ${P.sunElev.toFixed(1)}° below horizontal (the sun mirrored in the water). Reflected sun is ${(F0 * 100).toFixed(1)}% of direct sun (Fresnel); each facet carries its own Fresnel weight`);
    }
  } else {
    const refl = target === 1;
    const D = P.depth;
    const tt = Math.asin(Math.cos(e) / nMean);           // refracted angle from vertical
    const Lpath = refl ? D / Math.sin(e) : D / Math.cos(tt);
    // flat-surface landing offset (removed so the pattern stays centred)
    let flat;
    if (refl) flat = [D / Math.tan(e) * Math.cos(az) / P.tileSize * -1, D / Math.tan(e) * Math.sin(az) / P.tileSize * -1];
    else { const k = D * Math.tan(tt) / P.tileSize; flat = [-k * Math.cos(az), -k * Math.sin(az)]; }
    // spectral bands: trace each wavelength only when its fringes exceed a third of a pixel
    let bands = [{lam:550, w:[1, 1, 1]}];
    if (!refl && P.dispersion > 0) {
      const dn = (nWater(400, sal) - nWater(700, sal)) * P.dispersion;
      const fringePx = D * sigma * dn / (nMean * nMean) / P.tileSize * A;
      if (fringePx > 0.33) bands = spectralBands(S.playing ? Math.min(Q.bands, 3) : Q.bands);
    }
    const F0 = refl ? fresnel(Math.sin(e), nMean) : 1 - fresnel(Math.sin(e), nMean);
    const dev = refl ? 2.2 : 0.3;
    const marg = clamp(D * dev * 3.2 * sigma / Math.max(Math.sin(e), 0.3) / P.tileSize + P.chop * sigma * 0.5 / (2 * Math.PI / P.wavelength) / P.tileSize + 0.01, 0.02, 0.6);
    const mc = Math.ceil(marg * M), G = M + 2 * mc;
    const p = PR.mesh; gl.useProgram(p.p);
    tex(p, 'uSa', fA.tex, 0); tex(p, 'uSb', fB.tex, 1); tex(p, 'uSm', rm.tex, 2);
    i1(p, 'uM', M); i1(p, 'uG', G); i1(p, 'uMargin', mc); i1(p, 'uRefl', refl ? 1 : 0);
    f1(p, 'uTile', P.tileSize); f1(p, 'uDepth', D); f1(p, 'uChop', P.chop); f1(p, 'uF0', F0);
    f3(p, 'uL', ...L0); f2(p, 'uFlat', ...flat); f1(p, 'uA', A);
    for (const b of bands) {
      const n = bands.length > 1 ? nMean + (nWater(b.lam, sal) - nMean) * P.dispersion : nMean;
      let m = b.w;
      if (!refl && P.bakeColor) {
        if (bands.length > 1) m = m.map(v => v * Math.exp(-absorb(b.lam) * Lpath));
        else m = [Math.exp(-absorb(610) * Lpath), Math.exp(-absorb(550) * Lpath), Math.exp(-absorb(465) * Lpath)];
      }
      f1(p, 'uN', n); f3(p, 'uMask', ...m);
      gl.drawArrays(gl.TRIANGLES, 0, G * G * 6);
    }
    rSun = refl ? D * Math.tan(th) / Math.pow(Math.max(Math.sin(e), 0.2), 1.5) : (Lpath * Math.tan(th) / nMean) / Math.cos(tt) / P.tileSize * P.tileSize;
    rSun /= P.tileSize;
    if (!refl) {
      const b = wt.b * P.scatterK;
      const unsc = Math.exp(-b * Lpath);
      mixS = 1 - unsc;
      r2 = Math.hypot(rSun, Lpath * Math.tan(5 * DEG) / P.tileSize);
      lines.push(`Refracted light travels ${(90 - tt / DEG).toFixed(1)}° above horizontal underwater (not ${P.sunElev.toFixed(1)}°): aim the fake light along that, azimuth ${P.sunAz.toFixed(0)}°`);
      lines.push(`${bands.length > 1 ? bands.length + ' wavelengths traced (dispersion fringes visible at this scale)' : 'One wavelength traced: dispersion fringes are below a third of a pixel here'} · ${(unsc * 100).toFixed(1)}% of light reaches the floor unscattered`);
    } else {
      lines.push(`Aim the fake light straight up at ${P.sunElev.toFixed(1)}° elevation (the sun mirrored in the water). Reflected sun is ${(F0 * 100).toFixed(1)}% of direct sun; each facet carries its own Fresnel weight`);
    }
    const onset = W.kappa > 0 ? (refl ? 0.22 : 1.6) / W.kappa : Infinity;
    lines.unshift(`Caustic lines start to focus ≈ ${onset < 100 ? onset.toFixed(2) + ' m' : 'beyond 100 m'} from the surface (set: ${D.toFixed(2)} m) · sun-disk blur Ø ${(rSun * 2 * P.tileSize * 1000).toFixed(1)} mm`);
  }
  gl.disable(gl.BLEND);
  mips(acc);
  const rT = Math.max(rSun, 0.75 / res);
  const out = tgt('cout', res, res, 'f16');
  pass(PR.disk, out, p => {
    tex(p, 'uSrc', acc.tex, 0); f1(p, 'uRad', rT); f1(p, 'uRad2', Math.max(r2, rT)); f1(p, 'uMix', mixS);
    f1(p, 'uGain', 1); f1(p, 'uLimb', 0.6); f1(p, 'uRadK', radK); f1(p, 'uSrcRes', A); i1(p, 'uClampY', target === 2 ? 1 : 0);
    i1(p, 'uTaps', Q.taps); f1(p, 'uLod', lodFor(rT, A, Q.taps, 1)); f1(p, 'uLod2', lodFor(Math.max(r2, rT), A, Q.taps, 1));
  });
  const kp = 2 * Math.PI / P.wavelength;
  const w = Math.sqrt((9.81 * kp + 7.4e-5 * kp ** 3) * Math.tanh(Math.min(kp * Hw, 10))) * P.timeScale;
  info = [`Simulated surface ${N}² (${(P.tileSize / N * 1000).toFixed(1)} mm per sample) · ${M}² light rays · linear output, mean 1.0`,
          `Dominant waves: period ${(2 * Math.PI / w).toFixed(2)} s, moving ${(w / kp).toFixed(2)} m/s`, ...lines].join('\n') +
         (tl.loop ? `\nEvery wave completes whole cycles in ${fmtLen(tl.len)}` : '');
  return out;
}

/*@@PART trengine@@*/
/*@@PART window@@*/
/*@@PART shapes@@*/
/* =====================================================================
   FRAME (with shutter motion blur)
   ===================================================================== */
function renderAt(t) {
  if (MODES[S.mode].kind === 'trees') return renderTrees(S.p[S.mode], S.res, t, TL());
  if (MODES[S.mode].kind === 'windows') return renderWindows(S.p[S.mode], S.res, t, TL());
  if (MODES[S.mode].kind === 'shapes') return renderShapes(S.p[S.mode], S.res, t, TL());
  return renderCaustics(S.p[S.mode], S.res, t, MODES[S.mode].target, TL());
}
function render(expT) {
  syncShotTimeline();
  const tl = TL(), Q = QUAL[S.quality];
  const sub = tl.shutter > 0 && (!S.playing || S.mbPlay) ? Q.sub : 1;
  let out;
  if (sub <= 1) out = renderAt(S.t);
  else {
    const span = tl.shutter / 360 / S.fps;
    const acc = tgt('mblur', S.res, S.res, 'f16');
    let msg = '';
    for (let k = 0; k < sub; k++) {
      const o = renderAt(S.t + ((k + 0.5) / sub - 0.5) * span);
      if (k === 0) msg = info;
      bindTarget(acc);
      if (k === 0) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      pass(PR.copy, acc, p => { tex(p, 'uSrc', o.tex, 0); f1(p, 'uGain', 1 / sub); });
      gl.disable(gl.BLEND);
    }
    info = msg;
    out = acc;
  }
  if (usesPool()) out = poolPass(out);
  // in a shot the hull pattern runs the length of the hull, so it is not faded at the sides
  if (S.mode === 'hull' && S.p.hull.fade > 0 && !(shotActive() && S.view === 'scene')) out = fadePass(out, S.p.hull.fade);
  out = ovlApply(out);
  const Pp = S.post[S.mode];
  // an export renders the same post pass into its own float target, at the export size
  const fin = expT || tgt('final', S.res, S.res, 'u8', true);
  pass(PR.post, fin, p => {
    tex(p, 'uSrc', out.tex, 0); f1(p, 'uExpo', Pp.exposure); f1(p, 'uRoll', Pp.rolloff);
    f1(p, 'uBlack', Pp.black); f1(p, 'uWhite', Pp.white); f1(p, 'uGamma', Pp.gamma);
    f1(p, 'uContrast', Pp.contrast); f1(p, 'uFloor', Pp.floor); i1(p, 'uInv', Pp.invert ? 1 : 0);
  });
  if (expT) return;
  mips(fin);
  goboInfo = info;
}
let goboInfo = '';
function display() {
  const fin = targets.final;
  if (!fin) return;
  if (S.view === 'scene') { info = goboInfo + '\n' + drawScene(fin).join('\n'); gizDraw(); return; }
  if (gcv && gcv.width) gizDraw();
  info = goboInfo;
  pass(PR.disp, null, p => {
    tex(p, 'uSrc', fin.tex, 0); f1(p, 'uTiles', S.tiles); i1(p, 'uHeat', S.heat ? 1 : 0); i1(p, 'uSeams', S.seams ? 1 : 0);
  });
}

/*@@PART host@@*/
/*@@PART scene@@*/
/*@@PART ui@@*/
/*@@PART paint@@*/
/*@@PART exr@@*/
/*@@PART shot@@*/
/*@@PART gizmo@@*/
/*@@PART export@@*/
/*@@PART rig@@*/
/*@@PART api@@*/
/* =====================================================================
   LOOP
   ===================================================================== */
let dirty = true, viewDirty = false, last = performance.now(), msAvg = 0, hudTimer = 0;
function tick(now) {
  if (EXPORT.busy) { last = now; requestAnimationFrame(tick); return; }   // an export owns the GPU until it finishes
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  const len = TL().len;
  if (S.playing) {
    const f0 = Math.floor(S.t * S.fps + 1e-6);
    S.t = (S.t + dt) % len;
    // only draw when the timeline reaches a new frame: at 24 fps this is well under half the GPU work of drawing every display refresh
    if (Math.floor(S.t * S.fps + 1e-6) !== f0) dirty = true;
  }
  if (dirty || viewDirty) {
    const full = dirty;
    dirty = false; viewDirty = false;
    const t0 = performance.now();
    try { if (full) render(); display(); } catch (e) { console.error(e); showErr(String(e && e.stack || e)); }
    if (full) updateTransport();
    $('info').textContent = info;
    const cost = performance.now() - t0;
    if (full) msAvg = msAvg ? msAvg * 0.85 + cost * 0.15 : cost;
  }
  if (now - hudTimer > 500) { hudTimer = now; updateHud(S.playing ? msAvg : 0); }
  requestAnimationFrame(tick);
}

buildModes(); buildPanel(); buildTimeline(); fit(); setPlaying(true); updateHud(0);
window.__cuc = {SHOT, selectShot, shotPick, gizHandles, GIZ, windSetup, EXR, EXPORT, S, render: () => { render(); display(); $('info').textContent = info; }, display, drawScene, MODES, DEFAULTS, targets, gl, runFFT, tgt, PR, pass, dataTex, tex, i1, f1, TR, SC, sceneLight, goboProjection, shotSpace, HOST};
requestAnimationFrame(tick);
})();
