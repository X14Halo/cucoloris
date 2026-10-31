# Cucoloris Lab

Simulated water caustics, tree shadows and window light for light gobos. Open it in a browser: https://x14halo.github.io/cucoloris/

- **Underwater**: refracted caustics on floors, rocks and divers.
- **Underside**: reflected caustics on the undersides of docks, bridges, boats and ceilings.
- **Hull & walls**: reflected caustics on vertical surfaces at the waterline.
- **Tree shadows**: dappled sunlight through seamless 3D canopies of oak, maple, birch, aspen and pine (plus palms), traced across the sun disk so canopy gaps throw round sun spots. Separate branch, twig and leaf motion. Output is in light space, so project it along the sun. Wind comes in gusts that roll across the canopy, with each branch swaying on its own. A *single element* framing keeps one branch cluster centred in open white sunlight.
- **Windows**: sunlight through ten window styles (double-hung, casement, French doors, industrial steel, leaded diamonds, arched sunburst, oculus and more) with real wall reveals, glass types (wavy antique, seeded, reeded, frosted, wired), dust, smudges, water spots, rain (with controls for beaded drops, running drops, drop size, drop contrast and running speed) and condensation, venetian/vertical blinds, plantation shutters, roller and pleated shades, sheer, lace, linen or blackout curtains moving in a breeze, roof eaves, and real tree canopies outside. Every layer is traced across the sun disk at its true depth, so each shadow softens by its own distance.
- **Shapes**: very soft organic noise for adding interest to a key light without distracting from it: soft blobs, soft clouds, soft mottling, billows, wandering pools of light, marbled flow, an uneven wash and soft spots, each with controls for size, coverage, softness, darkest shadow, detail, roughness, flow distortion, clumping and stretch, plus motion: morphing through endless offset versions of itself (shapes stretch, merge and split rather than fade), evolving, flowing currents and drift, with an overall speed up to 20×. Light shafts and beams shimmer slowly, with dust drifting through them. A light-pool framing, defocus blur, and a paint-your-own canvas (in the panel, on the Gobo preview, or right where the light lands in the Scene view) with soft round, single light beam, soft streak, soft cloud, mottle and soft-dot brushes.
- **Scene preview**: a set matched to each pattern (a floor lit from above for underwater caustics, a timber dock lit from below for overhead caustics, a wall at the waterline for hulls, a floor and wall for trees and windows), lit by a spotlight or the sun carrying the current gobo, with controls for projection angle, edge softness, gobo blur, distance, intensity, colour, rotation, aim point and placement, plus optional haze.
- **Paint over**: paint changes onto any pattern in chosen areas, on a canvas in the panel, on the Gobo preview, or in the Scene view right where the light lands. On trees it paints leaf density: leaves are removed (and, where it is cleared right out, the finer twigs) or grown, tied to where each leaf hangs, so the change sways with the tree and still looks like a tree. On shapes the painting travels with the drifting, flowing pattern; on caustics and windows it opens up or thickens the light in place.
- **Shot menu** (top of the page): pick a shot to light in the Scene view. In the real tool this would list your sequences and shots and build each one, with its camera, from the shot's utility passes. This mockup ships two clearly labelled placeholder shots made up for it: a mid shot of a person in a courtyard under one big tree (tree dapple) and a living room lit by a faked window gobo from a window behind the camera. Their utility passes (world position, normals, surface colour, water matte) are rendered from the shot camera, and the scene is rebuilt from those passes and the shot camera (a shot without a camera has one solved from its position pass): the pixels become a rough 3D model, and the light casts shadows from the shot's own geometry. Look through the shot camera or move around with Maya controls (Alt + left tumble, Alt + middle track, Alt + right dolly, F to frame), view each pass, and click to aim the light.
- **Light manipulator**: in the Scene view, click the light to select it, then move it with translate handles (W) or turn it with rotate rings (E), as in Maya. Reset camera puts the view back.

- **Export**: the final gobo as the current frame, a frame range or the whole timeline, at 512–4096 px, as OpenEXR (half/float), Ptex (8/16-bit, half, float; mipmapped), TIFF, PNG or JPEG, with sRGB or linear encoding for integer files. Optionally with a **light rig**: a USD layer holding the light in the shot's own units and up axis with the gobo attached, plus a settings file that recreates the gobo.

The water is a Tessendorf FFT spectral simulation running on the GPU. Light is traced through it with an energy-conserving photon mesh, so the output is linear with a mean of 1.0. Patterns tile and loop seamlessly, and motion runs at real speed.

Needs a WebGL 2 browser with float render targets (current Chrome, Edge or Firefox on desktop).

## For TDs: bringing it into Houdini

The production version is meant to be this same page, hosted in a Houdini Python Panel, with one small object (`window.CUCOLORIS_HOST`) connecting it to the pipeline: the shot list, each shot's utility passes and camera, where files go, and building the light. Everything else, including the viewer and timeline, stays identical to the web version.

- [docs/HOUDINI.md](docs/HOUDINI.md): how it fits together, the host contract, file formats, the light rig and USD layer, the exact projection maths, and a checklist of what is left to build.
- [houdini/](houdini/): a starting point for the panel, the Python bridge and the host shim (not yet run inside Houdini).

## Building and testing

```
python3 build.py                 # src/ → dist/cucoloris-lab.html and index.html
python3 tests/golden.py          # every pattern and a shot, against reference frames and light rigs
python3 tests/rig_projection.py  # the exported USD light lands the gobo where the preview does
python3 tests/host_shim_mock.py  # the Houdini shim against a mock bridge
```
The tests need `pip install playwright usd-core OpenEXR numpy`; add `--software` on machines without a GPU.
