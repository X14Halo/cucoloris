# Cucoloris Lab

Simulated water caustics and tree shadows for light gobos. Open it in a browser: https://x14halo.github.io/cucoloris/

- **Underwater**: refracted caustics on floors, rocks and divers.
- **Overhead**: reflected caustics on docks, bridges and ceilings.
- **Hull & walls**: reflected caustics on vertical surfaces at the waterline.
- **Tree shadows**: dappled sunlight through real 3D oaks, maples, birches, aspens, pines and palms, with wind sway at measured frequencies. Output is in light space, so project it along the sun.

The water is a Tessendorf FFT spectral simulation running on the GPU. Light is traced through it with an energy-conserving photon mesh, so the output is linear with a mean of 1.0. Patterns tile and loop seamlessly, and motion runs at real speed.

Needs a WebGL 2 browser with float render targets (current Chrome, Edge or Firefox on desktop).
