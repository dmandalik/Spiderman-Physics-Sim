// Reads a piece of upscaled pixel art and recovers the grid it was drawn on.
//
//   node tools/trace-sprite.js /tmp/spidey.png
//
// Hand copying pixel art by eye does not work, so this does it properly. It
// decodes the PNG, finds the sprite inside its background, works out how many
// screen pixels one art pixel became, samples the centre of every cell, and
// prints the result as grid rows plus the palette it found.
//
// Node only, no dependencies. PNG is just zlib over filtered scanlines and
// node ships zlib, so the whole decoder is about forty lines.

import { readFileSync } from 'node:fs';
import { decodePng } from './png.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/trace-sprite.js <file.png>');
  process.exit(1);
}

const { width, height, pixels } = decodePng(readFileSync(file));
const at = (x, y) => {
  const i = (y * width + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
};

// The source is a lossy webp, so nothing is exactly one colour. Everything
// below tolerates that rather than assuming clean pixels.
const MERGE = 110; // how close two colours have to be to count as the same one

// The background is the most common colour in the whole image, not whatever
// happens to sit in a corner, since compression makes corners unreliable.
const background = mostCommonColour();
const isBackground = (c) => c[3] < 20 || distance(c, background) < MERGE;

function mostCommonColour() {
  const counts = new Map();
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const c = at(x, y);
      // Coarse buckets, so near identical compression noise lands together.
      const key = `${c[0] >> 5},${c[1] >> 5},${c[2] >> 5}`;
      const entry = counts.get(key);
      if (entry) entry.n += 1;
      else counts.set(key, { n: 1, colour: c });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0].colour;
}

// An optional fifth argument, "x,y,w,h", limits everything below to one region
// of the file. That is what lets a sprite sheet be traced frame by frame
// without cutting it up into separate files first.
const crop = (process.argv[5] || '').split(',').map(Number);
const region = crop.length === 4 && crop.every(Number.isFinite)
  ? { x0: crop[0], y0: crop[1], x1: crop[0] + crop[2], y1: crop[1] + crop[3] }
  : { x0: 0, y0: 0, x1: width, y1: height };

// Bounding box of everything that is not background.
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = region.y0; y < region.y1; y += 1) {
  for (let x = region.x0; x < region.x1; x += 1) {
    if (isBackground(at(x, y))) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

// How big one art pixel became. Every run of identical colour is a whole number
// of cells, so the greatest common divisor of the run lengths is the cell size.
// A third argument forces the output width. Needed for art that was generated
// rather than drawn on a grid: it has soft edges and no real pixel size to
// recover, so detection lands on 2 and returns a four hundred column grid.
// Naming the width instead resamples it down to something usable.
const forcedCols = Number(process.argv[4]) || 0;
const cell = forcedCols ? (maxX - minX + 1) / forcedCols : gcdOfRuns();
const cols = forcedCols || Math.round((maxX - minX + 1) / cell);
const rows = Math.round((maxY - minY + 1) / cell);

console.log(`# sprite ${minX},${minY} to ${maxX},${maxY}`);
console.log(`# cell ${cell}px, grid ${cols} x ${rows}`);

// Sample the centre of each cell, then collect the distinct colours.
const grid = [];
const palette = [];
for (let row = 0; row < rows; row += 1) {
  const line = [];
  for (let col = 0; col < cols; col += 1) {
    const colour = sampleCell(col, row);

    if (colour === null) {
      line.push(null);
      continue;
    }

    let index = palette.findIndex((p) => distance(p, colour) < 30);
    if (index === -1) index = palette.push(colour) - 1;
    line.push(index);
  }
  grid.push(line);
}

// What colour a whole cell should be. Taking the centre pixel works for art
// drawn on a grid, but on a soft image it lands on whatever the antialiasing
// happened to put there. Voting across the block picks the colour that actually
// covers the cell, and a cell that is mostly paper stays empty.
function sampleCell(col, row) {
  const x0 = Math.floor(minX + col * cell);
  const y0 = Math.floor(minY + row * cell);
  const x1 = Math.min(Math.ceil(x0 + cell), width);
  const y1 = Math.min(Math.ceil(y0 + cell), height);

  const votes = new Map();
  let empty = 0;
  let total = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += 1;
      const c = at(x, y);
      if (isBackground(c)) {
        empty += 1;
        continue;
      }
      const key = `${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}`;
      const entry = votes.get(key);
      if (entry) entry.n += 1;
      else votes.set(key, { n: 1, colour: c });
    }
  }

  if (!votes.size || empty > total * 0.6) return null;
  return [...votes.values()].sort((a, b) => b.n - a.n)[0].colour;
}

