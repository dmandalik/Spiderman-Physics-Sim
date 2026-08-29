// The cross entropy method. The whole trainer, and it is one idea.
//
//   Keep a guess at where the good policies are: a mean and a spread, one pair
//   per parameter. Draw a population from it. Score every one. Throw away all
//   but the best handful. Move the guess onto those. Repeat.
//
// That is it. There is no gradient, no backpropagation, no learning rate, and
// nothing in here knows what a neural network is. It optimises a vector of
// numbers against a function that scores vectors of numbers, and it does not
// care that ours happen to be the weights of a policy.
//
// Why this and not policy gradients. CEM only needs to be able to run the thing
// and see what score comes back, and it pays for that with a lot of runs: sixty
// four evaluations to make one step of progress, where a gradient method makes
// a step from one. That trade is only worth taking when evaluations are cheap,
// and ours are three milliseconds. A generation costs six tenths of a second,
// which buys a method with no derivatives to get wrong and nothing to tune but
// three plain numbers.
//
// The catch, stated honestly: the population size it needs grows with the
// number of parameters, so this stops being the right tool somewhere around a
// few thousand of them. If the policy ever needs to be big, this has to go.

import { mulberry32 } from '../world/random.js';

export const DEFAULTS = {
  population: 64,
  elite: 8, // how many of the population the next guess is built from
  sigma: 0.5, // the initial spread, in parameter units
  // The floor under the spread. Without it the population collapses onto the
  // first thing that works and stops exploring, which reads as the score going
  // flat within twenty generations and never moving again.
  minSigma: 0.02,
  // How much of the old spread to keep. Shrinking the spread all the way to
  // whatever the elites happen to show is the same collapse in slow motion.
  smoothing: 0.7,
};

// Two independent standard normals from two uniforms. The Box Muller transform,
// used because the seeded generator this project already has gives uniforms and
// a search needs bell shaped noise: uniform noise puts as much probability at
// the edge of the box as at the middle, and a policy is far more likely to be a
// small change from the last good one than a large one.
function normalPair(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function sample(mean, sigma, rng, into) {
  for (let i = 0; i < mean.length; i += 2) {
    const [a, b] = normalPair(rng);
    into[i] = mean[i] + sigma[i] * a;
    if (i + 1 < mean.length) into[i + 1] = mean[i + 1] + sigma[i + 1] * b;
  }
  return into;
}

// One generation. Split out from the loop so a caller can drive the search a
// step at a time, which is what the trainer needs in order to print progress
// and what a test needs in order to check a single step in isolation.
export function cemStep(state, evaluate) {
  const { mean, sigma, options, rng } = state;
  const scored = [];

  for (let i = 0; i < options.population; i += 1) {
    const candidate = sample(mean, sigma, rng, new Float64Array(mean.length));
    scored.push({ candidate, score: evaluate(candidate) });
  }

  // Best first, then keep the top few. Everything below the cut is discarded
  // outright rather than weighted: it is the ruthlessness that makes this work.
  scored.sort((a, b) => b.score - a.score);
  const elite = scored.slice(0, options.elite);

  for (let p = 0; p < mean.length; p += 1) {
    let sum = 0;
    for (const e of elite) sum += e.candidate[p];
    const nextMean = sum / elite.length;

    // The spread becomes how much the elites actually disagreed about this
    // parameter. A parameter they all agreed on stops being searched; one they
    // are still split over keeps being tried. That is the useful part of CEM:
    // it works out on its own which parameters still matter.
    let variance = 0;
    for (const e of elite) variance += (e.candidate[p] - nextMean) ** 2;
    const nextSigma = Math.sqrt(variance / elite.length);

    mean[p] = nextMean;
    sigma[p] = Math.max(
      options.smoothing * sigma[p] + (1 - options.smoothing) * nextSigma,
      options.minSigma,
    );
  }

  return {
    best: scored[0],
    eliteMean: elite.reduce((a, e) => a + e.score, 0) / elite.length,
    populationMean: scored.reduce((a, e) => a + e.score, 0) / scored.length,
    spread: sigma.reduce((a, s) => a + s, 0) / sigma.length,
  };
}

export function createSearch(size, { seed = 1, ...overrides } = {}) {
  const options = { ...DEFAULTS, ...overrides };

  return {
    mean: new Float64Array(size),
    sigma: new Float64Array(size).fill(options.sigma),
    options,
    rng: mulberry32(seed),
  };
}

// The loop, for when nobody needs to watch it go.
export function search(size, evaluate, { generations = 100, onGeneration, ...options } = {}) {
  const state = createSearch(size, options);
  let best = { score: -Infinity, candidate: null };

  for (let generation = 0; generation < generations; generation += 1) {
    const report = cemStep(state, evaluate);
    if (report.best.score > best.score) best = report.best;
    if (onGeneration) onGeneration(generation, report, state);
  }

  return { best, mean: state.mean, sigma: state.sigma };
}
