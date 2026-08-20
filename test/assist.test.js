import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, step, attachWeb, reelWeb, energy } from '../src/physics/world.js';
import { assistForce, assistReel, HEROIC } from '../src/physics/assist.js';
import { length } from '../src/physics/vec.js';

const DT = 1 / 240;

function swinging({ height = 100, vy = -10 } = {}) {
  const world = createWorld({ drag: 0 });
  world.hero.pos = { x: 30, y: height };
  world.hero.prevPos = { x: 30, y: height };
  world.hero.vel = { x: 20, y: vy };
  attachWeb(world, { x: 0, y: height + 30 });
  return world;
}

test('with nothing to hold on to there is no assist at all', () => {
  const world = createWorld();
  assert.equal(assistReel(world), 0);
  assert.deepEqual(assistForce(world), { x: 0, y: 0 });
});

// The point of pulling along the velocity rather than upward: both components
// grow by the same fraction, so the swing accelerates with no kick anywhere in
// the arc.
test('the pull runs exactly along the direction of travel', () => {
  for (const vy of [-18, -6, 0, 7, 15]) {
    const world = swinging({ vy });
    const force = assistForce(world);
    const vel = world.hero.vel;

    // Parallel means the cross product vanishes. Anything else would push one
    // component harder than the other and show up as a kick.
    const cross = force.x * vel.y - force.y * vel.x;
    assert.ok(Math.abs(cross) < 1e-9, `not parallel at vy ${vy}, cross ${cross}`);
    assert.ok(force.x * vel.x + force.y * vel.y > 0, 'should push forward, not brake');
  }
});

test('both speed components grow by the same fraction', () => {
  const world = swinging({ vy: -12 });
  const before = { ...world.hero.vel };

  // Gravity and the rope both change the velocity too, so measure the assist on
  // its own by applying only its acceleration.
  const force = assistForce(world);
  const after = {
    x: before.x + (force.x / world.params.mass) * 0.5,
    y: before.y + (force.y / world.params.mass) * 0.5,
  };

  const grewX = after.x / before.x;
  const grewY = after.y / before.y;

  assert.ok(grewX > 1, 'horizontal speed should climb too, not just vertical');
  assert.ok(Math.abs(grewX - grewY) < 1e-9, `${grewX} against ${grewY}`);
});

test('the pull eases off toward cruise instead of stopping dead', () => {
  const slow = length(assistForce(swinging({ vy: 0 })));

  const fast = swinging();
  fast.hero.vel = { x: HEROIC.cruise * 0.95, y: 0 };
  const nearly = length(assistForce(fast));

  const atCruise = swinging();
  atCruise.hero.vel = { x: HEROIC.cruise, y: 0 };

  assert.ok(nearly > 0 && nearly < slow, 'should taper, not switch off');
  assert.ok(length(assistForce(atCruise)) < 1e-9, 'nothing left at cruise');
});

test('a fully reeled web still boosts, where the old pump gave up', () => {
  const helped = swinging();
  const idle = swinging();
  helped.web.restLength = helped.params.minWebLength;
  idle.web.restLength = idle.params.minWebLength;

  for (let i = 0; i < 240; i += 1) {
    helped.applied = assistForce(helped);
    step(helped, DT);
    step(idle, DT);
  }

  assert.ok(length(helped.hero.vel) > length(idle.hero.vel), 'no length left, still boosting');
});

test('below the floor he hauls the web in', () => {
  assert.equal(assistReel(swinging({ height: HEROIC.floor - 10, vy: -10 })), -HEROIC.save);
  assert.equal(assistReel(swinging({ height: HEROIC.floor + 40, vy: -10 })), 0);
});

test('below the floor but climbing, he stops paying out', () => {
  // Paying out here would spend the height he just fought for.
  assert.equal(assistReel(swinging({ height: HEROIC.floor - 10, vy: 5 })), 0);
});

test('the assist adds energy where coasting loses it', () => {
  const helped = swinging();
  const idle = swinging();

  const before = energy(idle).total;

  for (let i = 0; i < 240 * 2; i += 1) {
    helped.applied = assistForce(helped);
    step(helped, DT);
    step(idle, DT);
  }

  assert.ok(energy(helped).total > energy(idle).total, 'the assist should beat coasting');
  assert.ok(energy(idle).total <= before + 1e-6, 'coasting cannot gain energy');
});

test('the floor save never runs the web outside its limits', () => {
  const world = swinging({ height: HEROIC.floor - 20 });

  for (let i = 0; i < 240 * 20; i += 1) {
    reelWeb(world, assistReel(world), DT);
    world.applied = assistForce(world);
    step(world, DT);

    assert.ok(world.web.restLength >= world.params.minWebLength - 1e-9);
    assert.ok(world.web.restLength <= world.params.maxWebRange + 1e-9);
  }
});
