// Trains a swinging policy and writes it out.
//
//   node tools/train.js [generations] [out.json]
//
// The whole loop is: ask the search for sixty four policies, fly each one
// through three cities, hand back the average score, let the search move. There
// is nothing else to it, and everything that decides whether it works lives in
// env.js, in the reward.
//
// Two sets of cities, and keeping them apart is the only guard against fooling
// ourselves. TRAIN is what the search optimises against; HOLD_OUT is never
// optimised against and is only ever reported. When the training score climbs
// and the held out score does not, the policy has learned three particular
// skylines rather than how to swing, and the printout says so as it happens
// rather than at the end.

import { writeFileSync } from 'node:fs';

import { createPolicy, PARAM_COUNT, HIDDEN } from '../src/ml/policy.js';
import { runEpisode, OBS_SIZE, ACTION_SIZE, EPISODE_SECONDS } from '../src/ml/env.js';
import { createSearch, cemStep, DEFAULTS } from '../src/ml/cem.js';

const [generationsArg = '300', out = 'agent.json'] = process.argv.slice(2);
const GENERATIONS = Number(generationsArg);

const TRAIN = [1, 7, 21];
const HOLD_OUT = [101, 202, 303];

// Averaged rather than summed, so the number means "score on a typical city"
// and does not change meaning if the number of cities does.
function scoreOn(params, seeds) {
  const policy = createPolicy(params);
  let total = 0;
  for (const seed of seeds) total += runEpisode(policy, { seed }).reward;
  return total / seeds.length;
}

function reportOn(params, seeds) {
  const policy = createPolicy(params);
  const runs = seeds.map((seed) => runEpisode(policy, { seed }));
  const mean = (pick) => runs.reduce((a, r) => a + pick(r), 0) / runs.length;

  return {
    reward: mean((r) => r.reward),
    km: mean((r) => r.distance) / 1000,
    height: mean((r) => r.meanHeight),
    swings: mean((r) => r.swings),
    holding: mean((r) => r.holding),
    arc: mean((r) => r.arcTime),
    spread: mean((r) => r.arcSpread),
    grounded: runs.filter((r) => r.grounded).length,
  };
}

const state = createSearch(PARAM_COUNT, { seed: 12345 });
const started = Date.now();

console.log(
  `training ${PARAM_COUNT} parameters, ${OBS_SIZE} in ${ACTION_SIZE} out\n` +
    `${DEFAULTS.population} policies a generation, top ${DEFAULTS.elite} kept, ` +
    `${EPISODE_SECONDS} s episodes on ${TRAIN.length} cities\n`,
);
console.log('  gen     train    holdout      km   height  swings     arc   spread   held  spr  falls');

let best = { score: -Infinity, candidate: null };

for (let generation = 0; generation < GENERATIONS; generation += 1) {
  const report = cemStep(state, (candidate) => scoreOn(candidate, TRAIN));
  if (report.best.score > best.score) best = report.best;

  if (generation % 10 === 0 || generation === GENERATIONS - 1) {
    // The mean of the search, not the best single sample. The mean is what the
    // search actually believes; a lucky sample says more about the city it drew
    // than about the policy.
    const held = reportOn(state.mean, HOLD_OUT);
    console.log(
      `${String(generation).padStart(5)}` +
        `${report.eliteMean.toFixed(0).padStart(10)}` +
        `${held.reward.toFixed(0).padStart(11)}` +
        `${held.km.toFixed(2).padStart(8)}` +
        `${held.height.toFixed(0).padStart(9)}` +
        `${held.swings.toFixed(1).padStart(8)}` +
        `${held.arc.toFixed(2).padStart(8)}` +
        `${held.spread.toFixed(2).padStart(9)}` +
        `${held.holding.toFixed(2).padStart(7)}` +
        `${report.spread.toFixed(3).padStart(5)}` +
        `${String(held.grounded).padStart(7)}`,
    );
  }
}

// The search mean is what ships, not the best sample ever drawn. The mean is
// the middle of the region the search settled on, so it is the one that is
// least likely to have been a fluke of one city.
const weights = Array.from(state.mean);
const held = reportOn(state.mean, HOLD_OUT);

writeFileSync(out, `${JSON.stringify({
  note: 'A swinging policy for heroic mode. Trained by tools/train.js.',
  obs: OBS_SIZE,
  hidden: HIDDEN,
  actions: ACTION_SIZE,
  generations: GENERATIONS,
  trainedOn: TRAIN,
  heldOut: HOLD_OUT,
  result: held,
  weights,
}, null, 2)}\n`);

console.log(
  `\n${out}  ${weights.length} weights, ${((Date.now() - started) / 1000).toFixed(1)} s\n` +
    `held out: ${held.km.toFixed(2)} km, ${held.swings.toFixed(1)} swings, ` +
    `${held.height.toFixed(0)} m mean height, ${held.grounded}/${HOLD_OUT.length} fell`,
);
