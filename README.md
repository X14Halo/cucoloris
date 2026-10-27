# Cucoloris Lab

Simulated water caustics and tree shadows for light gobos. Open it in a browser: https://x14halo.github.io/cucoloris/

- **Underwater**: refracted caustics on floors, rocks and divers.
- **Overhead**: reflected caustics on docks, bridges and ceilings.
- **Hull & walls**: reflected caustics on vertical surfaces at the waterline.
- **Tree shadows**: dappled sunlight through seamless 3D canopies of oak, maple, birch, aspen and pine (plus palms), traced across the sun disk so canopy gaps throw round sun spots. Separate branch, twig and leaf motion. Output is in light space, so project it along the sun. Wind comes in gusts that roll across the canopy, with each branch swaying on its own. A *single element* framing keeps one branch cluster centred in open white sunlight.
- **Scene preview**: a grey floor, wall and test sphere lit by a spotlight or the sun carrying the current gobo, with controls for projection angle, edge softness, gobo blur, distance, intensity, colour, rotation, aim point and placement, plus optional haze.

The water is a Tessendorf FFT spectral simulation running on the GPU. Light is traced through it with an energy-conserving photon mesh, so the output is linear with a mean of 1.0. Patterns tile and loop seamlessly, and motion runs at real speed.

Needs a WebGL 2 browser with float render targets (current Chrome, Edge or Firefox on desktop).
