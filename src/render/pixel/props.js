// Everything on the pavement, drawn on the same grid as the buildings.
//
// Sizes here are real. A door is 2.1 metres, so a fire hydrant is 0.8 and comes
// out four cells tall, and a plane tree is nine metres and comes out forty
// five. That is not pedantry: it is the only thing that makes a street read as
// a street rather than as a row of icons at whatever size looked nice. Get one
// of them wrong and the eye finds it immediately, because everybody already
// knows how tall a door is.
//
// Two things a fifth of a metre apart land on the same number of cells, which
// is worth knowing before you spend an hour wondering why a bin and a hydrant
// came out identical. Where that matters the sizes are set apart deliberately.
//
// None of this is ever webbable. Anchors belong to rooftops of real buildings,
// and a lamp post is scenery however tall the art makes it look.

import { createGrid, CLEAR, cells } from './grid.js';
import { timeOfDay, underLight } from '../../world/daylight.js';

// One palette for the whole pavement, so a bench and a bin are lit the same
// way. Wider than the eight a facade gets, because a street has leaves and
// signal lenses in it and neither can be mixed from a wall colour.
const BASE_COLOURS = {
  a: '#191219', // outline
  b: '#33253a', // ironwork in shadow
  c: '#4e3a52', // ironwork lit
  d: '#2b5436', // leaf, shaded
  e: '#3a7043', // leaf
  f: '#579a52', // leaf, lit
  g: '#43301f', // bark, shaded
  h: '#61452c', // bark, lit
  i: '#c0392f', // signal red, hydrants, stop signs
  j: '#e8b13c', // signal amber, housings
  k: '#4fae5a', // signal green
  l: '#ffd68f', // lamplight
  m: '#f2ead6', // white paint and lettering
  n: '#55688a', // glass
  o: '#8a5a3c', // timber
};

// The same colours put under whatever light is on. A bench and a bin have to
// go dark at night alongside the buildings behind them, and washing one fixed
// palette is far less to keep in step than writing out three.
export function propPalette(time = timeOfDay()) {
  const out = {};
  for (const [key, hex] of Object.entries(BASE_COLOURS)) out[key] = underLight(hex, time);
  // Lamplight is a light source rather than a lit surface, so it keeps its own
  // colour and only dims when the lamps are off.
  out.l = time.lampGlow > 0.4 ? BASE_COLOURS.l : underLight(BASE_COLOURS.l, time);
  return out;
}

// Kept for the offline sheet renderer, which has no notion of a time of day.
export const PROP_COLOURS = BASE_COLOURS;

// Real dimensions, in metres. Everything else in this file is derived from
// these, so changing a size here changes the sprite and nothing else.
export const PROP_SIZES = {
  plane: { height: 9, spread: 5.5 },
  oak: { height: 11.5, spread: 7.5 },
  conifer: { height: 12, spread: 4.4 },
  sapling: { height: 5, spread: 2.6 },
  lamp: { height: 8, spread: 1.6 },
  signal: { height: 4.5, spread: 1 },
  stop: { height: 2.6, spread: 0.9 },
  hydrant: { height: 0.8, spread: 0.6 },
  bench: { height: 0.85, spread: 1.8 },
  bin: { height: 1.1, spread: 0.6 },
  postbox: { height: 1.4, spread: 0.6 },
  busStop: { height: 2.4, spread: 4 },
  car: { height: 1.5, spread: 4.4 },
};

export function buildProp(kind, rng = () => 0.5) {
  const size = PROP_SIZES[kind];
  if (!size) throw new Error(`no such prop ${kind}`);

  const g = createGrid(cells(size.spread) + 4, cells(size.height) + 2, CLEAR);
  const draw = BUILDERS[kind];
  draw(g, rng);
  g.outline('a');

  return g.done();
}

export const PROP_KINDS = Object.keys(PROP_SIZES);

// ---------------------------------------------------------------- trees

// A canopy is a handful of overlapping discs, not one circle. One circle reads
// as a lollipop; a clump of them reads as foliage, and the stepping along the
// edge falls out of the rasterisation in exactly the right places.
function crown(g, cx, top, bottom, halfWidth, rng) {
  const height = bottom - top;
  const blobs = 6;

  for (let i = 0; i < blobs; i += 1) {
    const t = i / (blobs - 1);
    // Widest a little below the middle, the way a real crown sits.
    const spread = Math.sin(Math.PI * (0.2 + t * 0.72));
    g.disc(
      cx + (rng() - 0.5) * halfWidth * 0.7,
      top + height * (0.15 + t * 0.72),
      Math.max(halfWidth * spread * 0.62, 2),
      'e',
    );
  }

  shadeLeaves(g, cx, top + height * 0.35);
}

// Light from the upper left, same as the sun in the sky and the shadow on every
// facade. Done as a second pass over whatever is already leaf coloured, so it
// works whatever shape the canopy came out.
function shadeLeaves(g, cx, cy) {
  for (let y = 0; y < g.rows; y += 1) {
    for (let x = 0; x < g.cols; x += 1) {
      if (g.at(x, y) !== 'e') continue;
      const lit = (cx - x) * 0.6 + (cy - y);
      if (lit > 3) g.set(x, y, 'f');
      else if (lit < -4) g.set(x, y, 'd');
    }
  }
}

