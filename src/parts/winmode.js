/* ---------- Windows: sunlight through a real window ---------- */
const WIN_STYLES = ['Picture window', 'Double-hung sash', 'Prairie (border lites)', 'Casement pair', 'French doors', 'Industrial steel', 'Leaded diamonds', 'Arched sunburst', 'Round oculus', 'Sliding'];
// per style: size, frame, glazing bar and pane layout (upper / lower sash for double-hung)
const WIN_STYLE_DEF = [
  {W:1.6, H:1.2, fw:0.07, bw:0.022, cols:1, rows:1, cols2:1, rows2:1},
  {W:0.9, H:1.5, fw:0.065, bw:0.022, cols:3, rows:2, cols2:3, rows2:2},
  {W:1.2, H:1.4, fw:0.07, bw:0.022, cols:1, rows:1, cols2:1, rows2:1},
  {W:1.2, H:1.3, fw:0.065, bw:0.022, cols:2, rows:3, cols2:1, rows2:1},
  {W:1.5, H:2.2, fw:0.075, bw:0.024, cols:2, rows:5, cols2:1, rows2:1},
  {W:2.0, H:2.4, fw:0.04, bw:0.03, cols:5, rows:6, cols2:1, rows2:1},
  {W:0.8, H:1.2, fw:0.06, bw:0.007, cols:5, rows:1, cols2:1, rows2:1},
  {W:1.0, H:1.9, fw:0.07, bw:0.022, cols:2, rows:3, cols2:1, rows2:1},
  {W:0.9, H:0.9, fw:0.07, bw:0.024, cols:2, rows:2, cols2:1, rows2:1},
  {W:1.6, H:1.1, fw:0.06, bw:0.022, cols:1, rows:1, cols2:1, rows2:1},
];
const OPEN_LABEL = {1:'Lower sash raised', 5:'Pivot vent open', 9:'Slider open'};
const treeChoices = () => ['None', ...MODES.trees.presets.filter(p => !/white frame/.test(p.name)).map(p => p.name)];
MODES.windows = {
  short:'Windows', kind:'windows', tileable:false, tl:{loop:true, len:20, shutter:180},
  onParam(k, P) {
    if (k === 'style') { Object.assign(P, WIN_STYLE_DEF[P.style | 0]); return true; }
    if (k === 'rain') { const on = P.rain > 0, ch = on !== this._rainOn; this._rainOn = on; return ch; }
    return ['blind', 'curtain', 'trees', 'glass'].includes(k);
  },
  get groups() {
    const P = S.p.windows;
    this._rainOn = P.rain > 0;
    const st = P.style | 0;
    const win = [
      {k:'style', l:'Style', opts:WIN_STYLES},
      {k:'W', l:'Width', min:0.3, max:4, step:0.01, u:'m'},
      {k:'H', l:'Height', min:0.3, max:3.5, step:0.01, u:'m'},
      {k:'fw', l:'Frame & sash width', min:0.015, max:0.15, step:0.001, fmt:v => (v * 1000).toFixed(0) + ' mm', h:'Width of the frame and the sash rails and stiles.'},
    ];
    if (st !== 2) win.push({k:'bw', l:st === 6 ? 'Lead came width' : 'Glazing bar width', min:0.003, max:0.06, step:0.001, fmt:v => (v * 1000).toFixed(0) + ' mm'});
    if (st !== 2) win.push(
      {k:'cols', l:st === 1 ? 'Upper sash panes across' : st === 6 ? 'Diamonds across' : st === 7 ? 'Panes across (sunburst rays)' : st === 8 ? 'Spokes per quarter' : 'Panes across', min:1, max:12, step:1},
      {k:'rows', l:st === 1 ? 'Upper sash panes down' : st === 6 ? 'Diamond height' : st === 8 ? 'Inner ring (0/1+)' : 'Panes down', min:st === 8 ? 0 : 1, max:12, step:1});
    if (st === 1) win.push({k:'cols2', l:'Lower sash panes across', min:1, max:12, step:1}, {k:'rows2', l:'Lower sash panes down', min:1, max:12, step:1});
    if (st === 2) win.push({k:'border', l:'Border lite width', min:0.04, max:0.3, step:0.005, u:'m'});
    if (OPEN_LABEL[st]) win.push({k:'open', l:OPEN_LABEL[st], min:0, max:1, step:0.01});
    win.push(
      {k:'wallT', l:'Wall thickness', min:0.05, max:0.7, step:0.01, u:'m', h:'The reveal around the window clips the beam at an angle, so the patch narrows as the sun swings across.'},
      {k:'inset', l:'Window position in wall', min:0, max:1, step:0.01, fmt:v => v < 0.05 ? 'Outside face' : v > 0.95 ? 'Inside face' : (v * 100).toFixed(0) + '% in', h:'Where the frame sits within the wall depth.'},
    );
    const glass = [
      {k:'glass', l:'Glass', opts:['Clear float', 'Old wavy (antique)', 'Seeded (bubbles)', 'Reeded (fluted)', 'Textured obscure', 'Frosted (acid etched)', 'Wired safety glass']},
      {k:'glazing', l:'Glazing', opts:['Single pane', 'Double glazed', 'Triple glazed'], h:'Each pane reflects about 8% at normal incidence and more at grazing angles (Fresnel).'},
    ];
    if (P.glass === 1 || P.glass === 2 || P.glass === 0) glass.push({k:'distort', l:'Glass waviness', min:0, max:4, step:0.01, u:'×', h:'Thickness ripples in the glass bend the light into soft caustic streaks. Old cylinder glass is 1–2×.'});
    if (P.glass === 3 || P.glass === 4) glass.push({k:'distort', l:'Texture strength', min:0.2, max:3, step:0.01, u:'×', h:'How far the textured glass spreads the light.'});
    glass.push({k:'screen', l:'Insect screen', opts:['None', 'Full screen', 'Lower half'], h:'Fine mesh outside the glass: it cuts about a third of the light and its frame casts a shadow.'});
    const dirt = [
      {k:'grime', l:'Dust & grime', min:0, max:1, step:0.01, h:'Builds up in the corners and along the bottom of each pane.'},
      {k:'smudge', l:'Smudges & wipe marks', min:0, max:1, step:0.01},
      {k:'spots', l:'Dried water spots', min:0, max:1, step:0.01},
      {k:'rain', l:'Rain', min:0, max:2, step:0.01, h:'Each drop is a tiny lens: it throws a dark ring with a bright focused centre. Above 1 is a downpour. Drops only show crisply when the lit surface is close to the glass; further away each one blurs into a soft mottle, so lower "Distance to lit surface" (and keep the sun small) to make the rain more prominent.'},
      ...(P.rain > 0 ? [
        {k:'rainDrops', l:'Beaded drops', min:0, max:3, step:0.01, u:'×', h:'How many little drops sit on the glass.'},
        {k:'rainRun', l:'Running drops', min:0, max:3, step:0.01, u:'×', h:'How many drops break loose and run down, leaving wet trails.'},
        {k:'rainSize', l:'Drop size', min:0.3, max:3, step:0.01, u:'×'},
        {k:'rainLens', l:'Drop contrast', min:0.2, max:2.5, step:0.01, u:'×', h:'How strongly each drop focuses and shades the light: higher makes the rain more prominent in the gobo.'},
        {k:'rainSpeed', l:'Running speed', min:0.2, max:3, step:0.01, u:'×'},
      ] : []),
      {k:'fog', l:'Condensation', min:0, max:1, step:0.01, h:'Fog on the lower part of each pane, broken by drips running down.'},
    ];
    const bl = P.blind | 0;
    const blinds = [{k:'blind', l:'Blinds & shades', opts:['None', 'Venetian, 25 mm aluminium', 'Venetian, 50 mm wood', 'Vertical blinds', 'Plantation shutters', 'Roller shade', 'Pleated shade']}];
    if (bl === 1 || bl === 2 || bl === 3 || bl === 4) blinds.push({k:'tilt', l:'Slat tilt', min:-80, max:80, step:0.5, u:'°', h:'0° is fully open. As the slats close the light bars thin, and with the sun high, slats tilted the other way block it sooner.'});
    if (bl && bl !== 4) blinds.push({k:'lower', l:bl === 3 ? 'Drawn across' : 'Lowered', min:0, max:1, step:0.01, fmt:v => (v * 100).toFixed(0) + '%'});
    if (bl === 1 || bl === 2 || bl === 3 || bl === 4) blinds.push({k:'imperf', l:'Wear & unevenness', min:0, max:1, step:0.01, h:'Slats that sag, twist or sit at slightly different angles.'});
    const cu = P.curtain | 0;
    const curt = [{k:'curtain', l:'Curtains', opts:['None', 'Sheer voile', 'Lace', 'Linen', 'Blackout drapes', 'Café curtain (sheer, lower half)']}];
    if (cu) {
      if (cu !== 5) curt.push({k:'cOpen', l:'Drawn open', min:0, max:1, step:0.01, fmt:v => (v * 100).toFixed(0) + '%'});
      curt.push({k:'full', l:'Fullness', min:1.2, max:3.5, step:0.05, u:'×', h:'Fabric width over the width it hangs across. More fullness means deeper folds.'},
                {k:'breeze', l:'Breeze', min:0, max:1, step:0.01, h:'Air through an open window: folds drift and the hem billows. 0 is still.'});
    }
    const out = [
      {k:'eave', l:'Roof eave overhang', min:0, max:1.5, step:0.01, u:'m', h:'Depth of an eave or awning above the window. With a high sun it shades the top of the window.'},
      {k:'eaveH', l:'Eave height above window', min:0, max:1.5, step:0.01, u:'m'},
      {k:'trees', l:'Trees outside', opts:treeChoices(), h:'A real tree canopy between the sun and the window, with its own wind and its own (much softer) shadow edges.'}];
    if (P.trees) out.push(
      {k:'treeDist', l:'Canopy distance', min:2, max:40, step:0.1, u:'m', h:'From the window out to the middle of the canopy, along the sunlight.'},
      {k:'treeCover', l:'Canopy cover', min:0.1, max:1.4, step:0.01},
      {k:'treeWind', l:'Wind', min:0, max:12, step:0.1, u:'m/s'},
    );
    const sun = [
      {k:'sunElev', l:'Sun elevation', min:3, max:80, step:0.5, u:'°'},
      {k:'sunAz', l:'Sun angle across the window', min:-75, max:75, step:0.5, u:'°', h:'0° is square to the window. Off-axis sun narrows the patch and the reveal eats into one side.'},
      {k:'srcSize', l:'Sun size (softness)', min:0.2, max:8, step:0.01, u:'°', h:'Angular size of the light source. The clear sun is 0.53°; haze or thin cloud spreads it into a bright glow several degrees across, which softens every edge.'},
      {k:'recv', l:'Distance to lit surface', min:0.2, max:8, step:0.05, u:'m', h:'From the glass to where the light lands, along the beam. Further away, every shadow edge softens (the sun is 0.53° across).'},
      {k:'zoom', l:'Framing', min:0.5, max:3, step:0.01, u:'×', h:'1× fits the projected window with a small margin. Larger shows more black around it.'},
    ];
    return [{name:'Window', params:win}, {name:'Glass', params:glass}, {name:'Dirt & weather', params:dirt}, {name:'Blinds & shades', params:blinds}, {name:'Curtains', params:curt}, {name:'Outside', params:out}, {name:'Sun & throw', params:sun}];
  },
  presets:[
    {name:'Four-pane window', v:{seed:7, style:0, ...WIN_STYLE_DEF[0], W:1.1, H:1.3, fw:0.06, bw:0.034, cols:2, rows:2, border:0.12, open:0, wallT:0.3, inset:0.3, glass:0, glazing:1, distort:1, screen:0,
      grime:0.15, smudge:0.1, spots:0, rain:0, rainDrops:1, rainRun:1, rainSize:1, rainLens:1, rainSpeed:1, fog:0, blind:0, tilt:10, lower:1, imperf:0.3, curtain:0, cOpen:0.3, full:2.0, breeze:0.3,
      trees:0, treeDist:8, treeCover:0.6, treeWind:2.5, eave:0, eaveH:0.3, sunElev:35, sunAz:15, srcSize:0.53, recv:2.4, zoom:1}},
    {name:'Two casements, eight lites', v:{style:3, ...WIN_STYLE_DEF[3], W:1.2, H:1.5, cols:2, rows:4, sunElev:32, sunAz:-18}},
    {name:'Six-over-six sash', v:{style:1, ...WIN_STYLE_DEF[1], glass:1, glazing:0, distort:0.6, grime:0.25, sunElev:30, sunAz:15}},
    {name:'One-over-one sash', v:{style:1, ...WIN_STYLE_DEF[1], cols:1, rows:1, cols2:1, rows2:1, sunElev:38, sunAz:20}},
    {name:'Grid window, raking sun', v:{style:0, ...WIN_STYLE_DEF[0], W:1.6, H:1.2, cols:4, rows:3, bw:0.03, sunElev:16, sunAz:38, recv:3}},
    {name:'Tall French window', v:{style:4, ...WIN_STYLE_DEF[4], sunElev:25, sunAz:12, recv:3}},
    {name:'Arched window', v:{style:7, ...WIN_STYLE_DEF[7], sunElev:35, sunAz:10, recv:2.6}},
    {name:'Cross window, hazy sun', v:{style:0, ...WIN_STYLE_DEF[0], W:1.1, H:1.3, cols:2, rows:2, bw:0.05, srcSize:3, sunElev:30, sunAz:12, recv:2.5}},
    {name:'Sheer curtains', v:{style:3, ...WIN_STYLE_DEF[3], cols:1, rows:2, curtain:1, cOpen:0.3, full:2.0, breeze:0.4, sunElev:33, sunAz:10}},
    {name:'Lace curtains', v:{style:0, ...WIN_STYLE_DEF[0], W:1.1, H:1.4, cols:1, rows:1, curtain:2, cOpen:0, full:1.5, breeze:0.1, sunElev:30, sunAz:-12, recv:1.8}},
    {name:'Window with a tree outside', v:{style:0, ...WIN_STYLE_DEF[0], W:1.1, H:1.3, cols:2, rows:2, bw:0.034, trees:1, treeDist:7, treeCover:0.55, treeWind:2.5, sunElev:35, sunAz:15}},
    {name:'Venetian blinds', v:{style:0, ...WIN_STYLE_DEF[0], blind:1, tilt:10, lower:1, imperf:0.35, sunElev:28, sunAz:22, recv:2}},
    {name:'Wood blinds, partly raised', v:{style:0, ...WIN_STYLE_DEF[0], W:1.3, H:1.4, blind:2, tilt:12, lower:0.75, imperf:0.4, sunElev:30, sunAz:-15}},
    {name:'Plantation shutters', v:{style:0, ...WIN_STYLE_DEF[0], W:1.1, H:1.5, blind:4, tilt:20, imperf:0.2, sunElev:35, sunAz:20, recv:2}},
    {name:'Roller shade half down', v:{style:3, ...WIN_STYLE_DEF[3], cols:1, rows:2, blind:5, lower:0.5, sunElev:35, sunAz:-15, recv:2}},
    {name:'Barred window', v:{style:0, ...WIN_STYLE_DEF[0], W:1.0, H:1.2, fw:0.05, bw:0.028, cols:6, rows:1, sunElev:30, sunAz:10, recv:2.5}},
    {name:'High sun under an eave', v:{style:3, ...WIN_STYLE_DEF[3], eave:0.45, eaveH:0.35, wallT:0.2, sunElev:50, sunAz:-10, recv:2.2}},
    {name:'Sun shower on the glass', v:{style:0, ...WIN_STYLE_DEF[0], W:1.1, H:1.3, cols:2, rows:2, bw:0.034, rain:1.4, rainDrops:1.6, rainRun:1.5, rainSize:1.6, rainLens:1.8, rainSpeed:1, grime:0.2, srcSize:0.53, sunElev:32, sunAz:12, recv:0.7}},
    {name:'Old leaded window', v:{style:6, ...WIN_STYLE_DEF[6], glass:1, glazing:0, distort:1.4, grime:0.35, sunElev:30, sunAz:15, recv:1.8, wallT:0.5, inset:0.25}},
  ],
  post:{exposure:0, rolloff:0, gamma:1, contrast:0, black:0, white:1, floor:0, invert:false},
};
