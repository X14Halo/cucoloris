# Cucoloris Lab

Simulated water caustics, tree shadows and window light for light gobos. Open it in a browser: https://x14halo.github.io/cucoloris/

- **Underwater**: refracted caustics on floors, rocks and divers.
- **Overhead**: reflected caustics on docks, bridges and ceilings.
- **Hull & walls**: reflected caustics on vertical surfaces at the waterline.
- **Tree shadows**: dappled sunlight through seamless 3D canopies of oak, maple, birch, aspen and pine (plus palms), traced across the sun disk so canopy gaps throw round sun spots. Separate branch, twig and leaf motion. Output is in light space, so project it along the sun. Wind comes in gusts that roll across the canopy, with each branch swaying on its own. A *single element* framing keeps one branch cluster centred in open white sunlight.
- **Windows**: sunlight through ten window styles (double-hung, casement, French doors, industrial steel, leaded diamonds, arched sunburst, oculus and more) with real wall reveals, glass types (wavy antique, seeded, reeded, frosted, wired), dust, smudges, water spots, rain and condensation, venetian/vertical blinds, plantation shutters, roller and pleated shades, sheer, lace, linen or blackout curtains moving in a breeze, roof eaves, and real tree canopies outside. Every layer is traced across the sun disk at its true depth, so each shadow softens by its own distance.
- **Scene preview**: a set matched to each pattern (a floor lit from above for underwater caustics, a timber dock lit from below for overhead caustics, a wall at the waterline for hulls, a floor and wall for trees and windows), lit by a spotlight or the sun carrying the current gobo, with controls for projection angle, edge softness, gobo blur, distance, intensity, colour, rotation, aim point and placement, plus optional haze.

The water is a Tessendorf FFT spectral simulation running on the GPU. Light is traced through it with an energy-conserving photon mesh, so the output is linear with a mean of 1.0. Patterns tile and loop seamlessly, and motion runs at real speed.

Needs a WebGL 2 browser with float render targets (current Chrome, Edge or Firefox on desktop).
