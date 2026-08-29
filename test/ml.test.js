import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEnv,
  observe,
  stepEnv,
  runEpisode,
  OBS_SIZE,
  ACTION_SIZE,
  REWARD,
  EPISODE_SECONDS,
} from '../src/ml/env.js';
import { createPolicy, blankParams, PARAM_COUNT, HIDDEN } from '../src/ml/policy.js';
import { search, createSearch, cemStep } from '../src/ml/cem.js';

const idle = () => [0, 0, -1, 0]; // never fires
const hold = () => [0, 0, 1, 0]; // fires and never lets go

// ---- the environment

// Everything downstream assumes it. A single stray value would be read as a
// perfectly ordinary observation by a network that cannot tell the difference,
// and the failure would show up as a policy that mysteriously will not train.
test('an observation is the size it says it is, and every number is finite', () => {
  const env = createEnv({ seed: 1 });
  let obs = observe(env);

  for (let i = 0; i < 200; i += 1) {
    assert.equal(obs.length, OBS_SIZE);
    for (const [index, value] of obs.entries()) {
      assert.ok(Number.isFinite(value), `observation ${index} is ${value} at step ${i}`);
    }
    obs = stepEnv(env, [Math.sin(i), Math.cos(i), Math.sin(i * 0.3), 0]).obs;
  }
});

// The observation is normalised so the same policy can be trained on one set of
// worlds and run in another. That only works if the numbers really do stay in
// roughly the range the scaling claims.
test('observations stay in the range the policy expects', () => {
  const env = createEnv({ seed: 7 });
  let obs = observe(env);
  let worst = 0;

  for (let i = 0; i < 400; i += 1) {
    obs = stepEnv(env, [Math.sin(i * 0.11), 0.4, Math.sin(i * 0.03), 0]).obs;
    for (const value of obs) worst = Math.max(worst, Math.abs(value));
  }

  assert.ok(worst < 4, `an observation reached ${worst.toFixed(2)}, far outside its scaling`);
});

// The one property everything else rests on. A search cannot tell a better
// policy from a luckier one if the same policy scores differently twice.
test('the same policy on the same city gives exactly the same episode', () => {
  const policy = createPolicy(blankParams());
  const a = runEpisode(policy, { seed: 3 });
  const b = runEpisode(policy, { seed: 3 });

  assert.deepEqual(a, b);
});

// With `hold` rather than a blank policy, because a blank policy never fires:
// all its weights are zero, so every output is tanh(0), and a gate of exactly
// zero is neither firing nor releasing. It therefore falls the same way in
// every city, which is correct and useless for telling two cities apart.
test('a different city is a different episode', () => {
  assert.notDeepEqual(runEpisode(hold, { seed: 3 }), runEpisode(hold, { seed: 4 }));
});

test('an episode always ends, either on the ground or on the clock', () => {
  for (const behaviour of [idle, hold]) {
    const run = runEpisode(behaviour, { seed: 11 });
    assert.ok(run.grounded || run.seconds >= EPISODE_SECONDS, 'it ran past the end');
    assert.ok(run.seconds <= EPISODE_SECONDS + 1e-9);
  }
});

// Two behaviours whose outcome is known without training, so a change to the
// physics or the wiring that breaks the environment shows up here rather than
// as a training run that quietly stops working.
test('never webbing falls, holding one web forever does not', () => {
  const fallen = runEpisode(idle, { seed: 1 });
  const held = runEpisode(hold, { seed: 1 });

  assert.ok(fallen.grounded, 'he should hit the street with no web');
  assert.ok(fallen.seconds < 10, `took ${fallen.seconds.toFixed(1)} s to fall`);
  assert.ok(!held.grounded, 'a held web should keep him up');
  assert.ok(held.holding > 0.9, 'he let go of a web he was told to hold');
});

// The reason the reward can be built on forward progress without needing a
// separate rule against it: holding on is an orbit, and an orbit goes nowhere.
test('holding one web forever gets nowhere, so it needs no rule against it', () => {
  const held = runEpisode(hold, { seed: 1 });
  assert.ok(
    held.distance < 400,
    `orbiting covered ${held.distance.toFixed(0)} m, which is far enough to be worth doing`,
  );
});

