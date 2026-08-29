import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TUNABLES,
  PRESETS,
  PRESET_KEYS,
  labDefaults,
  tunableValue,
  setTunable,
  tunableActive,
} from '../src/physics/tunables.js';
import { DEFAULT_PARAMS, createWorld, step, attachWeb } from '../src/physics/world.js';
import { HEROIC } from '../src/physics/assist.js';
import { terminalSpeed, swingPeriod } from '../src/physics/metrics.js';
import { vec } from '../src/physics/vec.js';

const sliders = TUNABLES.filter((t) => !t.kind);

test('every tunable points at something that exists', () => {
  const state = labDefaults();

  for (const tunable of TUNABLES) {
    assert.ok(['params', 'assist'].includes(tunable.target), `${tunable.key} has no target`);
    assert.notEqual(tunableValue(state, tunable), undefined, `${tunable.key} is not in ${tunable.target}`);
  }
});

// The whole reason the panel is generated from this list. A slider whose range
// excludes the value the solver actually ships with would snap the simulation
// to something different the moment you touched it.
test('every default sits inside its own slider', () => {
  const state = labDefaults();

  for (const tunable of sliders) {
    const value = tunableValue(state, tunable);
    assert.ok(
      value >= tunable.min && value <= tunable.max,
      `${tunable.key} defaults to ${value}, outside ${tunable.min}..${tunable.max}`,
    );
  }
});

test('a slider is fine enough to be worth dragging', () => {
  for (const tunable of sliders) {
    const notches = (tunable.max - tunable.min) / tunable.step;
    assert.ok(notches >= 20, `${tunable.key} only has ${notches} positions`);
    assert.ok(notches <= 4000, `${tunable.key} has ${notches} positions, too fine to aim`);
  }
});

test('the lab starts out as the real simulation', () => {
  const { params, assist } = labDefaults();

  for (const [key, value] of Object.entries(DEFAULT_PARAMS)) {
    assert.equal(params[key], value, `${key} does not start at the real value`);
  }
  for (const [key, value] of Object.entries(HEROIC)) {
    assert.equal(assist[key], value, `assist ${key} does not start at the heroic value`);
  }
});

test('defaults are copies, so dragging cannot edit them', () => {
  const state = labDefaults();
  state.params.gravity = 1;
  state.assist.thrust = 99;

  assert.equal(DEFAULT_PARAMS.gravity, 9.81);
  assert.equal(HEROIC.thrust, 7);
  assert.equal(labDefaults().params.gravity, 9.81);
});

test('values are clamped to the range on the way in', () => {
  const state = labDefaults();
  const gravity = TUNABLES.find((t) => t.key === 'gravity');

  setTunable(state, gravity, 1e6);
  assert.equal(state.params.gravity, gravity.max);

  setTunable(state, gravity, -50);
  assert.equal(state.params.gravity, gravity.min);
});

test('switches and choices are set rather than clamped', () => {
  const state = labDefaults();
  const web = TUNABLES.find((t) => t.key === 'webMode');
  const assist = TUNABLES.find((t) => t.key === 'enabled');

  setTunable(state, web, 'elastic');
  assert.equal(state.params.webMode, 'elastic');

  setTunable(state, assist, false);
  assert.equal(state.assist.enabled, false);
});

// Stiffness on a rigid web is not a setting, it is a number nothing reads.
test('spring settings only count when the web is a spring', () => {
  const state = labDefaults();
  const stiffness = TUNABLES.find((t) => t.key === 'stiffness');

  state.params.webMode = 'rigid';
  assert.equal(tunableActive(state, stiffness), false);

  state.params.webMode = 'elastic';
  assert.equal(tunableActive(state, stiffness), true);
  assert.equal(tunableActive(state, TUNABLES.find((t) => t.key === 'gravity')), true);
});

// The bug this replaced: Vacuum set only drag, so clicking it after Jupiter
// left you in Jupiter gravity with no air. A row of buttons that all look like
// worlds has to hand you a whole world, or the panel reads as ignoring you.
test('every preset sets every key, so none of them is a partial world', () => {
  for (const preset of PRESETS) {
    const keys = Object.keys(preset.values).sort();
    assert.deepEqual(
      keys,
      [...PRESET_KEYS].sort(),
      `${preset.name} sets ${keys.join(', ')} and leaves the rest wherever they were`,
    );
  }
});

