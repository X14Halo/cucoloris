# Cucoloris Lab

**Physically based, animated light gobos (cookies) for lighting and compositing.**
Water caustics, tree shadows, window light and classic cookies, simulated in real time in the browser,
previewed on a stand-in set or a real shot, and exported as image sequences with a light rig that
drops the light into the shot with the gobo attached.

Web version: https://x14halo.github.io/cucoloris/ · Production notes for TDs: [docs/HOUDINI.md](docs/HOUDINI.md)

---

## Contents

1. [What it is for, and who it is for](#what-it-is-for-and-who-it-is-for)
2. [How it is meant to be used](#how-it-is-meant-to-be-used)
3. [The patterns](#the-patterns)
4. [Framing, painting and motion](#framing-painting-and-motion)
5. [The Scene view](#the-scene-view)
6. [Several lights](#several-lights)
7. [Exporting](#exporting)
8. [How it works inside](#how-it-works-inside)
9. [Production: hosting it in Houdini](#production-hosting-it-in-houdini)
10. [Source layout, building and testing](#source-layout-building-and-testing)
11. [Keyboard and mouse](#keyboard-and-mouse)
12. [Known limits](#known-limits)

---

## What it is for, and who it is for

Gobos made by hand (a painted texture, a noise in a shader, a photo of leaves) tend to read as fake: the
shadow edges are all equally sharp, the motion is a slide or a wobble, and the brightness drifts. Real
dappled light has rules. A leaf high in a canopy throws a round, soft sun spot; a window bar close to the
floor throws a crisp edge; caustics under a wave focus into bright filaments while the average light stays
the same. Cucoloris Lab gets those right by simulating the thing that casts the light, not the light pattern.

**Who uses it**

| Who | What they get out of it |
|---|---|
| **Lighting artists** | A gobo built for the shot: dial in the pattern, see it on the shot itself, keep the hero lit, export the sequence and the light in one go. |
| **Compositors** | Linear, seamless, looping light patterns (EXR) to grade light into plates or multiply over renders, with the light's own sun-softened edges. |
| **Look-dev and environment artists** | A library of physically correct cookies (caustics, canopies, windows) at any resolution up to 4K, tiling and looping. |
| **Pipeline TDs** | One page that runs the same on the web and inside Houdini, a small host contract to fill in, a USD light rig with the exact projection maths, and tests that keep both versions matched. |

**What makes it different from a texture**

- **Real geometry and real optics.** Water is an FFT ocean; light is traced through it. Trees are grown in 3D
  and their leaves are traced across the sun's disk. Window frames, blinds and curtains sit at their real depth.
- **Edges soften by their real distance.** Each layer's shadow is blurred by the sun disk at its own height,
  so near shadows are crisp and far ones round off, as in life.
- **Energy is kept.** Caustics have a mean of 1.0: they redistribute light without dimming or brightening the shot.
- **Real motion.** Water waves follow the dispersion of real water; trees are pushed by a simulated turbulent
  wind, every limb, branch and twig a damped oscillator with measured frequencies; leaves flutter once the
  local wind passes a species threshold.
- **Production output.** Tileable and loopable where that makes sense, linear EXR/Ptex/TIFF/PNG/JPEG, any size
  from 512 to 4096 px, with a USD light rig.
- **Fast.** Everything runs on the GPU in real time, so you can scrub the timeline and judge the animation,
  which is the whole point of a moving gobo.

---

## How it is meant to be used

A typical session, start to finish:

1. **Pick a pattern** from the tabs: Underwater, Underside, Hull & walls, Tree shadows, Windows or Shapes.
2. **Start from a preset** (the chips above the controls) and adjust. Controls run from what sets up the shot
   (tile size, sun angle, water depth) to the look, then fine detail and motion. Hover a label for help;
   double-click a label to reset it.
3. **Scrub and play** the timeline to judge the motion. Turn on motion blur (shutter) for the final look.
4. **Switch to the Scene view** to see it on a set: a stand-in matched to the pattern, or a real shot picked
   in the **Shot** menu. Aim and place the light (click in the shot to aim, or drag the light's handles).
5. **Keep the hero lit** if the pattern keeps landing a shadow on a face: pick the spot, find the best offset.
6. **Compare looks** with snapshots A–D and the wipe.
7. **Paint** where the generated pattern needs help: thin or fill leaves, remove a branch, open up caustics.
8. **Add more lights** if the shot needs them (a key through trees, a bounce of water caustics, a window).
9. **Export**: one frame, a range or the whole timeline, with a light rig. In production the light appears in
   the Houdini scene in the right place with the sequence attached.

Everything is saved in the browser as you go, and the whole setup can be saved as a `.cucoloris.json`
settings file that rebuilds the same gobo exactly.

---

## The patterns

### Water caustics (Underwater, Underside, Hull & walls)

- A Tessendorf FFT spectral ocean (JONSWAP/Phillips-type spectrum with directional spread, fetch, swell and
  capillary ripples) simulated on the GPU, tiled and looping.
- **Underwater**: light refracted down through the surface onto a floor, rocks or a diver, at a chosen depth.
- **Underside**: light reflected up off the water onto docks, bridges, hulls and ceilings.
- **Hull & walls**: reflected caustics on vertical surfaces at the waterline, fading with height.
- Light is carried through an energy-conserving photon mesh: each cell of the surface sends its light to where
  the refracted (or reflected) rays land, so focusing makes bright filaments while the mean stays 1.0.
- Sun disk size, scattering, chromatic dispersion and an optional baked colour.
- **Imperfections** (debris, foam, surface slicks) and **splashes**: raindrops, drips or a fish breaking the
  surface, each sending a ring of waves out by the exact gravity–capillary dispersion of water.

### Tree shadows

- Species: oak, maple, birch, quaking aspen, Scots pine, coconut palm, **Norway spruce**, **subalpine fir**,
  **larch**, **birch in winter (bare)** and **aspen in winter (bare)**.
- Broadleaves are grown by **space colonization** inside a species crown envelope, with leaves placed where
  light reaches them (Beer–Lambert), so crowns have a leafy shell and a bare inside. Leaves have the real
  size and shape of each species.
- **Conifers** grow a straight leader with whorls of branches that sag and turn up at the tips (spruce) or
  lie in flat layers (fir), carrying flat needle sprays and hanging branchlets. They stand as separate trees,
  so a forest throws distinct crowns with sky between them.
- **Bare winter trees** are all wood: every shoot ends in a fan of forked fine twigs.
- **Snow on the branches** lays opaque snow along every level branch and in pillows on conifer sprays.
- The canopy is seamless: branches enter the tile from trunks outside it and the tile wraps in both
  directions. Output is in **light space** (seen along the sun), so it is projected along the sun.
- Every leaf is traced across the sun disk from its own height (eight height slices with interpolation), so
  gaps throw round sun spots and leaf edges soften with distance.
- **Wind**: a time-domain simulation. Turbulent wind with gusts that roll across the canopy drives each
  limb, branch and twig spray as a damped cantilever; leaves flutter and lean over as the wind rises. Wind
  speed, direction, gusts, local eddies, turbulence and the flexibility of limbs, twigs and leaves.

### Windows

- Ten window styles (double-hung, casement, French doors, industrial steel, leaded diamonds, arched sunburst,
  oculus and more) with real wall reveals and roof eaves.
- Glass: wavy antique, seeded, reeded, frosted, wired; **tinted** (amber, green, cobalt) or **stained glass**.
- Dirt: dust, smudges, water spots, condensation and **rain** (beaded and running drops, size, contrast, speed).
  Raindrops and rippled glass act as small lenses and **bend the view** of anything outside.
- Blinds and shades: venetian and vertical blinds, plantation shutters, roller and pleated shades; sheer,
  lace, linen or blackout curtains moving in a breeze.
- **Trees outside**: a real tree canopy from the Tree shadows mode, at its own distance, with its own wind.
- Every layer is traced across the sun disk at its true depth, so each shadow softens by its own distance.

### Shapes

- **Soft noise**: soft blobs, soft clouds, soft mottling, billows, wandering pools, marbled flow, an uneven
  wash and soft spots, for adding interest to a key light without drawing the eye. Controls for size,
  coverage, softness, darkest shadow, detail, roughness, flow distortion, clumping and stretch.
- **Shafts and beams**: light shafts (fan), curtain shafts and parallel beams, shimmering slowly with dust.
- **Classic cookies**: a cucoloris board, splotches, ragged streaks, dappled holes and an art deco fanlight,
  which can sway on their stand.
- Motion: morphing through endless offset versions of itself (shapes stretch, merge and split instead of
  fading), evolving, flowing currents and drift, with an overall speed up to 20×.
- **Paint your own**: a canvas with soft round, light beam, soft streak, cloud, mottle and soft-dot brushes,
  whose strokes can be given motion of their own.

Shapes holds no water or leaves on purpose: those are real simulations in their own modes.

---

## Framing, painting and motion

- **Framing** (every pattern): **Light pool** (the default; the pattern sits in a soft pool of light with dark,
  organic edges, with radius and fade controls), **Seamless** (tiles in every direction) or **Single element**
  (one branch cluster or palm, centred in open white sunlight).
- **Gobo resolution**: 512 to 4096 px. Every simulated pattern is recalculated from its geometry at the new
  size; only painted layers are upscaled (smoothly).
- **Paint over** (every pattern): paint in the panel, on the Gobo preview, or in the Scene view right where
  the light lands. On trees it paints leaf density (removing or growing real leaves, tied to where each leaf
  hangs, so the change sways with the tree), and a *Remove branches* brush takes out whole limbs. On shapes
  the paint travels with the moving pattern; on caustics and windows it opens up or thickens light in place.
- **Timeline**: real seconds and frames, a loop length for looping patterns, and a shutter angle for
  motion blur. Paused motion-blurred frames are cached, so grading and painting stay quick.
- **Snapshots A–D**: click an empty slot to save the current look, a full one to recall it (Shift-click
  overwrites, Alt-click clears). *Compare* shows a snapshot against the live gobo with a wipe you drag,
  in the Gobo or the Scene view.
- **Mean brightness**: the HUD shows the gobo's average transmission and what that costs in stops.

---

## The Scene view

- A **stand-in set** matched to each pattern (a floor lit from above for underwater caustics, a dock lit from
  below, a wall at the waterline, a floor and wall with a test sphere for trees and windows), or a **shot**.
- **Shots**: the Shot menu lists shots (in production, your sequences and shots from the pipeline). A shot
  is rebuilt from its **utility passes** (world position, normals, optional surface colour) and its camera:
  the pixels become a rough 3D model, and the light casts shadows from the shot's own geometry. Its speed
  depends on image resolution, not on how heavy the set is. The web version ships two clearly labelled
  placeholder shots made up for this tool (a courtyard under a big tree, and a living room lit through a
  window), rendered into utility passes the same way a real shot's would be read.
- **The light**: a spotlight (default) or a sun. Projection angle, beam shape and softness, gobo blur,
  rotation, offset, intensity and colour; distance, azimuth and elevation around an aim point. *Keep real-world
  scale* sizes the gobo so a tile lands at its true size. *Use the pattern's sun angle* points a sun the way
  the pattern was simulated.
- **Light manipulator**: click the light to select it; W for translate handles, E for rotate rings, Maya style.
- **Camera**: Maya controls (Alt + left tumble, Alt + middle track, Alt + right dolly, scroll zoom, F to frame).
  In a shot, look through the shot camera or move freely; view each utility pass.
- **Gobo inset**: a small copy of the gobo with a crosshair showing where the point under the cursor takes its light from.
- **Keep hero lit**: click *Pick the hero spot*, click the face or hands in the view, set the spot size and
  click *Find the best offset*. The tool renders the gobo at eight moments across the timeline, tries every
  offset of the image across the beam (a whole tile for repeating gobos, a short way for framed ones), and keeps
  the one where the spot is lit most, most steadily. The light does not move; the offset is exported with the rig.

---

## Several lights

A scene can hold several gobo lights, each with its own pattern, settings, painting and placement. The
**Lights** list selects, renames, hides, adds and deletes them, and clicking a light in the Scene view selects
it. Everything in the panel belongs to the selected light. The Scene view adds all lights together in linear
light. Export writes the selected light, or every shown light, each with its own sequence and light rig.

---

## Exporting

The **Export** dialog writes the final gobo (after framing, painting and levels):

- **Frames**: the current frame, a frame range, or the whole timeline.
- **Size**: 512 to 4096 px.
- **Formats**: OpenEXR (half or float, uncompressed/RLE/ZIPS/ZIP), Ptex (8 or 16-bit, half, float; mipmapped),
  TIFF, PNG or JPEG, with sRGB or linear encoding for integer files; RGB or a single channel.
- **Light rig** (optional): a USD layer (`.light.usda`) holding the light (a `SphereLight` with `ShapingAPI`
  for a spot, a `DistantLight` for the sun) in the shot's own units and up axis, named after the light, with
  `cucoloris:*` attributes describing exactly how to project the gobo: file pattern and per-frame files,
  projection (fov and tiling, or width and centre), wrap, blur, offset, aim, mean transmission. Plus a
  `.cucoloris.json` settings file that recreates the gobo.
- **Light exposure**: *As set*, or *Compensate for the gobo*, which raises the light's exposure by the stops the
  gobo takes off on average, so adding a gobo does not darken the shot.

On the web, multi-file exports come down as a zip. In Houdini they are written into the shot's folders and the
light is created in the scene (see below).

---

## How it works inside

### One page

The tool is a single self-contained HTML file (`dist/cucoloris-lab.html`, about 1 MB) with no dependencies
and no network access. It is built from `src/` by `build.py`, which inlines every part into one script
(`/*@@PART name@@*/` markers, all inside one closure). WebGL 2 does the simulation and rendering; JavaScript
does the tree growth, wind set-up, file encoders and UI.

### Rendering pipeline (one frame)

```
pattern simulation  →  motion blur      →  framing            →  paint over  →  levels  →  final gobo
(caustics, trees,      (sub-frames         (light pool,          (in gobo       (exposure,   (u8 preview with
 windows, shapes)       across the          seamless or           space)         gamma,       mips, or float
                        shutter)            single element)                      contrast)    for export)
                                                          ↓
                                Scene view: every light's gobo projected onto the set or shot,
                                with shadows, added together in linear light, then tone-mapped
```

- **Caustics** (`water.js`, `spec2.js`): FFT ocean height and slope fields → refraction or reflection of a
  photon mesh → accumulation into the tile with the area change of each cell → sun-disk blur.
- **Trees** (`trspecies.js`, `trengine.js`, `trshaders.js`): species table → grown on a worker thread
  (space colonization, whorls, fronds, twigs, snow) → leaves and branch segments drawn into eight height
  slices of multiplicative transmission → each slice blurred by the sun disk at its own height → combined.
  Wind modes are simulated in the background and evaluated per node and per leaf on the GPU.
- **Windows** (`window.js`, `winmode.js`): the glass, frame, blinds, curtains and dirt are drawn into layered
  maps (multiple render targets: frame and glass, deflection, tint), then traced across the sun disk from each
  layer's depth, with the trees outside looked up through each ray's own bent path.
- **Shapes** (`shapes.js`, `shapemode.js`): periodic noise and cookie shaders, morph/flow/drift motion, paint.
- **Scene and shot** (`scene.js`, `shot.js`, `gizmo.js`, `lights.js`): the light's projection (shared with the
  rig export), stand-in sets, shots rebuilt from utility passes with a shadow map, the manipulator.

### State

All settings live in one state object, saved to the browser's local storage (state version 11), and in the
settings file (version 2). Selecting a light swaps that light's settings and caches in, so every part of the
tool works on "the current light".

### The host seam

The page talks to the outside world through one object, `window.CUCOLORIS_HOST`, merged over the web defaults:

| Host member | What it does | Web version |
|---|---|---|
| `shots()` | the shot list | two placeholder shots |
| `openShot(def)` | the shot's utility passes and camera | renders placeholders |
| `writeFile(path, bytes)` | writes an export file | zip download |
| `exportDir(ctx)` | where a light's files go | next to each other |
| `sendLight(rig, files)` | creates or updates the light in the scene | none |
| `frameChanged(n)` | follows the host timeline | none |

Scripts and tests drive the tool through `window.cucoloris` (set the pattern or shot, add and select lights,
get and apply settings, render a frame, export, build the light rig and its USD).

---

## Production: hosting it in Houdini

The production version is the same page in a Houdini Python Panel (`QWebEngineView`), connected over
`QWebChannel` to a Python bridge that fills in the host contract: the shot list and utility EXRs from the
pipeline, the shot camera from the USD stage, files written into the shot's lighting folder, and a Sublayer LOP
that brings in the light rig. The tool keeps its own viewer, GPU context and timeline, so scrubbing stays fast
no matter how heavy the Houdini scene is. One click on Export writes the sequence and creates the light in the
right place with the map attached.

Starting points (not yet run inside Houdini): `houdini/cucoloris_panel.py`, `houdini/cucoloris_host.js`,
`houdini/cucoloris.pypanel`. The one renderer-specific step is `attach_gobo()`, which turns the rig's
`cucoloris:gobo:*` attributes into your renderer's projected-texture light filter. Everything a TD needs (the
contract, file formats, the projection maths, a checklist and known limits) is in **[docs/HOUDINI.md](docs/HOUDINI.md)**.

---

## Source layout, building and testing

```
build.py                     src/ → dist/cucoloris-lab.html (and index.html for GitHub Pages)
src/page.html                markup and styles
src/app.js                   pattern definitions, presets, state, the render loop
src/parts/
  host.js                    the host seam (web defaults)
  api.js                     window.cucoloris
  ui.js, views.js            panel, sliders, snapshots, compare wipe, gobo inset, Keep hero lit
  water.js, spec2.js         ocean simulation and caustics
  trspecies.js, trengine.js, trshaders.js    trees: species, growth, wind, rendering
  window.js, winmode.js      windows
  shapes.js, shapemode.js    shapes and cookies
  paint.js                   painting (canvas, gobo, scene) and paint over
  scene.js, shot.js, gizmo.js, lights.js     scene view, shots, manipulator, several lights
  export.js, exr.js, rig.js  exporters (EXR, Ptex, TIFF, PNG, JPEG, zip), EXR reader, light rig and USD
  glsl_*.js, gl_program.js, helpers.js, rng.js   shared shader code and GL helpers
houdini/                     panel, bridge and host shim for Houdini
docs/HOUDINI.md              the production guide
tests/                       golden frames, projection check, host shim check
```

```
python3 build.py                 # build
python3 tests/golden.py          # every pattern and a shot against reference frames and light rigs
python3 tests/golden.py --update # rewrite the references after an intended change
python3 tests/rig_projection.py  # the exported USD light lands the gobo where the preview does
python3 tests/host_shim_mock.py  # the Houdini shim against a mock bridge
```

The tests need `pip install playwright usd-core OpenEXR numpy`; add `--software` on machines without a GPU.
Run them one at a time on small machines.

---

## Keyboard and mouse

| | |
|---|---|
| Click a slider's value | type a number (Enter keeps, Escape cancels) |
| Shift + drag a slider | fine steps |
| Double-click a label | reset that control |
| `[` / `]` | brush smaller / larger (while painting) |
| Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z | undo / redo a paint stroke |
| Shift while painting | flip the brush between adding and removing |
| W / E | move / rotate the selected light (Scene view) |
| Alt + left / middle / right drag | tumble / track / dolly (Scene view) |
| F | frame the aim point |
| Click in a shot | aim the light there |

---

## Known limits

- Needs a WebGL 2 browser with float render targets (current Chrome, Edge or Firefox on desktop).
- The Houdini panel, bridge and `attach_gobo()` are written against the contract but not yet run inside
  Houdini; docs/HOUDINI.md lists what to verify.
- A shot rebuilt from utility passes only knows what the camera sees, so shadows from off-screen geometry
  are missing.
- Keep hero lit moves a framed gobo (a light pool, a window) as a whole, so its search range is kept small.
- Very large tree stands (dense conifer forests at 4K) are heavy on older GPUs.
