// Every pose on one sheet, no browser involved.
//
//   node tools/render-poses.js out.png [scale]
//
// The poses are the one part of the art that is never seen still: in the game
// they are rotated, moving, and a couple of centimetres tall. That is exactly
// why the keyline drifted for as long as it did. Laid out side by side at eight
// times size, a doubled outline on one head and a bare edge on the next are
// impossible to miss.

import { writeFileSync } from 'node:fs';

import { encodePng } from './png.js';
import { POSES, COLOURS } from '../src/render/pixel/poses.js';

const [out = 'poses.png', scaleArg = '8'] = process.argv.slice(2);
const SCALE = Number(scaleArg);
const GAP = 2; // cells of air between poses
const SKY = '#6f6888';

const list = Object.entries(POSES);
const tallest = Math.max(...list.map(([, entry]) => entry.grid.length));
const cols = list.reduce((sum, [, entry]) => sum + entry.grid[0].length + GAP, GAP);
const rows = tallest + GAP * 2;

const width = cols * SCALE;
const height = rows * SCALE;
const pixels = Buffer.alloc(width * height * 3);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function put(col, row, colour) {
  for (let y = row * SCALE; y < (row + 1) * SCALE; y += 1) {
    for (let x = col * SCALE; x < (col + 1) * SCALE; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const at = (y * width + x) * 3;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
    }
  }
}

const sky = rgb(SKY);
for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) put(col, row, sky);

// Stood on a common baseline, so a pose that is a couple of cells shorter than
// its neighbour does not look like it is floating.
let x = GAP;
for (const [, entry] of list) {
  const grid = entry.grid;
  const top = GAP + tallest - grid.length;

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const colour = COLOURS[grid[row][col]];
      if (colour) put(x + col, top + row, rgb(colour));
    }
  }

  x += grid[0].length + GAP;
}

writeFileSync(out, encodePng(width, height, pixels));
console.log(
  `${out}  ${width} by ${height} px, ${list.length} poses drawn ${SCALE}x  ` +
    list.map(([name, entry]) => `${name} ${entry.grid[0].length}x${entry.grid.length}`).join('  '),
);
