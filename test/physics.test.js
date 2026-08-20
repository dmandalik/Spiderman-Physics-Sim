import test from 'node:test';
import assert from 'node:assert/strict';

import { vec, distance, length } from '../src/physics/vec.js';
import {
  createWorld,
  step,
  attachWeb,
  releaseWeb,
  reelWeb,
  energy,
} from '../src/physics/world.js';

const DT = 1 / 240;

// Runs the simulation for a number of seconds at the real fixed timestep.
function run(world, seconds, onStep) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    if (onStep) onStep(world, i * DT);
    step(world, DT);
  }
  return world;
}

function hanging(overrides = {}) {
  const world = createWorld({ drag: 0, ...overrides });
  world.hero.pos = vec(0, 70);
  world.hero.prevPos = vec(0, 70);
  world.hero.vel = vec(0, 0);
  return world;
}

test('free fall matches the closed form solution', () => {
  const world = hanging();
  const startY = world.hero.pos.y;

  run(world, 1);

  // Semi implicit Euler trails the exact answer by about half a step of
  // velocity per second, which at 240 Hz is around two centimetres.
  const exact = startY - 0.5 * world.params.gravity * 1 ** 2;
  assert.ok(Math.abs(world.hero.pos.y - exact) < 0.05, `got ${world.hero.pos.y}, want ${exact}`);
  assert.ok(Math.abs(world.hero.vel.y + world.params.gravity) < 1e-9);
});

test('gravity is a parameter, not a constant', () => {
  const earth = run(hanging({ gravity: 9.81 }), 1);
  const moon = run(hanging({ gravity: 1.62 }), 1);
  assert.ok(moon.hero.pos.y > earth.hero.pos.y);
});

test('a rope never stretches past its rest length', () => {
  const world = hanging();
  world.hero.pos = vec(40, 70);
  attachWeb(world, vec(0, 70));

  run(world, 6, (w) => {
    const reach = distance(w.hero.pos, w.web.anchor);
    assert.ok(reach <= w.web.restLength + 1e-6, `rope stretched to ${reach}`);
  });
});

test('a slack rope does nothing at all', () => {
  const attached = hanging();
  attachWeb(attached, vec(0, 120)); // anchor 50 m above, rest length 50 m
  attached.web.restLength = 80; // deliberately longer than the gap

  const free = hanging();

  run(attached, 1);
  run(free, 1);

  assert.equal(attached.hero.pos.y, free.hero.pos.y);
});

test('hanging still, the web carries exactly one body weight', () => {
  const world = hanging();
  attachWeb(world, vec(0, 100));

  run(world, 2);

  const weight = world.params.mass * world.params.gravity;
  assert.ok(Math.abs(world.tension - weight) / weight < 0.02);
});

test('a swinging rope pulls harder than one body weight at the bottom', () => {
  const world = hanging();
  world.hero.pos = vec(40, 100);
  attachWeb(world, vec(0, 100));

  let peak = 0;
  run(world, 4, (w) => {
    peak = Math.max(peak, w.tension);
  });

  const weight = world.params.mass * world.params.gravity;
  assert.ok(peak > weight * 2, `peak tension was only ${(peak / weight).toFixed(2)} g`);
});

test('a frictionless pendulum keeps its energy', () => {
  const world = hanging({ drag: 0 });
  world.hero.pos = vec(40, 100);
  attachWeb(world, vec(0, 100));

  const before = energy(world).total;
  run(world, 20);
  const after = energy(world).total;

  const drift = Math.abs(after - before) / Math.abs(before);
  assert.ok(drift < 0.02, `energy drifted ${(drift * 100).toFixed(2)} percent`);
});

test('drag bleeds energy away', () => {
  const world = hanging({ drag: 0.3 });
  world.hero.pos = vec(40, 100);
  attachWeb(world, vec(0, 100));

  const before = energy(world).total;
  run(world, 10);

  assert.ok(energy(world).total < before);
});

test('reeling in while under tension adds energy', () => {
  const world = hanging({ drag: 0 });
  world.hero.pos = vec(40, 100);
  attachWeb(world, vec(0, 100));

  const loose = run(structuredClone(world), 4);
  const pulled = run(world, 4, (w) => reelWeb(w, -1, DT));

  assert.ok(energy(pulled).total > energy(loose).total);
});

test('the web cannot be reeled shorter than the minimum or past its range', () => {
  const world = hanging();
  attachWeb(world, vec(0, 100));

  run(world, 5, (w) => reelWeb(w, -1, DT));
  assert.equal(world.web.restLength, world.params.minWebLength);

  run(world, 30, (w) => reelWeb(w, 1, DT));
  assert.equal(world.web.restLength, world.params.maxWebRange);
});

test('a web out of range does not attach', () => {
  const world = hanging();
  // Along the street, the range is the range.
  assert.equal(attachWeb(world, vec(world.params.maxWebRange + 1, 70)), false);
  assert.equal(world.web.attached, false);
});

// Reach is an ellipse, so height is worth more than distance. This is what lets
// him grab the towers whose roofs sit above the top of the window.
test('he can fire further straight up than straight along', () => {
  const range = createWorld().params.maxWebRange;

  const up = hanging();
  assert.equal(attachWeb(up, vec(0, 70 + range * 1.3)), true);

  const tooHigh = hanging();
  assert.equal(attachWeb(tooHigh, vec(0, 70 + range * 1.6)), false);
});

test('letting go leaves the hero in free flight', () => {
  const world = hanging();
  world.hero.pos = vec(40, 100);
  attachWeb(world, vec(0, 100));
  run(world, 1.5);

  const speedBefore = length(world.hero.vel);
  releaseWeb(world);
  step(world, DT);

  assert.equal(world.web.attached, false);
  assert.equal(world.tension, 0);
  // Only gravity acted, so the speed can only have changed by g dt.
  assert.ok(Math.abs(length(world.hero.vel) - speedBefore) < world.params.gravity * DT + 1e-6);
});

test('the hero settles on the ground instead of falling through it', () => {
  const world = hanging({ groundBounce: 0.2 });
  run(world, 12);

  assert.ok(world.hero.pos.y >= world.ground + world.hero.radius - 1e-9);
  assert.ok(Math.abs(world.hero.vel.y) < 1);
});

test('the same start always gives the same run', () => {
  const a = hanging();
  const b = hanging();
  a.hero.pos = vec(40, 100);
  b.hero.pos = vec(40, 100);
  attachWeb(a, vec(0, 100));
  attachWeb(b, vec(0, 100));

  run(a, 5, (w, t) => reelWeb(w, t > 1 ? -1 : 0, DT));
  run(b, 5, (w, t) => reelWeb(w, t > 1 ? -1 : 0, DT));

  assert.deepEqual(a.hero, b.hero);
  assert.deepEqual(a.web, b.web);
});

test('elastic webs stretch where rigid ones do not', () => {
  const world = hanging({ webMode: 'elastic', stiffness: 8000, damping: 200 });
  world.hero.pos = vec(40, 100);
  attachWeb(world, vec(0, 100));

  let maxStretch = 0;
  run(world, 4, (w) => {
    maxStretch = Math.max(maxStretch, distance(w.hero.pos, w.web.anchor) - w.web.restLength);
  });

  assert.ok(maxStretch > 0.1, `elastic web only stretched ${maxStretch} m`);
});
