// Renders a facade grid straight to a PNG, no browser involved.
//
// The grid is pure data, so the picture can be produced and looked at from a
// script. That matters more than convenience: it means the art can be checked
// the same way the physics is, and a change to the builder shows up as a file
// you can open rather than something you have to go and click at.
//
//   node tools/render-facade.js out.png [cols] [rows] [scale] [#face]

import { writeFileSync } from 'node:fs';

import { encodePng } from './png.js';
import { buildFacade, facadePalette, CELL } from '../src/render/pixel/facade.js';
import { mulberry32 } from '../src/world/random.js';

const [out = 'facade.png', cols = 46, rows = 66, scale = 8, face = '#cfae72'] = process.argv.slice(2);
const COLS = Number(cols);
const ROWS = Number(rows);
const SCALE = Number(scale);

const MARGIN = 3; // cells of sky around the building
const SKY = [0x8e, 0x86, 0xa8];
const GROUND = [0x2f, 0x25, 0x38];

const grid = buildFacade({
  cols: COLS,
  rows: ROWS,
  floors: Math.max(Math.round((ROWS - 12) / 26), 1),
  shopfront: true,
  rng: mulberry32(7),
});

const palette = facadePalette(face);
const rgb = Object.fromEntries(
  Object.entries(palette).map(([key, hex]) => [key, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]),
);

const width = (COLS + MARGIN * 2) * SCALE;
const height = (ROWS + MARGIN * 2) * SCALE;
const pixels = Buffer.alloc(width * height * 3);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const col = Math.floor(x / SCALE) - MARGIN;
    const row = Math.floor(y / SCALE) - MARGIN;

    const inside = col >= 0 && col < COLS && row >= 0 && row < ROWS;
    // Sky above the pavement line, road below it, so the building has somewhere
    // to stand instead of floating on a flat backdrop.
    const colour = inside ? rgb[grid[row][col]] : row >= ROWS ? GROUND : SKY;

    const at = (y * width + x) * 3;
    pixels[at] = colour[0];
    pixels[at + 1] = colour[1];
    pixels[at + 2] = colour[2];
  }
}

writeFileSync(out, encodePng(width, height, pixels));
console.log(
  `${out}  ${COLS} by ${ROWS} cells at ${CELL} m each, ` +
    `${(COLS * CELL).toFixed(1)} by ${(ROWS * CELL).toFixed(1)} metres, drawn ${SCALE}x`,
);
