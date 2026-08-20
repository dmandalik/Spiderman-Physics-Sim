import test from 'node:test';
import assert from 'node:assert/strict';

import {
  spritePixels,
  spriteVisible,
  createSprite,
  startSpriteFrame,
  ifAffordable,
} from '../src/render/pixel/sprite.js';
import { CLEAR } from '../src/render/pixel/grid.js';
import { buildFacade, facadePalette } from '../src/render/pixel/facade.js';
import { buildProp, PROP_COLOURS } from '../src/render/pixel/props.js';
import { mulberry32 } from '../src/world/random.js';

const PALETTE = { a: '#102030', b: '#ffffff' };

test('a grid becomes pixels of the same size', () => {
  const { width, height, data } = spritePixels(['aab', 'bba'], PALETTE);

  assert.equal(width, 3);
  assert.equal(height, 2);
  assert.equal(data.length, 3 * 2 * 4);
});

test('colours land where the letters are', () => {
  const { data } = spritePixels(['ab'], PALETTE);

  assert.deepEqual([...data.slice(0, 4)], [0x10, 0x20, 0x30, 255]);
  assert.deepEqual([...data.slice(4, 8)], [255, 255, 255, 255]);
});

// The reserved key has to come out fully transparent or every tree is drawn
// inside a black rectangle.
test('clear cells stay transparent', () => {
  const { data } = spritePixels([`a${CLEAR}b`], PALETTE);

  assert.equal(data[3], 255, 'the first cell should be solid');
  assert.equal(data[7], 0, 'the middle cell should be clear');
  assert.equal(data[11], 255, 'the last cell should be solid');
});

test('a letter with no colour is left clear rather than guessed at', () => {
  const { data } = spritePixels(['z'], PALETTE);
  assert.equal(data[3], 0);
});

// The trees are the ones that need this: a canopy that leaked its background
// would sit in a green box against the sky.
test('every prop keeps transparent corners', () => {
  const grid = buildProp('plane', mulberry32(4));
  const { width, data } = spritePixels(grid, PROP_COLOURS);

  assert.equal(data[3], 0, 'top left is not clear');
  assert.equal(data[(width - 1) * 4 + 3], 0, 'top right is not clear');
});

test('a real tower rasterises to exactly one pixel per cell', () => {
  const grid = buildFacade({ kind: 'tower', shape: 'deco', cols: 140, rows: 640, rng: mulberry32(3) });
  const { width, height, data } = spritePixels(grid, facadePalette('#b06a3c'));

  assert.equal(width, 140);
  assert.equal(height, 640);

  // Most of a building is solid. If this ever comes out mostly transparent the
  // silhouette has collapsed and the sheet would show an empty column.
  let solid = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 255) solid += 1;
  assert.ok(solid > width * height * 0.5, `only ${((100 * solid) / (width * height)).toFixed(0)}% solid`);
});

test('off screen sprites are known to be off screen', () => {
  const on = (x, y) => spriteVisible(x, y, 8, 8, 800, 600);

  assert.equal(on(10, 10), true);
  assert.equal(on(-20, 10), false);
  assert.equal(on(810, 10), false);
  assert.equal(on(10, 610), false);
  // Straddling the edge still counts, or buildings pop in at the margin.
  assert.equal(on(-4, 10), true);
  assert.equal(on(796, 10), true);
});

// The cap that keeps a chunk loading from dropping a frame. Tested with a clock
// we control, because the whole point is what happens when the work is slow.
test('sprite building stops once the frame budget is gone', () => {
  let now = 0;
  startSpriteFrame(() => now);

  const build = (cost) => ifAffordable(() => { now += cost; return 'made'; });

  assert.equal(build(3), 'made', 'the first one should always fit');
  assert.equal(build(3), 'made', 'still inside the budget at three milliseconds');
  assert.equal(build(3), null, 'over budget, so it should have refused');

  // A new frame lets the work start again.
  startSpriteFrame(() => now);
  assert.equal(build(1), 'made');
});

test('one very slow sprite still gets made rather than nothing ever being made', () => {
  let now = 0;
  startSpriteFrame(() => now);

  // A single tower costs more than the whole budget. Refusing it would mean it
  // never gets built at all, so the rule is one may always start.
  assert.equal(ifAffordable(() => { now += 50; return 'tower'; }), 'tower');
  assert.equal(ifAffordable(() => 'another'), null);
});
