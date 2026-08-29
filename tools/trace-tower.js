// One tower, rendered beside the tower it was traced from.
//
// The reference sheet is drawn at two image pixels per art pixel, so this draws
// the generated tower at the same two, crops the reference to the same height,
// and lays them side by side. Anything that does not line up at that scale is a
// real difference in the art rather than a difference in how it was displayed,
// which is the only way to tell whether a trace actually landed.
//
//   node tools/trace-tower.js out.png [metresWide] [metresTall] [shape] [#face] [time]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { decodePng, encodePng } from './png.js';
import { buildFacade, facadePalette } from '../src/render/pixel/facade.js';
import { CELL, cells } from '../src/render/pixel/grid.js';
import { setTimeOfDay } from '../src/world/daylight.js';
import { mulberry32 } from '../src/world/random.js';

const [out = 'tower.png', wide = '35', tall = '134', shape = 'slab', face = '#b9bfcf', time = 'day'] = process.argv.slice(2);

// The reference sheet is a daytime picture, so compare against daylight unless
// asked otherwise. The module defaults to evening, which is the right default
// for the game and the wrong one for a trace.
setTimeOfDay(time);

const COLS = cells(Number(wide));
const ROWS = cells(Number(tall));
const SCALE = 2; // image pixels per art pixel, to match the reference sheet
const SKY = [0x58, 0x58, 0x58]; // the reference sheet's own background

const grid = buildFacade({ cols: COLS, rows: ROWS, kind: 'tower', shape, rng: mulberry32(11) });
const palette = facadePalette(face);
const rgb = Object.fromEntries(
  Object.entries(palette).map(([key, hex]) => [key, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]),
);

// The reference, if it has been converted to a PNG next to the JPEG. Optional,
// so the tool still works as a plain renderer when it has not. The converted
// file is not kept in the repository, because it is derived and because the
// sheet it comes from is somebody else's picture. To put it back:
//
//   sips -s format png "game references/individ_skyscraps.jpeg" \
//     --out "game references/individ_skyscraps.png"
const REFERENCE = new URL('../game references/individ_skyscraps.png', import.meta.url);
const REF_BOX = { x: 762, y: 15, w: 250, h: 680 }; // the tall tower on the sheet
const ref = existsSync(REFERENCE) ? decodePng(readFileSync(REFERENCE)) : null;

const mine = { w: COLS * SCALE, h: ROWS * SCALE };
const refW = ref ? REF_BOX.w : 0;
const width = mine.w + 24 + refW;
const height = Math.max(mine.h, ref ? REF_BOX.h : 0) + 16;
const pixels = Buffer.alloc(width * height * 3);

const put = (x, y, c) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = (y * width + x) * 3;
  pixels[at] = c[0];
  pixels[at + 1] = c[1];
  pixels[at + 2] = c[2];
};

for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, SKY);

for (let y = 0; y < mine.h; y += 1) {
  for (let x = 0; x < mine.w; x += 1) {
    const key = grid[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    if (key === '.') continue;
    put(x + 8, y + 8, rgb[key]);
  }
}

if (ref) {
  for (let y = 0; y < REF_BOX.h; y += 1) {
    for (let x = 0; x < REF_BOX.w; x += 1) {
      const i = ((REF_BOX.y + y) * ref.width + REF_BOX.x + x) * 4;
      put(mine.w + 16 + x, y + 8, [ref.pixels[i], ref.pixels[i + 1], ref.pixels[i + 2]]);
    }
  }
}

writeFileSync(out, encodePng(width, height, pixels));
console.log(
  `${out}  mine ${COLS} by ${ROWS} cells at ${CELL} m, ` +
    `${(COLS * CELL).toFixed(1)} by ${(ROWS * CELL).toFixed(1)} m` +
    (ref ? `  reference alongside` : `  (no reference png)`),
);
