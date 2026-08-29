// Puts a trained agent next to the obvious things it should beat.
//
//   node tools/evaluate.js [agent.json]
//
// A number from training only says the search went up. It does not say the
// agent is any good, because the reward is a guess and a guess can be climbed
// without the thing it stands for improving at all. So this reports what
// actually happened, on cities the agent was never trained on, against three
// policies written by hand.
//
// The hand written ones are not strawmen. "Hold on" is what the reward has to
// beat to prove forward progress means anything; "swing" is a real technique,
// fire ahead and let go at the bottom of the arc, and it is roughly what a
// person does on their first go.

import { readFileSync } from 'node:fs';

import { createPolicy, PARAM_COUNT } from '../src/ml/policy.js';
import { runEpisode } from '../src/ml/env.js';

const [file = 'agent.json'] = process.argv.slice(2);
const CITIES = [101, 202, 303, 404, 505];

// The four numbers are aim, range, gate, reel, each in minus one to one.
const BASELINES = {
  'do nothing': () => [0, 0, -1, 0],
  'hold on': () => [0, 0, 1, 0],
  // Fire a long web well above the heading, then let go once he is past the
  // bottom of the arc and rising again. The rope angle is the seventh number in
  // the observation and it changes sign at the bottom, which is the whole cue.
  swing: (obs) => {
    const attached = obs[4] > 0.5;
    const ropeAngle = obs[6];
    const rising = obs[1] > 0;
    return [0.35, 0.6, attached ? (ropeAngle > 0.25 && rising ? -1 : 1) : 1, 0];
  },
};

function evaluate(policy) {
  const runs = CITIES.map((seed) => runEpisode(policy, { seed }));
  const mean = (pick) => runs.reduce((a, r) => a + pick(r), 0) / runs.length;

  return {
    km: mean((r) => r.distance) / 1000,
    pace: mean((r) => r.distance / Math.max(r.seconds, 1e-9)),
    height: mean((r) => r.meanHeight),
    swings: mean((r) => r.swings),
    arc: mean((r) => r.arcTime),
    spread: mean((r) => r.arcSpread),
    holding: mean((r) => r.holding),
    fell: runs.filter((r) => r.grounded).length,
    reward: mean((r) => r.reward),
  };
}

const rows = Object.entries(BASELINES).map(([name, policy]) => [name, evaluate(policy)]);

try {
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  if (saved.weights.length !== PARAM_COUNT) {
    throw new Error(`${file} has ${saved.weights.length} weights, this build wants ${PARAM_COUNT}`);
  }
  rows.push(['trained', evaluate(createPolicy(Float64Array.from(saved.weights)))]);
} catch (error) {
  console.log(`(no agent to compare: ${error.message})\n`);
}

console.log(`on ${CITIES.length} cities none of them was trained on\n`);
console.log('policy          km   m/s  height  swings    arc  spread  roped  fell   reward');

for (const [name, r] of rows) {
  console.log(
    `${name.padEnd(12)}` +
      `${r.km.toFixed(2).padStart(6)}` +
      `${r.pace.toFixed(1).padStart(6)}` +
      `${r.height.toFixed(0).padStart(8)}` +
      `${r.swings.toFixed(1).padStart(8)}` +
      `${r.arc.toFixed(2).padStart(7)}` +
      `${r.spread.toFixed(2).padStart(8)}` +
      `${r.holding.toFixed(2).padStart(7)}` +
      `${String(r.fell).padStart(6)}` +
      `${r.reward.toFixed(0).padStart(9)}`,
  );
}
