// Renders every sprite in the city onto one sheet, no browser involved.
//
// The point is not a pretty picture. Everything is drawn on one ground line at
// one scale with a metre ruler beside it, so size mistakes have nowhere to
// hide: if a hydrant comes out as tall as a bench, or a tree overtops a six
// storey block, you see it here rather than finding it in the game later.
//
//   node tools/render-sheet.js out.png [scale] [what]
//
// `what` is one of buildings, props, all.

import { writeFileSync } from 'node:fs';

import { encodePng } from './png.js';
import { CELL, cells } from '../src/render/pixel/grid.js';
import { buildFacade, facadePalette } from '../src/render/pixel/facade.js';
import { buildProp, PROP_COLOURS, PROP_KINDS, PROP_SIZES } from '../src/render/pixel/props.js';
import { mulberry32 } from '../src/world/random.js';

const [out = 'sheet.png', scaleArg = '3', what = 'all'] = process.argv.slice(2);
const SCALE = Number(scaleArg);

const SKY = '#8e86a8';
const GROUND = '#3a3341';
const PAVEMENT = '#cbb49a';
const RULER = '#f2ead6';
const RULER_TEN = '#ffbe6a';

const GAP = cells(1.6); // cells of air between sprites
const SKY_ABOVE = cells(3);
const BELOW = cells(2.5);

// Real buildings at real sizes, widest first so the sheet reads left to right.
const BUILDINGS = [
  { kind: 'tower', shape: 'spire', metres: [24, 152], face: '#4f7fa8', seed: 21 },
  { kind: 'tower', shape: 'deco', metres: [28, 128], face: '#b06a3c', seed: 13 },
  { kind: 'tower', shape: 'setback', metres: [26, 118], face: '#5b81a4', seed: 3 },
  { kind: 'tower', shape: 'chamfer', metres: [22, 100], face: '#3f8078', seed: 17 },
  { kind: 'tower', shape: 'slab', metres: [21, 86], face: '#6b5a7a', seed: 11 },
  { kind: 'block', metres: [19, 34], face: '#ab453d', seed: 5, texture: 'brick' },
  { kind: 'block', metres: [15, 24], face: '#8a6a45', seed: 9, texture: 'brick', escape: false },
  { kind: 'townhouse', metres: [7.5, 14], face: '#41837a', seed: 2, floors: 3 },
  { kind: 'shop', metres: [9.2, 13.2], face: '#cfae72', seed: 7 },
  { kind: 'shop', metres: [8, 11], face: '#c4633c', seed: 4, texture: 'brick' },
];

const sprites = [];

if (what !== 'props') {
  for (const spec of BUILDINGS) {
    const cols = cells(spec.metres[0]);
    const rows = cells(spec.metres[1]);
    sprites.push({
      grid: buildFacade({ ...spec, cols, rows, rng: mulberry32(spec.seed) }),
      palette: facadePalette(spec.face),
      metres: spec.metres,
    });
  }
}

if (what !== 'buildings') {
  PROP_KINDS.forEach((kind, i) => {
    const size = PROP_SIZES[kind];
    sprites.push({
      grid: buildProp(kind, mulberry32(kind.length * 31 + i)),
      palette: PROP_COLOURS,
      metres: [size.spread, size.height],
    });
  });
}

const tallest = Math.max(...sprites.map((s) => s.grid.length));
const RULER_WIDTH = cells(1.2);

const cols = RULER_WIDTH + GAP + sprites.reduce((sum, s) => sum + s.grid[0].length + GAP, 0);
const rows = SKY_ABOVE + tallest + BELOW;

const width = cols * SCALE;
const height = rows * SCALE;
const pixels = Buffer.alloc(width * height * 3);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const groundRow = SKY_ABOVE + tallest;

// Paint one cell of the sheet, scaled up.
function put(col, row, colour) {
  if (col < 0 || col >= cols || row < 0 || row >= rows) return;
  for (let y = row * SCALE; y < (row + 1) * SCALE; y += 1) {
    for (let x = col * SCALE; x < (col + 1) * SCALE; x += 1) {
      const at = (y * width + x) * 3;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
    }
  }
}

// Sky, pavement, road.
for (let row = 0; row < rows; row += 1) {
  const band = row < groundRow ? SKY : row < groundRow + cells(1.2) ? PAVEMENT : GROUND;
  const colour = rgb(band);
  for (let col = 0; col < cols; col += 1) put(col, row, colour);
}

// The ruler: a tick every metre, a long bright one every ten.
const tickShort = rgb(RULER);
const tickLong = rgb(RULER_TEN);
for (let metre = 0; metre * cells(1) < tallest + cells(2); metre += 1) {
  const row = groundRow - cells(metre);
  const long = metre % 10 === 0;
  const colour = long ? tickLong : tickShort;
  const length = long ? RULER_WIDTH : Math.round(RULER_WIDTH / 2);
  for (let i = 0; i < length; i += 1) put(i, row, colour);
}

// Every sprite stood on the ground line.
let col = RULER_WIDTH + GAP;
for (const sprite of sprites) {
  const w = sprite.grid[0].length;
  const top = groundRow - sprite.grid.length;

  sprite.grid.forEach((line, row) => {
    [...line].forEach((key, i) => {
      if (key === '.') return;
      put(col + i, top + row, rgb(sprite.palette[key] || '#ff00ff'));
    });
  });

  col += w + GAP;
}

writeFileSync(out, encodePng(width, height, pixels));
console.log(
  `${out}  ${width} by ${height} px, ${sprites.length} sprites at ${CELL} m per cell, drawn ${SCALE}x\n` +
    sprites.map((s) => `  ${s.metres[0]} x ${s.metres[1]} m  ->  ${s.grid[0].length} x ${s.grid.length} cells`).join('\n'),
);
