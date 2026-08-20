// Finds the frames in a sprite sheet and prints their rectangles.
//
//   node tools/slice-sheet.js /tmp/poses.png
//
// Generators lay sheets out in a row but rarely on an exact grid, and they add
// captions even when told not to. So rather than assuming even divisions, this
// looks for where the ink actually is: the rows that hold content, then the
// columns within them. The caption bands come out as their own short rows and
// get dropped, and the tallest band is the characters.

import { readFileSync } from 'node:fs';
import { decodePng } from './png.js';

const file = process.argv[2];
const { width, height, pixels } = decodePng(readFileSync(file));

const at = (x, y) => {
  const i = (y * width + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
};

const background = at(2, 2);
const near = (c) => Math.abs(c[0] - background[0]) + Math.abs(c[1] - background[1]) + Math.abs(c[2] - background[2]) < 90;

// Runs of consecutive lines that hold anything other than background.
function bands(count, hasInk) {
  const found = [];
  let start = -1;

  for (let i = 0; i <= count; i += 1) {
    const ink = i < count && hasInk(i);
    if (ink && start === -1) start = i;
    if (!ink && start !== -1) {
      found.push({ from: start, to: i - 1, size: i - start });
      start = -1;
    }
  }
  return found;
}

const rowBands = bands(height, (y) => {
  for (let x = 0; x < width; x += 1) if (!near(at(x, y))) return true;
  return false;
});

// The characters are the tallest band. Captions are short bands above and below.
const body = rowBands.sort((a, b) => b.size - a.size)[0];

const colBands = bands(width, (x) => {
  for (let y = body.from; y <= body.to; y += 1) if (!near(at(x, y))) return true;
  return false;
}).filter((b) => b.size > width / 60); // ignore stray specks

console.log(`# ${file} ${width}x${height}`);
console.log(`# character band rows ${body.from} to ${body.to}`);
console.log(`# ${colBands.length} frames`);
for (const b of colBands) {
  console.log(`${b.from},${body.from},${b.size},${body.size}`);
}
