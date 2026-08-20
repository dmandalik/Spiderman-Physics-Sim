import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFacade, facadePalette, CELL } from '../src/render/pixel/facade.js';
import { mulberry32 } from '../src/world/random.js';

const build = (over = {}) =>
  buildFacade({ cols: 46, rows: 66, floors: 2, shopfront: true, rng: mulberry32(7), ...over });

test('a facade is a rectangular grid of the size asked for', () => {
  const grid = build();

  assert.equal(grid.length, 66);
  assert.ok(grid.every((row) => row.length === 46), 'rows are ragged');
});

test('every cell is a colour the palette actually has', () => {
  const keys = new Set(Object.keys(facadePalette('#cfae72')));

  for (const size of [[20, 30], [46, 66], [90, 240]]) {
    const grid = build({ cols: size[0], rows: size[1] });
    for (const row of grid) {
      for (const key of row) assert.ok(keys.has(key), `unknown colour ${key}`);
    }
  }
});

test('the same seed draws the same building', () => {
  assert.deepEqual(build(), build());
  assert.notDeepEqual(build(), build({ rng: mulberry32(8) }));
});

// The keyline is what ties the city to the sprite, and a facade missing one
// down its side reads as a hole rather than a wall.
test('a facade is outlined all the way round its edges', () => {
  const grid = build();

  assert.ok([...grid[0]].every((c) => c === 'a'), 'no line along the top');
  assert.ok(grid.every((row) => row[0] === 'a' && row[row.length - 1] === 'a'), 'open sides');
});

test('it holds together at sizes it will really be asked for', () => {
  // A narrow shop through to a tower, in cells, at a fifth of a metre each.
  for (let cols = 12; cols <= 200; cols += 7) {
    for (const rows of [24, 60, 200, 840]) {
      const grid = buildFacade({ cols, rows, floors: Math.max(Math.floor(rows / 40), 1), rng: mulberry32(3) });
      assert.equal(grid.length, rows);
      assert.ok(grid.every((row) => row.length === cols), `ragged at ${cols} by ${rows}`);
    }
  }
});

test('a cell is small enough to carry the detail the reference has', () => {
  // The reference draws a shopfront about forty five cells wide. Anything much
  // coarser than this cannot fit a window frame inside a window.
  assert.ok(CELL <= 0.25, `cells are ${CELL} m, too coarse for a frame`);
  assert.ok(9 / CELL > 35, 'a nine metre shop comes out too few cells wide');
});
