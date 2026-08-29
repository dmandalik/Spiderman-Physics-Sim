import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProp,
  drawnSize,
  PROP_COLOURS,
  PROP_KINDS,
  PROP_SIZES,
  STREET_SCALE,
} from '../src/render/pixel/props.js';
import { CELL, cells, CLEAR } from '../src/render/pixel/grid.js';
import { mulberry32 } from '../src/world/random.js';

const build = (kind, seed = 5) => buildProp(kind, mulberry32(seed));

test('every prop builds a rectangular grid', () => {
  for (const kind of PROP_KINDS) {
    const grid = build(kind);
    assert.ok(grid.length > 0, `${kind} is empty`);
    assert.ok(grid.every((row) => row.length === grid[0].length), `${kind} is ragged`);
  }
});

test('every cell is a colour the prop palette has, or nothing at all', () => {
  const keys = new Set([...Object.keys(PROP_COLOURS), CLEAR]);

  for (const kind of PROP_KINDS) {
    for (const row of build(kind)) {
      for (const key of row) assert.ok(keys.has(key), `${kind} uses unknown colour ${key}`);
    }
  }
});

// The whole point of the grid. A prop that draws itself larger than the metres
// it claims would quietly break the scale of the street around it.
//
// Against the drawn metres, not the real ones. Street furniture is rendered
// larger than life so it sits in the same picture as a hero who is too, and the
// grid follows the size it is actually going to be.
test('a prop is the size in cells that its metres say it is', () => {
  for (const kind of PROP_KINDS) {
    const grid = build(kind);
    const size = drawnSize(kind);

    // Two cells of slack either way for the keyline the outline pass adds.
    assert.ok(
      Math.abs(grid.length - cells(size.height)) <= 3,
      `${kind} is ${grid.length} cells for ${size.height} m, expected about ${cells(size.height)}`,
    );
    assert.ok(
      Math.abs(grid[0].length - cells(size.spread)) <= 5,
      `${kind} is ${grid[0].length} wide for ${size.spread} m`,
    );
  }
});

// The one thing the render scale must not do is bend the street out of shape.
// Every prop is enlarged by the same factor, so a bench is still the same
// fraction of a car as it was, and PROP_SIZES stays the honest set of numbers.
test('everything on the pavement is enlarged by exactly the same amount', () => {
  for (const kind of PROP_KINDS) {
    const drawn = drawnSize(kind);
    const real = PROP_SIZES[kind];

    assert.ok(Math.abs(drawn.height / real.height - STREET_SCALE) < 1e-9, `${kind} height`);
    assert.ok(Math.abs(drawn.spread / real.spread - STREET_SCALE) < 1e-9, `${kind} spread`);
  }
  assert.ok(STREET_SCALE >= 1, 'nothing on the street is drawn smaller than life');
});

// Everybody already knows how tall these things are relative to each other, so
// getting the order wrong is the one mistake nobody will miss.
test('the street furniture stacks up in the right order', () => {
  const height = (kind) => build(kind).length;

  assert.ok(height('hydrant') < height('bin'), 'a hydrant is shorter than a bin');
  assert.ok(height('bin') < height('postbox'), 'a bin is shorter than a post box');
  assert.ok(height('postbox') < height('busStop'), 'a post box is shorter than a shelter');
  assert.ok(height('busStop') < height('stop'), 'a shelter is shorter than a stop sign');
  assert.ok(height('stop') < height('signal'), 'a stop sign is shorter than a signal');
  assert.ok(height('signal') < height('sapling'), 'a signal is shorter than a sapling');
  assert.ok(height('sapling') < height('lamp'), 'a sapling is shorter than a lamp post');
  assert.ok(height('lamp') < height('plane'), 'a lamp post is shorter than a plane tree');
  assert.ok(height('plane') < height('oak'), 'a plane tree is shorter than an oak');
  assert.ok(height('oak') < height('conifer'), 'an oak is shorter than a conifer');
});

test('a car is longer than it is tall, and about the length of a car', () => {
  const grid = build('car');

  assert.ok(grid[0].length > grid.length * 2, 'that is not a car shape');
  assert.ok(
    Math.abs(grid[0].length * CELL - drawnSize('car').spread) < 1.2,
    'a car is not the length a car is drawn',
  );
  // The real figure stays a real figure. Five metres by two point two is a full
  // size pickup, which is a big vehicle and still a vehicle: the render scale is
  // the only place the drawing is allowed to exaggerate.
  assert.ok(
    PROP_SIZES.car.spread >= 4 && PROP_SIZES.car.spread <= 6,
    `a real car is ${PROP_SIZES.car.spread} m long`,
  );
  assert.ok(
    PROP_SIZES.car.height >= 1.4 && PROP_SIZES.car.height <= 2.4,
    `a real car is ${PROP_SIZES.car.height} m tall`,
  );
});

test('nothing floats, everything reaches the ground line', () => {
  for (const kind of PROP_KINDS) {
    const grid = build(kind);
    const feet = grid[grid.length - 1];
    assert.ok([...feet].some((key) => key !== CLEAR), `${kind} does not touch the ground`);
  }
});

test('the same seed draws the same prop', () => {
  for (const kind of PROP_KINDS) {
    assert.deepEqual(build(kind), build(kind));
  }
});

test('an unknown prop is an error rather than an empty sprite', () => {
  assert.throws(() => buildProp('unicorn'), /no such prop/);
});