// Stated against the behaviour rather than the data, so it would still catch a
// regression if the preset list grew a new key and PRESET_KEYS did not.
test('clicking one preset after another leaves nothing behind from the first', () => {
  const state = labDefaults();
  const apply = (preset) => {
    for (const [key, value] of Object.entries(preset.values)) {
      setTunable(state, TUNABLES.find((t) => t.key === key), value);
    }
  };

  const jupiter = PRESETS.find((p) => p.name === 'Jupiter');
  const vacuum = PRESETS.find((p) => p.name === 'Vacuum');

  apply(jupiter);
  apply(vacuum);

  // Every key vacuum names has to be vacuum's, not a leftover from jupiter.
  for (const [key, value] of Object.entries(vacuum.values)) {
    assert.equal(state.params[key], value, `${key} did not follow the second click`);
  }
  assert.notEqual(state.params.gravity, jupiter.values.gravity, 'still in jupiter gravity');
});

test('every preset sets keys that exist', () => {
  const keys = new Set(TUNABLES.map((t) => t.key));

  for (const preset of PRESETS) {
    assert.ok(Object.keys(preset.values).length > 0, `${preset.name} changes nothing`);
    for (const key of Object.keys(preset.values)) {
      assert.ok(keys.has(key), `${preset.name} sets unknown ${key}`);
    }
  }
});

test('a preset lands inside the sliders it touches', () => {
  const state = labDefaults();

  for (const preset of PRESETS) {
    for (const [key, value] of Object.entries(preset.values)) {
      const tunable = TUNABLES.find((t) => t.key === key);
      setTunable(state, tunable, value);
      assert.equal(state.params[key], value, `${preset.name} clamped ${key} to ${state.params[key]}`);
    }
  }
});

// ---- the derived numbers the panel teaches with

test('terminal speed is the square root of mg over k', () => {
  const params = { mass: 75, gravity: 9.81, drag: 0.45 };
  assert.ok(Math.abs(terminalSpeed(params) - Math.sqrt((75 * 9.81) / 0.45)) < 1e-9);
  assert.ok(Math.abs(terminalSpeed(params) - 40.4) < 0.5, 'a falling body does about forty metres a second');
});

test('with no air there is no terminal speed at all', () => {
  assert.equal(terminalSpeed({ mass: 75, gravity: 9.81, drag: 0 }), Infinity);
});

test('a swing on the moon takes two and a half times as long', () => {
  const earth = swingPeriod({ gravity: 9.81 }, 20);
  const moon = swingPeriod({ gravity: 1.62 }, 20);

  assert.ok(Math.abs(moon / earth - Math.sqrt(9.81 / 1.62)) < 1e-9);
  assert.ok(moon > earth * 2.4);
});

// The claim the panel makes in a comment, checked against the solver rather
// than against the formula, so it stays true if the solver ever changes.
test('mass really does drop out of a swing', () => {
  const run = (mass) => {
    const world = createWorld({ mass, drag: 0 });
    world.hero.pos = vec(30, 60);
    world.hero.vel = vec(0, 0);
    attachWeb(world, { x: 0, y: 90 });

    for (let i = 0; i < 240; i += 1) step(world, 1 / 240);
    return world.hero.pos;
  };

  const light = run(50);
  const heavy = run(150);

  assert.ok(Math.hypot(light.x - heavy.x, light.y - heavy.y) < 1e-6, 'the swing depended on mass');
});

// Drag is the one place it does not drop out, which is the pair of facts worth
// leaving the lab having understood.
test('but mass does not drop out once there is air', () => {
  const run = (mass) => {
    const world = createWorld({ mass, drag: 0.45 });
    world.hero.pos = vec(0, 400);
    world.hero.vel = vec(0, 0);

    for (let i = 0; i < 1200; i += 1) step(world, 1 / 240);
    return world.hero.vel.y;
  };

  assert.ok(run(150) < run(50) - 5, 'a heavier body should fall faster through air');
});
