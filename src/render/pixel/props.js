// Everything on the pavement, drawn on the same grid as the buildings.
//
// Sizes here are real. A door is 2.1 metres, so a fire hydrant is 0.8 and comes
// out two cells tall, and a plane tree is nine metres and comes out twenty two.
// That is not pedantry: it is the only thing that makes a street read as a
// street rather than as a row of icons at whatever size looked nice. Get one of
// them wrong and the eye finds it immediately, because everybody already knows
// how tall a door is.
//
// Two things half a metre apart land on the same number of cells, which is
// worth knowing before you spend an hour wondering why a bin and a hydrant came
// out identical. Where that matters the sizes are set apart deliberately.
//
// Everything under about two metres is drawn cell by cell rather than by
// scaling a bigger drawing down. A hydrant gets two rows and a bench gets two,
// and the only way that works is to decide what each row is for. Formulas that
// take a fraction of the height were what these used to be, and they came out
// as smudges the moment the grid got coarse enough to be worth looking at.
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
  // A big one, and deliberately so. A car is a long low object, so its height
  // is the thing that under reads next to a figure drawn four times life: at a
  // saloon's 1.5 m it came out barely a third of him. Two point two by five is a
  // full size pickup, which is an honest vehicle and half his height drawn.
  car: { height: 2.2, spread: 5 },
};

// Drawn bigger than life, the same way the hero is and for the same reason.
//
// The figure is a 1.8 m man rendered at 4.4 times life, because at any zoom that
// still frames a hundred metre tower a real one is a speck. Everything on the
// pavement was left at true scale, so a car came out a little over half his
// height and a traffic light barely a third: the two of them were in the same
// picture at different scales and it showed.
//
// Twice life, not the hero's four and a bit. His factor would make a car
// nineteen metres long, longer than the shop behind it is wide, which trades one
// scale mistake for a worse one. Twice puts a car at the length he is tall, a
// traffic light a little over his head, and a street tree at eighteen metres,
// which is what a plane tree is anyway.
//
// One factor for everything on the pavement, so the relationships inside the
// street are untouched: a bench is still the same fraction of a car as it was.
// Only the relationship to the buildings moves, and that one was already broken
// by the figure standing in front of them.
//
// The physics never sees this, and neither does PROP_SIZES. Real sizes stay real
// up there and this is applied once, on the way to being drawn.
export const STREET_SCALE = 2;

export function drawnSize(kind) {
  const size = PROP_SIZES[kind];
  return { spread: size.spread * STREET_SCALE, height: size.height * STREET_SCALE };
}

// Room around the drawing for the keyline, and for the branches of a tree that
// reach past its nominal spread.
//
// Counted in cells rather than metres on purpose, because that is what it is
// for, but that also means it grows in metres whenever a cell does. It was four
// cells when a cell was 0.2 m, which made a car a metre and a half longer than a
// car the moment cells doubled, so it is two now and the sprite is the size it
// says it is again.
const MARGIN = 2;
const INSET = MARGIN / 2; // cells of it on each side