// The mask lenses are white and so is the paper behind him, so sampling alone
// reads them as background and punches a hole through his face. Anything the
// border cannot reach is enclosed by his outline, which means it is part of
// him, so it becomes an eye rather than a gap.
fillEnclosed();

function fillEnclosed() {
  const h = grid.length;
  const w = grid[0].length;

  const outside = new Set();
  const queue = [];
  for (let r = 0; r < h; r += 1) queue.push([r, 0], [r, w - 1]);
  for (let c = 0; c < w; c += 1) queue.push([0, c], [h - 1, c]);

  while (queue.length) {
    const [r, c] = queue.pop();
    if (r < 0 || r >= h || c < 0 || c >= w) continue;
    const key = `${r},${c}`;
    if (outside.has(key) || grid[r][c] !== null) continue;
    outside.add(key);
    queue.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }

  // Darkest colour in the palette. In this art that is the outline.
  const luma = (p) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;
  const darkest = palette.reduce((best, p, i) => (luma(p) < luma(palette[best]) ? i : best), 0);

  const eye = palette.push([252, 252, 255]) - 1;
  const done = new Set();
  let filled = 0;

  for (let r0 = 0; r0 < h; r0 += 1) {
    for (let c0 = 0; c0 < w; c0 += 1) {
      if (grid[r0][c0] !== null || outside.has(`${r0},${c0}`) || done.has(`${r0},${c0}`)) continue;

      // Walk this pocket and note what it touches.
      const cells = [];
      const border = [];
      const stack = [[r0, c0]];

      while (stack.length) {
        const [r, c] = stack.pop();
        if (r < 0 || r >= h || c < 0 || c >= w) continue;
        const key = `${r},${c}`;
        if (done.has(key)) continue;

        if (grid[r][c] !== null) {
          border.push(grid[r][c]);
          continue;
        }

        done.add(key);
        cells.push([r, c]);
        stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
      }

      // A lens is a pocket ringed in outline black. A gap between an arm and
      // the body is also enclosed, but it is ringed in whatever colour that
      // limb is, and it should stay open so the sky shows through. Filling
      // every pocket puts white blobs all over his legs.
      const dark = border.filter((i) => i === darkest).length;
      if (border.length && dark / border.length >= 0.6) {
        for (const [r, c] of cells) grid[r][c] = eye;
        filled += cells.length;
      }
    }
  }

  if (filled) console.log(`# filled ${filled} cells as eye white`);
}

// Lossy compression invents dozens of near duplicate colours, so keep only the
// ones that actually cover ground and snap everything else to the nearest of
// those. The real art only ever had a handful.
const keep = Number(process.argv[3]) || 7;

const frequency = new Map();
for (const line of grid) {
  for (const value of line) {
    if (value !== null) frequency.set(value, (frequency.get(value) || 0) + 1);
  }
}

const kept = [...frequency.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, keep)
  .map(([index]) => index);

const remap = new Map();
for (const [index] of frequency) {
  let best = kept[0];
  let bestDistance = Infinity;
  for (const candidate of kept) {
    const d = distance(palette[index], palette[candidate]);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  remap.set(index, kept.indexOf(best));
}

// One character each, so a row is exactly as wide as the grid.
const SYMBOLS = 'abcdefghij';

console.log('\n# palette');
kept.forEach((index, i) => console.log(`#   ${SYMBOLS[i]}  ${hex(palette[index])}`));

console.log('\n# grid, one character per cell, . is empty');
for (const line of grid) {
  console.log(`  '${line.map((v) => (v === null ? '.' : SYMBOLS[remap.get(v)])).join('')}',`);
}

// How many screen pixels one art pixel became.
//
// The obvious answer is the greatest common divisor of every run of identical
// colour, but one stray pixel of compression noise drags that straight to 1.
// The most common run length is the same number and does not care about noise,
// because the artefacts are rare and the real cells are everywhere.
function gcdOfRuns() {
  const counts = new Map();

  const tally = (a, b, alongRow) => {
    let start = a;
    let previous = alongRow ? at(a, b) : at(b, a);

    for (let i = a + 1; i <= (alongRow ? maxX : maxY) + 1; i += 1) {
      const inside = i <= (alongRow ? maxX : maxY);
      const colour = inside ? (alongRow ? at(i, b) : at(b, i)) : null;
      if (colour && distance(colour, previous) < MERGE) continue;

      const run = i - start;
      if (run > 1) counts.set(run, (counts.get(run) || 0) + 1);
      start = i;
      previous = colour;
    }
  };

  for (let y = minY; y <= maxY; y += 3) tally(minX, y, true);
  for (let x = minX; x <= maxX; x += 3) tally(minY, x, false);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : 1;
}

function distance(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function hex(c) {
  return `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