function trunk(g, cx, top, bottom, width) {
  g.fill(cx - Math.floor(width / 2), top, width, bottom - top, 'g');
  g.fill(cx - Math.floor(width / 2), top, Math.max(Math.round(width * 0.4), 1), bottom - top, 'h');
}

// `stem` is the clear trunk under the crown, as a fraction of the whole tree.
// A street tree carries about a third, which is what the first version got
// backwards: it read the number as the crown and produced a lollipop on a pole.
function broadleaf(size) {
  return (g, rng) => {
    const cx = Math.floor(g.cols / 2);
    const bottom = g.rows - 1;
    const crownBottom = Math.round(g.rows * (1 - size.stem));

    trunk(g, cx, Math.round(g.rows * 0.42), bottom, cells(size.girth));
    crown(g, cx, 1, crownBottom, (g.cols - 4) / 2, rng);
  };
}

// Stacked skirts, each one jutting out past the one above. Straight off the
// evergreen on the corner in the reference.
function conifer(g, rng) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const trunkTop = Math.round(g.rows * 0.82);

  trunk(g, cx, trunkTop, bottom, cells(0.5));

  const tiers = 5;
  const top = 1;
  const span = trunkTop + 2 - top;

  for (let i = 0; i < tiers; i += 1) {
    const t = (i + 1) / tiers;
    const half = Math.max(((g.cols - 4) / 2) * (0.32 + t * 0.68), 2);
    const y = top + Math.round(span * (i / tiers));
    const h = Math.round(span / tiers) + 3;

    // A skirt is a stack of runs that widen going down, then a flat underside.
    for (let row = 0; row < h; row += 1) {
      const width = Math.round(half * 2 * (0.35 + 0.65 * (row / h)));
      g.fill(cx - Math.floor(width / 2), y + row, width, 1, 'e');
    }
  }

  shadeLeaves(g, cx, g.rows * 0.4);
}

// ---------------------------------------------------------------- ironwork

// Eight metres to the lantern, which is what a main road actually carries.
function lamp(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const post = cells(0.22);

  g.fill(cx - 1, cells(1.1), post, bottom - cells(1.1), 'b');
  g.fill(cx - 1, cells(1.1), 1, bottom - cells(1.1), 'c'); // lit edge
  g.fill(cx - 3, bottom - cells(0.5), post + 4, cells(0.5), 'b'); // the base

  // A swan neck out to the lantern, drawn as a short stair rather than a curve.
  for (let i = 0; i < 4; i += 1) g.fill(cx - 1 + i, cells(0.9) - i, 2, 2, 'b');

  const head = cx + 3;
  g.fill(head - 2, cells(0.3), cells(0.9), 2, 'b');
  g.fill(head - 2, cells(0.3) + 2, cells(0.9), 2, 'l'); // the light itself
}

// A three lens head on a post. The lenses are one cell each, which is what a
// three hundred millimetre lens comes to, and they still read at a distance
// because nothing else in the street is that colour.
function signal(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;

  g.fill(cx - 1, cells(1.3), 2, bottom - cells(1.3), 'b');
  g.fill(cx - 3, bottom - cells(0.4), 6, cells(0.4), 'b');

  const w = cells(0.45);
  const h = cells(1.2);
  const x = cx - Math.floor(w / 2);

  g.fill(x, 1, w, h, 'j'); // the housing
  g.fill(x, 1, w, 1, 'c'); // its hood

  ['i', 'j', 'k'].forEach((lens, i) => {
    g.fill(x + 1, 3 + i * Math.floor((h - 3) / 3), Math.max(w - 2, 1), 1, lens);
  });
}

// An octagon, at the size the plate actually is. Nine hundred millimetres comes
// to five cells, so the chamfers are one cell each and that is the whole shape.
function stop(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;

  g.fill(cx, cells(0.9), 1, bottom - cells(0.9), 'c'); // the post

  const size = cells(0.9);
  const x = cx - Math.floor(size / 2);

  g.fill(x, 0, size, size, 'i');
  // Knock the corners off to make it an octagon rather than a square.
  const chamfer = Math.max(Math.round(size / 4), 1);
  for (let i = 0; i < chamfer; i += 1) {
    for (let j = 0; j < chamfer - i; j += 1) {
      g.set(x + j, i, CLEAR);
      g.set(x + size - 1 - j, i, CLEAR);
      g.set(x + j, size - 1 - i, CLEAR);
      g.set(x + size - 1 - j, size - 1 - i, CLEAR);
    }
  }

  // The word, suggested rather than written. At five cells across a letter
  // would be a single pixel, so this is a bar and everyone reads it as STOP.
  g.fill(x + 1, Math.floor(size / 2), size - 2, 1, 'm');
}

