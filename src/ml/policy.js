// The agent itself: thirteen numbers in, four numbers out.
//
// One hidden layer of sixteen units, and that is the entire brain. It is worth
// being clear about why it is so small. The trainer does not use gradients, it
// searches the space of parameter vectors directly, and the cost of that search
// grows with how many parameters there are. Two hundred and ninety two is a
// size a search can cover in minutes. Twenty thousand is not.
//
// Small is also enough. The decision "given how fast I am going, how I am
// hanging, and where the rooftops are, which way should I point" is not a deep
// function. It is close to a handful of rules, and one hidden layer of sixteen
// tanh units can express a good many more rules than that.
//
// Forward pass only. There is no backward pass anywhere in this project.

import { OBS_SIZE, ACTION_SIZE } from './env.js';

export const HIDDEN = 16;

// Weights and biases, laid out end to end in one flat array.
//
// Flat because the trainer wants to treat a policy as a single point in space:
// perturb it, average several of them, measure how far apart two of them are.
// All of that is one line on a flat array and a nest of loops on a structure.
export const PARAM_COUNT = OBS_SIZE * HIDDEN + HIDDEN + HIDDEN * ACTION_SIZE + ACTION_SIZE;

// tanh, and it is doing two jobs. In the hidden layer it is the non linearity,
// which is what lets the network be anything more than a weighted sum. In the
// output layer it is a clamp: every action is defined on minus one to one, so
// squashing here means the environment never has to check.
const squash = Math.tanh;

// Builds the function the environment calls. Reads the parameters once and
// closes over them, so calling it in the inner loop allocates nothing but the
// two small arrays it needs.
export function createPolicy(params) {
  if (params.length !== PARAM_COUNT) {
    throw new Error(`policy wants ${PARAM_COUNT} parameters, got ${params.length}`);
  }

  const hidden = new Float64Array(HIDDEN);
  const out = new Float64Array(ACTION_SIZE);

  // Where each block starts in the flat array.
  const w1 = 0;
  const b1 = w1 + OBS_SIZE * HIDDEN;
  const w2 = b1 + HIDDEN;
  const b2 = w2 + HIDDEN * ACTION_SIZE;

  return function policy(obs) {
    for (let h = 0; h < HIDDEN; h += 1) {
      let sum = params[b1 + h];
      for (let i = 0; i < OBS_SIZE; i += 1) sum += params[w1 + h * OBS_SIZE + i] * obs[i];
      hidden[h] = squash(sum);
    }

    for (let o = 0; o < ACTION_SIZE; o += 1) {
      let sum = params[b2 + o];
      for (let h = 0; h < HIDDEN; h += 1) sum += params[w2 + o * HIDDEN + h] * hidden[h];
      out[o] = squash(sum);
    }

    return out;
  };
}

// A policy that does nothing in particular, to start the search from.
//
// All zeros rather than small random numbers. With zero weights every output is
// tanh(0), which is zero, which decodes to a middling aim and a gate that is
// neither firing nor releasing. That is a genuinely neutral starting point, and
// the search adds the randomness itself: the first generation is sixty four
// samples drawn around this, so there is no need to bake any in.
export function blankParams() {
  return new Float64Array(PARAM_COUNT);
}
