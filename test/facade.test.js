import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFacade, facadePalette, CELL, SHAPES } from '../src/render/pixel/facade.js';
import { cells } from '../src/render/pixel/grid.js';
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

// This replaces a test that asserted the opposite, that a cell had to be 0.25 m
// or finer. That number came from guessing at a shopfront in a busy street
// photograph. The separated tower sheet can actually be measured, and it says
// 0.4: its tall tower is thirty five metres wide and eighty six art pixels
// across. At the old value the same tower came out a hundred and seventy five
// cells, twice the reference's resolution, and an art pixel landed on one or two
// screen pixels, which is the whole reason it never read as pixel art.
test('a cell is the size the reference draws one', () => {
  const REFERENCE = { metres: 35, pixels: 86 };
  const mine = REFERENCE.metres / CELL;

  assert.ok(
    Math.abs(mine - REFERENCE.pixels) <= 6,
    `a ${REFERENCE.metres} m tower is ${mine} cells here and ${REFERENCE.pixels} in the reference`,
  );
});

// The other half of the same judgement. A cell has to survive to the screen as
// something you can see the corners of, and the camera only ever shows between
// five and ten pixels to the metre.
test('an art pixel is at least two screen pixels at every zoom', () => {
  assert.ok(CELL * 5 >= 2, `a cell is ${CELL * 5} screen pixels zoomed out`);
});

// Nothing on a building may hang in the sky beside it.
//
// Two separate faults produced this and neither showed up in any other test.
// The setback that lifts a shaft off its podium was added after each shape had
// already clamped its own inset, so on a tall spire the total ran past the
// clamp, the width came out negative, and eighteen rows at the top were simply
// not drawn. The mast was then placed at the top of the grid regardless, which
// is how a finial ended up floating eighteen rows above the point it belongs to.
//
// Stated as connectivity rather than as either bug, because that is the property
// that matters and it holds however the silhouettes change next.
test('every part of a building is attached to the rest of it', () => {
  const SIZES = [[24, 152], [28, 128], [26, 118], [22, 100], [21, 86], [34, 160], [18, 70]];

  for (const shape of SHAPES) {
    for (const [metresWide, metresTall] of SIZES) {
      const grid = buildFacade({
        kind: 'tower',
        shape,
        cols: cells(metresWide),
        rows: cells(metresTall),
        rng: mulberry32(5),
      });

      const rows = grid.length;
      const cols = grid[0].length;
      const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
      const stack = [];

      // Everything that can be reached from the ground row is standing on it.
      for (let x = 0; x < cols; x += 1) {
        if (grid[rows - 1][x] !== '.') {
          seen[rows - 1][x] = true;
          stack.push([x, rows - 1]);
        }
      }
      while (stack.length) {
        const [x, y] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (seen[ny][nx] || grid[ny][nx] === '.') continue;
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          assert.ok(
            grid[y][x] === '.' || seen[y][x],
            `${shape} at ${metresWide} by ${metresTall} m floats at ${x},${y}`,
          );
        }
      }
    }
  }
});