function hydrant(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;

  g.fill(cx - 1, 2, 3, bottom - 2, 'i');
  g.fill(cx - 1, 2, 1, bottom - 2, 'j'); // lit edge
  g.fill(cx - 2, 3, 5, 1, 'i'); // the side outlets
  g.fill(cx - 1, 0, 3, 2, 'i'); // the bonnet
}

// Slatted, on cast iron ends. Eight hundred and fifty millimetres to the top of
// the back, which at this cell size is six rows, so every element gets exactly
// one row and the gaps between them have to be part of the design.
function bench(g) {
  const bottom = g.rows - 1;
  const w = g.cols - 4;
  const x = 2;

  // The ends, which carry the whole thing and read even in silhouette.
  g.fill(x, 1, 1, bottom, 'b');
  g.fill(x + w - 1, 1, 1, bottom, 'b');
  g.fill(x, bottom - 1, 2, 2, 'b');
  g.fill(x + w - 2, bottom - 1, 2, 2, 'b');

  g.fill(x + 1, 1, w - 2, 1, 'o'); // top rail of the back
  g.fill(x + 1, 3, w - 2, 1, 'o'); // lower rail, with daylight between them
  g.fill(x, bottom - 2, w, 1, 'o'); // the seat
  g.fill(x + 1, bottom - 1, w - 2, 1, 'b'); // shadow under it
}

function bin(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const w = cells(0.55);
  const x = cx - Math.floor(w / 2);

  g.fill(x, 2, w, bottom - 2, 'c');
  g.fill(x, 1, w + 1, 2, 'b'); // the lid, overhanging a touch
  for (let i = 1; i < w; i += 2) g.fill(x + i, 4, 1, bottom - 5, 'b'); // slats
}

function postbox(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const w = cells(0.55);
  const x = cx - Math.floor(w / 2);

  g.fill(x, 2, w, bottom - 2, 'i');
  g.fill(x, 1, w, 2, 'i');
  g.fill(x, 1, 1, bottom - 1, 'j'); // lit edge
  g.fill(x + 1, 4, w - 2, 1, 'a'); // the slot
}

// A pole, a flag, and a shelter with a bench in it.
function busStop(g) {
  const bottom = g.rows - 1;
  const roof = 1;
  const w = g.cols - 4;

  g.fill(2, roof, w, 2, 'c'); // the roof
  g.fill(2, roof + 2, 1, bottom - roof - 2, 'b'); // the back and the upright
  g.fill(2 + w - 1, roof + 2, 1, bottom - roof - 2, 'b');
  g.fill(3, roof + 3, w - 3, bottom - roof - 6, 'n'); // the glass back
  g.fill(4, bottom - 3, w - 5, 1, 'o'); // the bench inside

  // The flag on the end, so you can tell it from a shop canopy.
  g.fill(2 + w - 1, roof - 1, 3, cells(0.5), 'i');
}

// Parked at the kerb. Four point four metres, which is a normal car, and it is
// the object that most quickly tells you how big everything else is.
// Parked at the kerb. Four point four metres, which is a normal car, and it is
// the object that most quickly tells you how big everything else is.
//
// At ten rows tall every band gets one or two of them, so the order matters
// more than the detail: wheels on the ground, body above the axle line, cabin
// set in from both ends. Get that stack right and it reads as a car even at
// two screen pixels per cell.
function car(g, rng) {
  const bottom = g.rows - 1;
  const w = g.cols - 4;
  const x = 2;
  const body = rng() < 0.5 ? 'i' : 'n';

  const wheel = cells(0.62);
  const axle = bottom - Math.floor(wheel / 2);
  const sill = axle - 1; // where the bodywork stops and the wheels show
  const waist = Math.max(Math.round(g.rows * 0.44), 3);
  const roof = 1;

  // Cabin first, set well in from both ends so there is a bonnet and a boot.
  const cabX = x + Math.round(w * 0.26);
  const cabW = Math.round(w * 0.44);
  g.fill(cabX, roof, cabW, waist - roof + 1, body);
  g.fill(cabX + 1, roof + 1, cabW - 2, waist - roof - 1, 'n'); // glass
  g.fill(cabX + Math.round(cabW / 2), roof + 1, 1, waist - roof - 1, body); // the pillar

  // Body along the whole length, sitting on the axle line.
  g.fill(x, waist, w, sill - waist + 1, body);
  g.fill(x, sill, w, 1, 'b'); // the sill, in shadow

  // Wheels, on the ground rather than floating above it.
  g.disc(x + Math.round(w * 0.22), axle, wheel / 2, 'a');
  g.disc(x + Math.round(w * 0.78), axle, wheel / 2, 'a');

  g.fill(x, waist + 1, 1, 2, 'l'); // headlight
  g.fill(x + w - 1, waist + 1, 1, 2, 'i'); // tail light
}

const BUILDERS = {
  plane: broadleaf({ stem: 0.3, girth: 0.42 }),
  oak: broadleaf({ stem: 0.26, girth: 0.55 }),
  sapling: broadleaf({ stem: 0.34, girth: 0.22 }),
  conifer,
  lamp,
  signal,
  stop,
  hydrant,
  bench,
  bin,
  postbox,
  busStop,
  car,
};