// The mistake that cost two training runs. A flat payment for each completed
// arc rewards having many of them, and the policy duly found forty short ones
// beat twenty long ones. Paying by the second is what inverts it, and this
// states that directly rather than trusting the comment.
test('two short arcs are worth less than one long one', () => {
  const perSecond = REWARD.arcRate;
  const long = Math.min(2.4, REWARD.arcCap) * perSecond - REWARD.web;
  const short = 2 * (Math.min(1.2, REWARD.arcCap) * perSecond - REWARD.web);

  assert.ok(long > short, `one 2.4 s arc pays ${long}, two 1.2 s arcs pay ${short}`);
});

// ---- the policy

test('a policy is a pure function of its observation', () => {
  const policy = createPolicy(Float64Array.from({ length: PARAM_COUNT }, (unused, i) => Math.sin(i)));
  const obs = new Array(OBS_SIZE).fill(0.3);

  // Copied, because the policy hands back a buffer it reuses.
  const first = [...policy(obs)];
  policy(new Array(OBS_SIZE).fill(-0.9));
  assert.deepEqual([...policy(obs)], first);
});

test('every action comes out inside the range the environment decodes', () => {
  const policy = createPolicy(Float64Array.from({ length: PARAM_COUNT }, (unused, i) => Math.cos(i) * 9));

  for (let i = 0; i < 50; i += 1) {
    const obs = Array.from({ length: OBS_SIZE }, (unused, j) => Math.sin(i * j) * 3);
    const action = policy(obs);
    assert.equal(action.length, ACTION_SIZE);
    for (const value of action) assert.ok(value >= -1 && value <= 1, `action was ${value}`);
  }
});

test('the parameter count matches the shape it claims', () => {
  assert.equal(PARAM_COUNT, OBS_SIZE * HIDDEN + HIDDEN + HIDDEN * ACTION_SIZE + ACTION_SIZE);
  assert.throws(() => createPolicy(new Float64Array(PARAM_COUNT - 1)));
});

// ---- the search

// Against a problem whose answer is known, so a failure here is the optimiser
// and not the environment or the reward.
test('the search finds a target it is told nothing about', () => {
  const target = Float64Array.from({ length: 40 }, (unused, i) => Math.sin(i) * 2);
  const evaluate = (v) => {
    let sum = 0;
    for (let i = 0; i < v.length; i += 1) sum -= (v[i] - target[i]) ** 2;
    return sum;
  };

  const { best } = search(40, evaluate, { generations: 120, seed: 3 });
  let error = 0;
  for (let i = 0; i < 40; i += 1) error += (best.candidate[i] - target[i]) ** 2;

  assert.ok(Math.sqrt(error / 40) < 0.1, `still ${Math.sqrt(error / 40).toFixed(3)} away`);
});

test('a generation never makes the elite worse', () => {
  const evaluate = (v) => -v.reduce((a, x) => a + x * x, 0);
  const state = createSearch(20, { seed: 5 });

  let previous = -Infinity;
  for (let i = 0; i < 25; i += 1) {
    const report = cemStep(state, evaluate);
    // Not monotonic step to step, since the population is redrawn each time,
    // but it must not be drifting away from the answer.
    if (i > 5) assert.ok(report.eliteMean > previous - 1, 'the search is going backwards');
    previous = report.eliteMean;
  }
  assert.ok(previous > -0.5, `settled at ${previous.toFixed(3)}, nowhere near zero`);
});

// Without a floor the population collapses onto the first thing that works and
// stops looking, which shows up as a score that goes flat early and never moves.
test('the spread never collapses to nothing', () => {
  const state = createSearch(20, { seed: 5 });
  for (let i = 0; i < 60; i += 1) cemStep(state, (v) => -v.reduce((a, x) => a + x * x, 0));

  for (const s of state.sigma) assert.ok(s >= state.options.minSigma - 1e-12, `spread fell to ${s}`);
});

test('the same seed searches the same way', () => {
  const evaluate = (v) => -v.reduce((a, x) => a + (x - 0.5) ** 2, 0);
  const a = search(12, evaluate, { generations: 20, seed: 8 });
  const b = search(12, evaluate, { generations: 20, seed: 8 });

  assert.deepEqual(Array.from(a.mean), Array.from(b.mean));
});
