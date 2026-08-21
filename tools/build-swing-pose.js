// Builds the swinging pose out of the traced reference.
//
//   node tools/build-swing-pose.js
//
// The rule that makes this work: keep the traced body whole and change only the
// limbs. An earlier version sheared the torso to fake an arched back and it
// tore the suit's blue side panels into a smear, because you cannot bend a
// twelve pixel wide drawing and have it survive. The arch is sold by the angle
// of the limbs instead, which costs nothing and cannot damage the likeness.
//
// The reference faces left. He travels right, so everything is mirrored first.

import { readFileSync, writeFileSync } from 'node:fs';

const WIDTH = 32;
const HEIGHT = 44;
const SHIFT = 8; // room on the left for the reaching arm and the trailing legs

// Rows the traced legs occupy. Everything from here down is redrawn.
const LEG_ROWS = 31;

// The arm hanging on his back side once mirrored, cleared row by row so the
// trunk outline beside it survives.
const CLEAR = [
  [21, 5], [22, 5], [23, 5], [24, 5],
  [25, 4], [26, 4],
  [27, 3], [28, 3], [29, 3],
  [30, 2],
];

const LEG_SWEEP = 1.05; // radians the legs swing back from hanging straight down

const P = { outline: 'a', red: 'b', shade: 'c', blue: 'd', blueShade: 'e', deep: 'f' };

const traced = readGrid('src/render/pixel/poses.js', 'perch');
const mirrored = traced.map((row) => [...row].reverse().join(''));

const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('.'));

stampBody();
stampWebArm();
stampLegs();
outline();

const text = grid.map((row) => `  '${row.join('')}',`).join('\n');
writeFileSync('/tmp/swing.txt', text);
console.log(text);

// Head and trunk verbatim. The legs are dropped and the back arm is cleared,
// because those are the two things a swing actually changes.
function stampBody() {
  const clear = new Map(CLEAR);

  for (let r = 0; r < LEG_ROWS; r += 1) {
    const line = mirrored[r];
    const cutTo = clear.get(r) ?? -1;

    for (let c = 0; c < line.length; c += 1) {
      if (line[c] === '.' || c <= cutTo) continue;
      put(c + SHIFT, r, line[c]);
    }
  }
}

// Stretched up and behind him toward the anchor, which is always straight up in
// sprite space. Reaching back is what opens the chest and reads as an arch.
function stampWebArm() {
  limb({ col: SHIFT + 5, row: 19 }, { col: SHIFT + 1, row: 13 }, { col: SHIFT - 2, row: 7 }, P.red, 3);
  glove(SHIFT - 4, 4);
}

// The reference's own legs, swung back about the hip.
//
// Drawing new ones from strokes gave a blue blob, because tapered limbs with
// boots on the end are exactly the thing a line tool cannot make. Rotating the
// drawn ones keeps their shape, their taper and their boots, and only changes
// the angle, which is all a swing actually does to them.
//
// Sampled by inverse mapping, so every destination cell asks the source what
// belongs there. Rotating forwards instead would scatter the source across the
// destination and leave holes between the landing points.
function stampLegs() {
  const pivot = { col: 10, row: 29 }; // the hip, in the traced sprite's own frame
  const sin = Math.sin(LEG_SWEEP);
  const cos = Math.cos(LEG_SWEEP);

  for (let r = pivot.row; r < HEIGHT; r += 1) {
    for (let c = 0; c < WIDTH; c += 1) {
      const dc = c - SHIFT - pivot.col;
      const dr = r - pivot.row;

      const sc = Math.round(pivot.col + dc * cos + dr * sin);
      const sr = Math.round(pivot.row - dc * sin + dr * cos);
      if (sr < LEG_ROWS || sr >= mirrored.length) continue;

      const ch = mirrored[sr]?.[sc];
      if (!ch || ch === '.') continue;
      put(c, r, ch);
    }
  }
}

function limb(a, b, c, colour, size) {
  stroke(a, b, colour, size);
  stroke(b, c, colour, size - 1);
}

function glove(col, row) {
  brush(col, row, P.red, 3);
  put(col + 3, row + 1, P.red); // index finger
  put(col + 3, row + 3, P.red); // pinky, the web shooter gesture
}

function boot(col, row, colour, size = 3) {
  brush(col, row, colour, size);
}

function stroke(a, b, colour, size) {
  const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    brush(Math.round(a.col + (b.col - a.col) * t), Math.round(a.row + (b.row - a.row) * t), colour, size);
  }
}

function brush(col, row, colour, size) {
  for (let dr = 0; dr < size; dr += 1) {
    for (let dc = 0; dc < size; dc += 1) put(col + dc, row + dr, colour);
  }
}

function put(col, row, ch) {
  if (col < 0 || col >= WIDTH || row < 0 || row >= HEIGHT) return;
  grid[row][col] = ch;
}

// One black line around the outside and nothing scattered through the middle.
// Outlining every empty cell beside a filled one puts black in the gap wherever
// an arm crosses the body, which speckles the figure, so only space that
// reaches the border counts as outside.
function outline() {
  const outside = flood();

  // Anything empty that the border cannot reach is a gap enclosed between two
  // limbs, not a hole in him. Left alone it renders as a window straight
  // through his body, so it gets filled rather than outlined.
  for (let r = 0; r < HEIGHT; r += 1) {
    for (let c = 0; c < WIDTH; c += 1) {
      if (grid[r][c] === '.' && !outside.has(`${r},${c}`)) grid[r][c] = P.blueShade;
    }
  }

  for (const key of outside) {
    const [r, c] = key.split(',').map(Number);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbour = grid[r + dr]?.[c + dc];
      if (neighbour && neighbour !== '.' && neighbour !== P.outline) {
        put(c, r, P.outline);
        break;
      }
    }
  }
}

// Seeded from the whole border, not one corner. A limb reaching the canvas edge
// walls off everything beyond it, and a flood starting at a single corner then
// calls that walled off space enclosed and fills it in.
function flood() {
  const seen = new Set();
  const queue = [];

  for (let r = 0; r < HEIGHT; r += 1) queue.push([r, 0], [r, WIDTH - 1]);
  for (let c = 0; c < WIDTH; c += 1) queue.push([0, c], [HEIGHT - 1, c]);

  while (queue.length) {
    const [r, c] = queue.pop();
    if (r < 0 || r >= HEIGHT || c < 0 || c >= WIDTH) continue;

    const key = `${r},${c}`;
    if (seen.has(key) || grid[r][c] !== '.') continue;

    seen.add(key);
    queue.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }

  return seen;
}

function readGrid(file, name) {
  const src = readFileSync(file, 'utf8');
  const block = new RegExp(`const ${name} = \\[\\n(.*?)\\n\\];`, 's').exec(src)[1];
  return block.split('\n').map((line) => /'(.*)'/.exec(line)[1]);
}
