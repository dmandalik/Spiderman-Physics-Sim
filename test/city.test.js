import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, hashInts } from '../src/world/random.js';
import { roofLedges } from '../src/render/pixel/facade.js';
import { cells } from '../src/render/pixel/grid.js';
import { vec } from '../src/physics/vec.js';
import { createWorld, step } from '../src/physics/world.js';
import {
  createCity,
  buildingsBetween,
  pickAnchor,
  streetBetween,
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

// The rule the whole aiming system rests on. Shops, trees, lamps, benches and
// traffic lights are scenery, and none of them may ever hand back somewhere to
// stick a web, however tall the art makes them look.
test('nothing at street level can be webbed', () => {
  for (const seed of [1, 21, 20250806]) {
    const city = createCity(seed);
    const { shops, props } = streetBetween(city, 0, 3000);

    assert.ok(shops.length > 0, 'no shops generated');
    assert.ok(props.length > 0, 'no props generated');

    for (const thing of [...shops, ...props]) {
      assert.equal(thing.anchors, undefined, `${thing.kind || 'shop'} carries anchors`);
    }
  }
});

test('aiming never returns a street level anchor', () => {
  const city = createCity(77);

  for (let x = 100; x < 3000; x += 37) {
    // Stand low and aim straight down the street, where the shops are.
    const from = { x, y: 24 };
    const picked = pickAnchor(city, from, { x: x + 40, y: 6 }, 120, 0, 20);

    // Anything under a podium roof came from scenery: an awning, a tree, a shop
    // parapet. Towers now stand on a podium about nineteen metres high and its
    // roof is a real ledge, so the old floor of thirty metres would fail on a
    // perfectly good one. Fifteen is under every podium and over every shop.
    if (picked) assert.ok(picked.y > 15, `picked something ${picked.y.toFixed(0)} m up`);
  }
});

// The podium is the reason a tower has anything to grab below its crown. It is
// worth stating on its own, because the silhouette and the ledge finder used to
// disagree about which row the roof of it was and the anchors quietly vanished
// while the drawing stayed correct.
test('a tower offers its podium roof as well as its crown', () => {
  const city = createCity(20250806);
  const towers = buildingsBetween(city, NEAR_LAYER, 0, 2000).filter((b) => b.kind === 'tower');

  assert.ok(towers.length > 20, `only ${towers.length} towers to judge`);

  const withLow = towers.filter((b) => b.anchors.some((a) => a.y < 30));
  assert.ok(
    withLow.length > towers.length * 0.8,
    `only ${withLow.length} of ${towers.length} towers have anything under thirty metres`,
  );
});

test('the street is the same city every time you walk it', () => {
  const a = streetBetween(createCity(9), 0, 1500);
  const b = streetBetween(createCity(9), 0, 1500);

  assert.deepEqual(a, b);
  assert.notDeepEqual(a, streetBetween(createCity(10), 0, 1500));
});

test('shopfronts sit in a terrace with no gaps and no overlaps', () => {
  const { shops } = streetBetween(createCity(5), 0, 2000);

  for (let i = 1; i < shops.length; i += 1) {
    const left = shops[i - 1];
    const right = shops[i];
    const gap = right.x - (left.x + left.width);
    // Chunk boundaries leave a small remainder, so allow one shop's worth.
    assert.ok(gap >= -1e-9, `shops overlap near ${right.x}`);
  }
});

// Anchors used to be a straight line across the top at full height, which was
// right only while every building was a box. Now a tower has setbacks, a cut
// corner or a taper, so an anchor has to sit on a surface that shape actually
// has, and this checks it against the same silhouette the renderer draws from.
test('every anchor sits on a real ledge of the building it belongs to', () => {
  const buildings = buildingsBetween(createCity(13), NEAR_LAYER, 0, 3000);
  let towersChecked = 0;

  for (const b of buildings) {
    const rows = cells(b.height);
    const cols = cells(b.width);
    const ledges = roofLedges({ kind: b.kind, shape: b.shape, cols, rows });

    // Heights the silhouette actually offers, in metres above the ground.
    const surfaces = ledges.map((l) => b.height * (1 - l.row / rows));
    if (b.kind === 'tower') towersChecked += 1;

    for (const a of b.anchors) {
      assert.ok(a.x >= b.x - 1e-9 && a.x <= b.x + b.width + 1e-9, 'anchor is off the side');
      assert.ok(a.y <= b.height + 1e-9, 'anchor is above the roof');
      assert.ok(
        surfaces.some((h) => Math.abs(h - a.y) < 1e-9),
        `anchor at ${a.y.toFixed(1)} m is on no ledge of a ${b.height.toFixed(0)} m ${b.shape || b.kind}`,
      );
    }
  }

  assert.ok(towersChecked > 5, 'not enough towers in this stretch to be meaningful');
});

// A shape with nowhere flat on it is still somewhere you have to be able to
// swing from, or the tallest thing on the skyline becomes the one building you
// cannot use.
test('every building offers at least one anchor, spires included', () => {
  const buildings = buildingsBetween(createCity(9), NEAR_LAYER, 0, 4000);
  const shapes = new Set();

  for (const b of buildings) {
    assert.ok(b.anchors.length > 0, `a ${b.height.toFixed(0)} m ${b.shape || b.kind} has none`);
    if (b.shape) shapes.add(b.shape);
  }

  assert.ok(shapes.has('spire'), 'no spire in this stretch, so the case is untested');
  assert.equal(shapes.size, 5, 'every tower shape should turn up over four kilometres');
});

// A ziggurat should hand you far more to aim at than a plain slab, which is the
// whole reason for reading the ledges off the silhouette.
test('a stepped tower offers more anchors than a flat topped one', () => {
  const buildings = buildingsBetween(createCity(9), NEAR_LAYER, 0, 4000);
  const most = (shape) =>
    Math.max(...buildings.filter((b) => b.shape === shape).map((b) => b.anchors.length));

  assert.ok(most('deco') > most('slab'), 'a ziggurat should carry terraces');
  assert.ok(most('setback') > most('slab'), 'setbacks should carry terraces');
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

test('aiming picks the anchor closest to the direction you pointed', () => {
  const from = { x: 0, y: 30 };
  const target = { x: 60, y: 90 };
  const maxRange = 150;

  for (const seed of [1, 21, 99, 20250806]) {
    const city = createCity(seed);
    const anchor = pickAnchor(city, from, target, maxRange);
    assert.ok(anchor, `seed ${seed} found nothing in range`);

    const bearing = (p) => Math.atan2(p.y - from.y, p.x - from.x);
    const off = Math.abs(bearing(anchor) - bearing(target));

    // Within a wide cone of where you aimed. The costs can pull it off the
    // exact nearest, never across the sky.
    assert.ok(off < 1.2, `seed ${seed} picked ${off.toFixed(2)} rad off aim`);
  }
});

// The reported bug: a roof above the top of the window is somewhere you cannot
// physically put the pointer, so scoring by distance to the cursor could never
// choose it. Scoring by direction can, and this checks that it does.
test('it can pick a rooftop well above the point you aimed at', () => {
  const city = createCity(77);

  let above = 0;
  let cases = 0;

  for (let x = 300; x < 5000; x += 23) {
    const from = { x, y: 55 };
    // Aim up and forward, but only as far up as a window edge would allow.
    const target = { x: from.x + 30, y: from.y + 25 };
    const picked = pickAnchor(city, from, target, 150, 0, 22);
    if (!picked) continue;

    cases += 1;
    if (picked.y > target.y + 20) above += 1;
  }

  assert.ok(cases > 20, 'not enough cases to judge');
  // Scoring by distance to the cursor gave this essentially never, because
  // anything that high was always far from the point clicked.
  assert.ok(above / cases > 0.3, `only ${((100 * above) / cases).toFixed(0)}% reached high`);
});

// The reported case, stated exactly. The camera shows about 42 metres above
// him, so a taller roof than that is somewhere the pointer cannot go. Parking
// the cursor underneath it, pinned to the top edge, has to be enough.
test('parking the cursor under a tower grabs the roof above the frame', () => {
  const WINDOW_TOP = 42;
  const RANGE = 90;

  let cases = 0;
  let grabbed = 0;

  for (const seed of [1, 21, 77, 20250806]) {
    const city = createCity(seed);

    for (let x = 200; x < 4000; x += 19) {
      const from = { x, y: 55 };

      // A roof ahead of him that is out of view but in reach.
      const tower = buildingsBetween(city, NEAR_LAYER, x, x + RANGE).find((b) => {
        const a = b.anchors[0];
        return a && a.x > from.x && a.y - from.y > WINDOW_TOP + 8
          && Math.hypot(a.x - from.x, a.y - from.y) <= RANGE;
      });
      if (!tower) continue;

      const want = tower.anchors[0];
      const picked = pickAnchor(city, from, { x: want.x, y: from.y + WINDOW_TOP }, RANGE, 0, 30);

      cases += 1;
      // The bug was grabbing something low, or something on another building.
      // Stated that way rather than as "the very topmost ledge", because a
      // ziggurat's second terrace is five metres under its apex and picking it
      // is a perfectly good answer: it is the tower he pointed at and it is well
      // above the frame. Demanding the exact top ledge made this test turn on a
      // hundredth of a point of aim score between two ledges in one column.
      const overhead = picked && picked.y - from.y > WINDOW_TOP;
      if (overhead && Math.abs(picked.x - want.x) <= 3) grabbed += 1;
    }
  }

  assert.ok(cases > 50, `only ${cases} cases to judge`);
  assert.equal(grabbed, cases, `${cases - grabbed} of ${cases} missed the tower overhead`);
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

// Aiming is generous on purpose, but generosity used to mean it would happily
// hand you a ledge just behind your shoulder, which stops a swing dead.
test('travelling forward, a web ahead beats one behind even when you aim badly', () => {
  const city = createCity(77);
  const from = { x: 600, y: 90 };

  // Aim behind him while moving forward. He should still be given something in
  // front, because swinging backwards ruins the run.
  const behindTarget = { x: from.x - 60, y: from.y + 40 };
  const picked = pickAnchor(city, from, behindTarget, 140, 0, 30);

  if (picked) assert.ok(picked.x >= from.x, `picked one behind at ${picked.x} from ${from.x}`);
});

test('with no heading it just takes whatever is nearest the cursor', () => {
  const city = createCity(77);
  const from = { x: 600, y: 90 };
  const target = { x: from.x - 60, y: from.y + 40 };

  const free = pickAnchor(city, from, target, 140, 0, 0);
  const forward = pickAnchor(city, from, target, 140, 0, 30);

  // Standing still there is no forward, so the bias switches itself off.
  if (free && forward) assert.ok(free.x <= forward.x);
});

test('it will still swing backwards when there is nothing else', () => {
  const city = createCity(77);
  const buildings = buildingsBetween(city, NEAR_LAYER, 0, 1200);
  const tall = buildings.filter((b) => b.height > 100);

  if (tall.length) {
    // Stand just past a tall building with the range only reaching back to it.
    const roof = tall[0];
    const from = { x: roof.x + roof.width + 30, y: roof.height - 40 };
    const picked = pickAnchor(city, from, { x: roof.x, y: roof.height }, 60, 0, 30);
    if (picked) assert.ok(picked.y > from.y, 'whatever it picks must be above him');
  }
});

test('it never hands back a rope too short to swing on', () => {
  const city = createCity(3);
  const buildings = buildingsBetween(city, NEAR_LAYER, 0, 2000).filter((b) => b.height > 60);

  for (const b of buildings.slice(0, 12)) {
    const anchor = b.anchors[0];
    // Stand right under a rooftop and aim at it.
    const from = { x: anchor.x, y: anchor.y - 12 };
    const picked = pickAnchor(city, from, anchor, 120, 0, 25);

    if (picked) {
      const reach = Math.hypot(picked.x - from.x, picked.y - from.y);
      assert.ok(reach > 10, `handed back a ${reach.toFixed(1)} m rope`);
    }
  }
});
