import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, step, attachWeb } from '../src/physics/world.js';
import { metrics } from '../src/physics/metrics.js';

const DT = 1 / 240;

test('hanging still, the readouts agree with the textbook', () => {
  const world = createWorld({ drag: 0 });
  world.hero.pos = { x: 0, y: 70 };
  world.hero.prevPos = { x: 0, y: 70 };
  world.hero.vel = { x: 0, y: 0 };
  attachWeb(world, { x: 0, y: 100 });

  for (let i = 0; i < 480; i += 1) step(world, DT);
  const m = metrics(world);

  assert.ok(Math.abs(m.webLength - 30) < 0.05, `web is ${m.webLength}`);
  assert.ok(Math.abs(m.angle) < 0.01, 'hanging straight down is zero angle');
  assert.ok(Math.abs(m.load - 1) < 0.02, 'one body weight at rest');
  // T = 2 pi root L over g
  assert.ok(Math.abs(m.period - 2 * Math.PI * Math.sqrt(30 / 9.81)) < 1e-6);
});

test('the angle reads positive ahead of the anchor and negative behind', () => {
  const make = (x) => {
    const world = createWorld();
    world.hero.pos = { x, y: 70 };
    attachWeb(world, { x: 0, y: 100 });
    return metrics(world).angle;
  };

  assert.ok(make(20) > 0);
  assert.ok(make(-20) < 0);
});

test('drag always takes power out and never puts it in', () => {
  const world = createWorld({ drag: 0.2 });
  world.hero.vel = { x: 30, y: -10 };

  const m = metrics(world);
  assert.ok(m.drag > 0, 'drag has a magnitude');
  assert.ok(m.dragPower < 0, 'and it can only be a loss');
});

test('free flight leaves every pendulum reading at zero', () => {
  const world = createWorld();
  const m = metrics(world);

  for (const key of ['webLength', 'angle', 'omega', 'centripetal', 'period', 'radial']) {
    assert.equal(m[key], 0, `${key} should be nothing without a rope`);
  }
});

test('the energy split adds up', () => {
  const world = createWorld();
  world.hero.vel = { x: 20, y: -6 };
  const m = metrics(world);

  assert.ok(Math.abs(m.kinetic + m.potential - m.total) < 1e-9);
  assert.ok(Math.abs(m.kinetic - 0.5 * 75 * (400 + 36)) < 1e-6);
});

test('swinging, the rope supplies the centripetal force', () => {
  const world = createWorld({ drag: 0 });
  world.hero.pos = { x: 25, y: 70 };
  world.hero.prevPos = { x: 25, y: 70 };
  world.hero.vel = { x: 0, y: 0 };
  attachWeb(world, { x: 0, y: 100 });

  // Let it fall through to the bottom, where the whole rope pull goes into
  // turning him rather than holding him up.
  for (let i = 0; i < 240 * 2; i += 1) step(world, DT);

  const m = metrics(world);
  assert.ok(m.centripetal > 0);
  assert.ok(m.omega > 0, 'it is going round');
  // T = m v_t^2 / L + m g cos(angle), so tension exceeds the centripetal term.
  assert.ok(m.tension > m.centripetal * world.params.mass * 0.9);
});
