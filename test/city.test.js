import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, hashInts } from '../src/world/random.js';
import { vec } from '../src/physics/vec.js';
import { createWorld, step } from '../src/physics/world.js';
import {
  createCity,
  buildingsBetween,
  pickAnchor,
  CHUNK_WIDTH,
  NEAR_LAYER,
  LAYERS,
} from '../src/world/city.js';

test('the same seed gives the same city', () => {
  const a = buildingsBetween(createCity(7), NEAR_LAYER, 0, 2000);
  const b = buildingsBetween(createCity(7), NEAR_LAYER, 0, 2000);

  assert.deepEqual(a, b);
});

test('a different seed gives a different city', () => {
  const a = buildingsBetween(createCity(7), NEAR_LAYER, 0, 2000);
  const b = buildingsBetween(createCity(8), NEAR_LAYER, 0, 2000);

  assert.notDeepEqual(a, b);
});

test('a chunk is the same whether you arrive from the left or the right', () => {
  const forwards = createCity(11);
  buildingsBetween(forwards, NEAR_LAYER, 0, CHUNK_WIDTH * 5);
  const fromLeft = buildingsBetween(forwards, NEAR_LAYER, CHUNK_WIDTH * 5, CHUNK_WIDTH * 6);

  const backwards = createCity(11);
  buildingsBetween(backwards, NEAR_LAYER, CHUNK_WIDTH * 40, CHUNK_WIDTH * 41);
  const fromRight = buildingsBetween(backwards, NEAR_LAYER, CHUNK_WIDTH * 5, CHUNK_WIDTH * 6);

  assert.deepEqual(fromLeft, fromRight);
});

test('the city runs in both directions', () => {
  const city = createCity(3);
  const west = buildingsBetween(city, NEAR_LAYER, -4000, -3000);

  assert.ok(west.length > 0);
  assert.ok(west.every((b) => b.x < -3000 + CHUNK_WIDTH * 2));
});

test('buildings never overlap', () => {
  const city = createCity(5);

  for (let layer = 0; layer < LAYERS.length; layer += 1) {
    const buildings = buildingsBetween(city, layer, -3000, 3000);

    for (let i = 1; i < buildings.length; i += 1) {
      const left = buildings[i - 1];
      const right = buildings[i];
      assert.ok(right.x >= left.x + left.width, `layer ${layer} overlaps near ${right.x}`);
    }
  }
});

test('only the near layer has anchors', () => {
  const city = createCity(9);

  for (let layer = 0; layer < NEAR_LAYER; layer += 1) {
    const buildings = buildingsBetween(city, layer, 0, 2000);
    assert.ok(buildings.every((b) => b.anchors.length === 0));
  }

  const near = buildingsBetween(city, NEAR_LAYER, 0, 2000);
  assert.ok(near.every((b) => b.anchors.length > 0));
});

test('every anchor sits on the roof of the building it belongs to', () => {
  const buildings = buildingsBetween(createCity(13), NEAR_LAYER, 0, 3000);

  for (const b of buildings) {
    for (const a of b.anchors) {
      assert.ok(a.x >= b.x - 1e-9 && a.x <= b.x + b.width + 1e-9);
      assert.equal(a.y, b.height);
    }
  }
});

test('the hero passes straight through buildings', () => {
  const world = createWorld({ drag: 0 });
  const city = createCity(6);
  world.hero.pos = vec(0, 60);
  world.hero.vel = vec(60, 0);

  for (let i = 0; i < 480; i += 1) step(world, 1 / 240);

  // Nothing but drag and gravity acted, so he kept every bit of his run.
  assert.ok(world.hero.vel.x > 59.9, `lost speed to something, now ${world.hero.vel.x}`);
  assert.ok(buildingsBetween(city, NEAR_LAYER, 0, world.hero.pos.x).length > 0);
});

test('aiming picks the reachable anchor closest to where you pointed', () => {
  const from = { x: 0, y: 30 };
  const target = { x: 60, y: 90 };
  const maxRange = 150;

  for (const seed of [1, 21, 99, 20250806]) {
    const city = createCity(seed);
    const anchor = pickAnchor(city, from, target, maxRange);
    assert.ok(anchor, `seed ${seed} found nothing in range`);
    assert.ok(anchor.y > from.y);

    // Check it against every candidate the hard way.
    const best = buildingsBetween(city, NEAR_LAYER, from.x - maxRange, from.x + maxRange)
      .flatMap((b) => b.anchors)
      .filter((a) => a.y > from.y + 2)
      .filter((a) => Math.hypot(a.x - from.x, a.y - from.y) <= maxRange)
      .reduce((a, b) =>
        Math.hypot(b.x - target.x, b.y - target.y) < Math.hypot(a.x - target.x, a.y - target.y)
          ? b
          : a,
      );

    assert.deepEqual(anchor, best);
  }
});

test('nothing out of range is ever picked', () => {
  const city = createCity(21);
  const anchor = pickAnchor(city, { x: 0, y: 90 }, { x: 900, y: 200 }, 40);

  if (anchor) assert.ok(Math.hypot(anchor.x, anchor.y - 90) <= 40);
});

test('anchors below the hero are ignored', () => {
  const city = createCity(21);
  const high = { x: 0, y: 400 }; // above every rooftop

  assert.equal(pickAnchor(city, high, { x: 20, y: 0 }, 300), null);
});

test('the chunk cache does not grow without bound', () => {
  const city = createCity(4);
  for (let i = 0; i < 400; i += 1) {
    buildingsBetween(city, NEAR_LAYER, i * CHUNK_WIDTH, i * CHUNK_WIDTH + 10);
  }

  assert.ok(city.chunks[NEAR_LAYER].size < 200, `cache held ${city.chunks[NEAR_LAYER].size}`);
});

test('the seeded generator is stable and spread out', () => {
  const rng = mulberry32(hashInts(1, 2, 3));
  const values = Array.from({ length: 400 }, rng);

  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((a, b) => a + b) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, `mean was ${mean}`);
  assert.equal(mulberry32(hashInts(1, 2, 3))(), values[0]);
});
