// Dev sanity check (Node): validate preset tracks and run a few headless
// generations to confirm evolution makes progress. Run: node tools/smoke.js

import { buildTrack } from '../src/sim/track.js';
import { PRESETS } from '../src/tracks/presets.js';
import { Simulation, SIM } from '../src/sim/simulation.js';
import { makeRng } from '../src/sim/rng.js';

let failed = false;

for (const preset of PRESETS) {
  const track = buildTrack(preset);
  const v = track.validate();
  const lap = Math.round(track.lapLength);
  if (!v.ok) {
    failed = true;
    const p = track.samples[v.index];
    console.log(
      `FAIL ${preset.id}: ${v.reason} at sample ${v.index} (${Math.round(p.x)},${Math.round(p.y)})`,
    );
  } else {
    console.log(`ok   ${preset.id}: ${track.n} samples, lap ${lap}px`);
  }
}

// Evolution smoke test on the easy track: best progress should clearly
// improve over 12 generations.
const track = buildTrack(PRESETS[0]);
const sim = new Simulation({ track, popSize: 60, sigma: 0.2, rng: makeRng(42) });
const maxSteps = Math.ceil(SIM.genTime / SIM.dt);
let firstBest = null;
while (sim.generation <= 12) {
  let steps = 0;
  while (!sim.step() && steps++ < maxSteps + 2) {
    /* run generation to completion */
  }
  const h = sim.history[sim.history.length - 1];
  if (firstBest === null) firstBest = h.best;
  console.log(
    `gen ${String(h.gen).padStart(2)}: best ${Math.round(h.best)}px, mean ${Math.round(h.mean)}px`,
  );
}
const last = sim.history[sim.history.length - 1];
const firstMean = sim.history[0].mean;
if (last.best < track.lapLength * 0.8 || last.mean < firstMean * 3) {
  failed = true;
  console.log(
    `FAIL evolution: best ${Math.round(last.best)} (lap ${Math.round(track.lapLength)}), mean ${Math.round(firstMean)} -> ${Math.round(last.mean)}`,
  );
} else {
  console.log(
    `ok   evolution improves (mean ${Math.round(firstMean)} -> ${Math.round(last.mean)}px, best ${Math.round(last.best)}px)`,
  );
}

process.exit(failed ? 1 : 0);
