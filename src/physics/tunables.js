// Every number in the simulation you are allowed to turn, described as data.
//
// Pure on purpose. The panel is built from this list rather than the list being
// written twice, once in HTML and once in the solver, which is how a slider
// ends up quietly clamped to a different range than the physics expects. It
// also means the ranges can be tested: a default outside its own slider is a
// bug you would otherwise only find by dragging.
//
// `target` says which object the value lives on. 'params' is the world's own
// parameters, read by the solver every step. 'assist' is heroic mode's
// settings, which are not physics so much as what he is doing with his arms.

import { DEFAULT_PARAMS } from './world.js';
import { HEROIC } from './assist.js';

export const TUNABLES = [
  // ---- the world he is in
  {
    key: 'gravity', target: 'params', group: 'World', label: 'Gravity', unit: 'm/s²',
    min: 0, max: 30, step: 0.01,
    // Zero is not a mistake. A swing in free fall is worth seeing once.
    note: 'earth is 9.81, the moon 1.62',
  },
  {
    key: 'groundBounce', target: 'params', group: 'World', label: 'Ground bounce', unit: '',
    min: 0, max: 1, step: 0.01, note: 'fraction of speed kept off the street',
  },
  {
    key: 'groundFriction', target: 'params', group: 'World', label: 'Ground grip', unit: '',
    min: 0, max: 1, step: 0.01, note: 'sideways speed kept when he lands',
  },

  // ---- the body doing the swinging
  {
    key: 'mass', target: 'params', group: 'Body', label: 'Mass', unit: 'kg',
    min: 20, max: 250, step: 1,
    note: 'cancels out of a pendulum, but not out of drag',
  },
  {
    key: 'drag', target: 'params', group: 'Body', label: 'Drag', unit: 'N per (m/s)²',
    // The top of the range is set by what is worth feeling, not by what is
    // realistic: at eight he falls at under ten metres a second, which is the
    // point where air stops being a correction and starts being the story.
    min: 0, max: 8, step: 0.01,
    note: 'one half rho Cd A, so terminal speed is the square root of mg over this',
  },

  // ---- the web
  {
    key: 'webMode', target: 'params', group: 'Web', label: 'Web', kind: 'choice',
    options: ['rigid', 'elastic'], note: 'a constraint, or a very stiff spring',
  },
  {
    key: 'maxWebRange', target: 'params', group: 'Web', label: 'Reach', unit: 'm',
    min: 20, max: 240, step: 1, note: 'further straight up than along the street',
  },
  {
    key: 'minWebLength', target: 'params', group: 'Web', label: 'Shortest rope', unit: 'm',
    min: 1, max: 40, step: 0.5, note: 'stops him being winched into the anchor',
  },
  {
    key: 'reelRate', target: 'params', group: 'Web', label: 'Reel rate', unit: 'm/s',
    min: 0, max: 45, step: 0.5, note: 'how fast W and S haul the rope',
  },
  {
    key: 'stiffness', target: 'params', group: 'Web', label: 'Stiffness', unit: 'N/m',
    min: 500, max: 80000, step: 500, needs: 'elastic', note: 'elastic webs only',
  },
  {
    key: 'damping', target: 'params', group: 'Web', label: 'Damping', unit: 'N per m/s',
    min: 0, max: 6000, step: 50, needs: 'elastic', note: 'without this an elastic web never settles',
  },

  // ---- how fast the clock runs
  {
    key: 'timeScale', target: 'params', group: 'Time', label: 'Time scale', unit: '×',
    min: 0.05, max: 3, step: 0.05, note: 'the solver still steps at 240 Hz',
  },

  // ---- what he does with his arms
  {
    key: 'enabled', target: 'assist', group: 'Assist', label: 'Assist', kind: 'switch',
    note: 'the pull along the web that makes heroic mode work',
  },
  {
    key: 'thrust', target: 'assist', group: 'Assist', label: 'Thrust', unit: 'm/s²',
    min: 0, max: 30, step: 0.5, note: 'applied along the direction of travel',
  },
  {
    key: 'cruise', target: 'assist', group: 'Assist', label: 'Cruise', unit: 'm/s',
    min: 10, max: 140, step: 1, note: 'the pull fades to nothing here',
  },
  {
    key: 'reach', target: 'assist', group: 'Assist', label: 'Aim range', unit: 'm',
    min: 30, max: 220, step: 1, note: 'how far he bothers to fire',
  },
  {
    key: 'floor', target: 'assist', group: 'Assist', label: 'Floor', unit: 'm',
    min: 0, max: 160, step: 1, note: 'below this he hauls the rope in to stay up',
  },
  {
    key: 'save', target: 'assist', group: 'Assist', label: 'Haul', unit: '× reel',
    min: 0, max: 10, step: 0.1, note: 'how hard he pulls when he is low and dropping',
  },
  {
    key: 'gather', target: 'assist', group: 'Assist', label: 'Gather', unit: '× reel',
    min: 0, max: 10, step: 0.1, note: 'how fast he takes up slack after firing',
  },
];

// Whole worlds, one click each. The point of these is the comparison: swinging
// on the moon and swinging in treacle teach more in ten seconds than the
// numbers do on their own.
export const PRESETS = [
  { name: 'Earth', values: { gravity: 9.81, drag: 0.45, mass: 75 } },
  { name: 'Moon', values: { gravity: 1.62, drag: 0 } },
  { name: 'Mars', values: { gravity: 3.72, drag: 0.02 } },
  { name: 'Jupiter', values: { gravity: 24.79, drag: 0.55 } },
  { name: 'Vacuum', values: { drag: 0 } },
  { name: 'Treacle', values: { drag: 6 } },
];

// A fresh set of everything the lab can change, at the values the real
// simulation uses. Copies, so dragging a slider can never edit the defaults.
export function labDefaults() {
  return {
    params: { ...DEFAULT_PARAMS },
    assist: { ...HEROIC, enabled: true },
  };
}

// Everything a tunable needs to render itself, resolved against live state.
export function tunableValue(state, tunable) {
  return state[tunable.target]?.[tunable.key];
}

export function setTunable(state, tunable, value) {
  const target = state[tunable.target];
  if (!target) return;

  if (tunable.kind === 'choice' || tunable.kind === 'switch') target[tunable.key] = value;
  else target[tunable.key] = clamp(Number(value), tunable.min, tunable.max);
}

// Whether a control applies right now. Stiffness on a rigid web is not a
// setting, it is a number nothing reads.
export function tunableActive(state, tunable) {
  if (!tunable.needs) return true;
  return state.params.webMode === tunable.needs;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