export function buildProp(kind, rng = () => 0.5) {
  if (!PROP_SIZES[kind]) throw new Error(`no such prop ${kind}`);
  const size = drawnSize(kind);

  const g = createGrid(cells(size.spread) + MARGIN, cells(size.height) + 1, CLEAR);
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
    crown(g, cx, 1, crownBottom, (g.cols - MARGIN) / 2, rng);
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
    const half = Math.max(((g.cols - MARGIN) / 2) * (0.32 + t * 0.68), 2);
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
//
// The housing is written as five rows rather than derived from the height: hood,
// three lenses, foot. Working it out as a fraction put all three lenses on the
// same row once the head came down to three cells.
function signal(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const head = 7; // hood, three lenses with a row between them, and a foot

  g.fill(cx, head, 1, bottom - head, 'b'); // the post
  g.fill(cx - 1, bottom, 3, 1, 'b'); // its foot

  g.fill(cx - 1, 0, 3, head, 'b'); // the housing
  g.set(cx, 1, 'i');
  g.set(cx, 3, 'j');
  g.set(cx, 5, 'k');
}

// An octagon, at the size the plate actually is. Nine hundred millimetres is
// three cells now, and an octagon three cells across is a square with its four
// corners taken off, which is the entire shape and reads correctly.
function stop(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const size = 5;
  const x = cx - 2;

  g.fill(cx, size, 1, bottom - size + 1, 'c'); // the post

  g.fill(x, 0, size, size, 'i');
  for (const [dx, dy] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    g.set(x + dx, dy, CLEAR); // the chamfers, one cell each
  }

  // The word, suggested rather than written. At five cells across a letter
  // would be a fraction of a pixel, so this is a bar and everyone reads it.
  g.fill(x + 1, 2, size - 2, 1, 'm');
}

// A barrel with a bonnet on it and an outlet out each side, which is the whole
// of a hydrant at any size worth drawing one.
function hydrant(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const top = 1;

  g.fill(cx - 1, top, 3, bottom - top + 1, 'i'); // the barrel
  g.fill(cx - 2, top + 2, 5, 1, 'i'); // the side outlets
  g.fill(cx - 1, top, 1, bottom - top + 1, 'j'); // lit edge
  g.set(cx, top, 'j'); // and the top of the bonnet
}

// Slatted timber on cast iron ends. Eight hundred and fifty millimetres to the
// top of the back is two rows: one is the back, the other is the seat, and the
// legs are the two cells under them.
function bench(g) {
  const bottom = g.rows - 1;
  const w = g.cols - MARGIN;
  const x = INSET;

  g.fill(x, bottom - 3, w, 1, 'o'); // the top rail of the back
  g.fill(x, bottom - 2, w, 1, 'b'); // daylight between the rails, in shadow
  g.fill(x, bottom - 1, w, 1, 'o'); // the seat
  g.set(x, bottom, 'b'); // cast iron ends, in silhouette
  g.set(x + w - 1, bottom, 'b');
}

function bin(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const top = 1;

  g.fill(cx - 1, top + 1, 3, bottom - top, 'c');
  g.fill(cx - 1, top, 3, 1, 'b'); // the lid, overhanging a touch
  g.fill(cx, top + 2, 1, bottom - top - 2, 'b'); // the one slat there is room for
}

function postbox(g) {
  const cx = Math.floor(g.cols / 2);
  const bottom = g.rows - 1;
  const top = 1;

  g.fill(cx - 1, top, 3, bottom - top + 1, 'i');
  g.fill(cx - 1, top, 3, 1, 'j'); // the domed top, catching the light
  g.fill(cx - 1, top + 2, 3, 1, 'a'); // the slot
}

// A flag, a canopy, and a glazed back with a bench under it.
function busStop(g) {
  const bottom = g.rows - 1;
  const roof = 1;
  const w = g.cols - MARGIN;
  const x = INSET;

  g.fill(x, roof, w, 2, 'c'); // the canopy
  g.fill(x, roof, w, 1, 'b'); // and its front edge, in shadow

  const glassTop = roof + 3;
  const glassBottom = bottom - 2;
  g.fill(x + 1, glassTop, w - 2, glassBottom - glassTop, 'n'); // the glass back
  // Mullions, because one sheet of glass this size reads as a blue rectangle.
  for (let m = 4; m < w - 2; m += 4) g.fill(x + m, glassTop, 1, glassBottom - glassTop, 'b');

  g.fill(x, roof + 2, 1, bottom - roof - 2, 'b'); // the uprights
  g.fill(x + w - 1, roof + 2, 1, bottom - roof - 2, 'b');
  g.fill(x + 2, glassBottom, w - 4, 1, 'o'); // the bench inside

  // The flag on the end, so you can tell it from a shop canopy.
  g.fill(x + w - 1, roof - 1, 2, 1, 'i');
}

// Parked at the kerb, and the object that most quickly tells you how big
// everything else is.
//
// Five bands, in order from the top: roof, glass, body, sill, tyres. Each one is
// placed rather than taken as a fraction of the height, because fractions
// collapse two bands onto the same row the moment the sprite gets short and what
// is left is a coloured brick.
function car(g, rng) {
  const bottom = g.rows - 1;
  const w = g.cols - MARGIN;
  const x = INSET;
  const body = rng() < 0.5 ? 'i' : 'n';

  const roof = 1;
  const tyre = 2; // rows of it, standing proud of the sill
  const sill = bottom - tyre;

  const cabX = x + Math.round(w * 0.26);
  const cabW = Math.max(Math.round(w * 0.46), 3);
  const cabH = Math.max(Math.round((sill - roof) * 0.45), 2);

  g.fill(cabX, roof, cabW, cabH, body); // the cabin, set in for a bonnet and a boot
  g.fill(cabX + 1, roof + 1, cabW - 2, cabH - 1, 'n'); // its glass
  g.fill(cabX + Math.round(cabW / 2), roof + 1, 1, cabH - 1, body); // the pillar

  g.fill(x, roof + cabH, w, sill - roof - cabH + 1, body); // the body, the whole length
  g.fill(x, sill, w, 1, 'b'); // the sill, in shadow

  // Tyres, black and standing proud of the bodywork, with the underside of the
  // car painted in between them rather than left clear. The outline pass fills
  // any empty cell touching the body, so a clear gap comes back as the same near
  // black the tyres are and the whole bottom reads as one dark bar with no
  // wheels in it. Painting it a tone up is what lets the rubber read as rubber.
  g.fill(x + 1, sill + 1, w - 2, tyre, 'c');

  // Solid black, no hub. A lighter centre reads as a hole at this size, and
  // what makes a wheel a wheel here is being the darkest thing on the car.
  const wheel = Math.max(Math.round(w * 0.18), 3);
  for (const at of [x + Math.round(w * 0.14), x + w - wheel - Math.round(w * 0.14)]) {
    g.fill(at, sill + 1, wheel, tyre, 'a');
  }

  g.fill(x, roof + cabH, 1, 2, 'l'); // headlight
  g.fill(x + w - 1, roof + cabH, 1, 2, 'i'); // tail light
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
