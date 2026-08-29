import test from 'node:test';
import assert from 'node:assert/strict';

import { POSES, COLOURS } from '../src/render/pixel/poses.js';
import { selectPose, THROW_TIME, SWING_SPEED } from '../src/render/pixel/select.js';

const attached = { attached: true, anchor: { x: 0, y: 100 }, restLength: 30, since: 0 };
const free = { attached: false, anchor: { x: 0, y: 0 }, since: -Infinity };
const still = { x: 0, y: 0 };

// A row one character short shears the whole figure sideways from that row
// down. Poses may differ in size from each other, but every row within a pose
// has to agree. Cheaper to catch here than by eye.
test('every pose grid is rectangular', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    assert.ok(pose.grid.length > 0, `${name} is empty`);
    const width = pose.grid[0].length;

    for (const [index, row] of pose.grid.entries()) {
      assert.equal(row.length, width, `${name} row ${index} is ${row.length}, expected ${width}`);
    }
  }
});

test('every pose uses only colours that exist', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    for (const row of pose.grid) {
      for (const cell of row) {
        assert.ok(cell === '.' || COLOURS[cell], `${name} uses unknown colour ${cell}`);
      }
    }
  }
});

test('every pose puts its wrist and centre of mass inside its own grid', () => {
  for (const [name, pose] of Object.entries(POSES)) {
    const width = pose.grid[0].length;
    const height = pose.grid.length;

    for (const [label, point] of [['wrist', pose.wrist], ['com', pose.com]]) {
      assert.ok(point.col >= 0 && point.col <= width, `${name} ${label} off sideways`);
      assert.ok(point.row >= 0 && point.row <= height, `${name} ${label} off vertically`);
    }
  }
});

// The whole figure is drawn with one line weight. This is stated as two
// separate faults because they look different on screen and came from different
// causes: a gap in the keyline shows as the red of the suit bleeding into the
// sky, and a doubled one shows as the blobby black mass the swing poses used to
// carry around their heads.
test('every pose carries a complete keyline exactly one cell thick', () => {
  const OUTLINE = 'a';
  const CLEAR = '.';
  const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (const [name, pose] of Object.entries(POSES)) {
    const grid = pose.grid;
    const at = (x, y) => (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length ? CLEAR : grid[y][x]);
    const coloured = (x, y) => {
      const key = at(x, y);
      return key !== CLEAR && key !== OUTLINE;
    };

    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[0].length; x += 1) {
        const key = at(x, y);
        const touches = AROUND.some(([dx, dy]) => coloured(x + dx, y + dy));

        if (coloured(x, y)) {
          // Orthogonal only. A shape that meets air on the diagonal is a
          // staircase, and a keyline round the outside of every step of one
          // reads as a thicker line, not a cleaner drawing.
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            assert.notEqual(at(x + dx, y + dy), CLEAR, `${name} has bare suit at ${x},${y}`);
          }
        } else if (key === OUTLINE) {
          assert.ok(touches, `${name} has keyline at ${x},${y} touching nothing`);
        }
      }
    }
  }
});

test('no web means free flight, whatever he is doing', () => {
  assert.equal(selectPose({ web: free, vel: { x: 30, y: -20 }, time: 5 }), 'freeFlight');
  assert.equal(selectPose({ web: free, vel: still, time: 0 }), 'freeFlight');
});

test('the throw pose holds briefly then gives way', () => {
  assert.equal(selectPose({ web: attached, vel: still, time: 0 }), 'webbing');
  assert.equal(selectPose({ web: attached, vel: still, time: THROW_TIME * 0.9 }), 'webbing');
  assert.equal(selectPose({ web: attached, vel: still, time: THROW_TIME * 1.1 }), 'bottomSwing');
});

test('which way he is moving picks the swing pose', () => {
  const at = (y) => selectPose({ web: attached, vel: { x: 20, y }, time: 5 });

  assert.equal(at(-SWING_SPEED * 2), 'downSwing');
  assert.equal(at(SWING_SPEED * 2), 'upSwing');
  assert.equal(at(0), 'bottomSwing', 'rolling through the bottom is the loaded pose');
});

test('a pose exists for everything the selector can return', () => {
  const cases = [
    { web: free, vel: still, time: 0 },
    { web: attached, vel: still, time: 0 },
    { web: attached, vel: { x: 0, y: -20 }, time: 9 },
    { web: attached, vel: { x: 0, y: 20 }, time: 9 },
    { web: attached, vel: still, time: 9 },
  ];

  const seen = new Set(cases.map(selectPose));
  assert.equal(seen.size, 5, 'every pose the selector names should be reachable');

  for (const name of seen) assert.ok(POSES[name], `no art for ${name}`);
});
