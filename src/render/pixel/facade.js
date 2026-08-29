// Buildings, drawn as actual pixels.
//
// Everything in the city was being drawn as rectangles at whatever size the
// zoom happened to make them, which is a vector picture that merely uses square
// shapes. Pixel art is not that. Pixel art is a fixed grid of cells, where a
// cornice is three cells tall because someone chose three, an arch is a stack
// of hand written insets, and nothing is ever half a cell wide.
//
// So a facade is built the way the reference was built: as a grid of colour
// keys, one letter per cell, exactly like the hero's poses. The renderer's only
// job afterwards is to paint that grid at a whole number of screen pixels per
// cell. Same discipline as the sprite, so they finally belong to one drawing.
//
// Four kinds, and the difference between them is not decoration. A shop has
// arched windows and a fascia because it is nine metres wide and you read it
// from across the street. A tower has piers and setbacks because it is a
// hundred and twenty metres tall and you read it as a silhouette.

import { createGrid, CLEAR, CELL, cells } from './grid.js';
import { timeOfDay, mix, toRatio } from '../../world/daylight.js';

export { CELL, cells };

// Nine tones, six of them mixed from the building's own colour so every facade
// lights the same way, and three sheets of glass, because a window is the sky
// and a lamp rather than the wall.
//
// Both ends of the mix come from the time of day, which is what makes a whole
// city change hour without a single colour being written out three times.
export function facadePalette(face, time = timeOfDay()) {
  const dark = (amount) => mix(face, time.shadow, amount);
  const light = (amount) => mix(face, time.sunlight, amount);

  return {
    a: dark(0.84), // outline and the darkest lines
    b: dark(0.52), // joinery, recesses, the plinth
    c: dark(0.24), // the side the sun has left, spandrels
    d: mix(face, time.wash, time.washAmount * 0.5),
    e: light(0.44), // trim, sills, storey bands
    f: light(0.78), // cornice highlight
    // Both glass tones sit clearly darker than the trim, or a lit window turns
    // into a solid cream slab with no pane inside it at all.
    g: time.glass,
    h: time.litGlass,
    // The ninth. A curtain wall is a mirror, and the one thing that stops a
    // hundred metres of it reading as graph paper is the band of brighter sky
    // sliding diagonally across it.
    i: time.sheen,
    // Traced off the reference sheet. Its towers are a light body with *darker*
    // windows cut into it, which is the opposite polarity to a lit night tower
    // and the thing that makes them read as daytime concrete rather than as
    // glass with the lights on.
    //
    // Both numbers are measured. A window sits at 0.79 of the body's luminance
    // and the parapet at 1.11, and asking for a ratio rather than a fixed mix is
    // what keeps a rust tower as legible as a pale grey one: seventeen percent
    // of the way toward the shadow is a wide gap on pale concrete and almost
    // nothing on a colour that already sits near it.
    j: mix(toRatio(face, time.shadow, 0.79), time.wash, time.washAmount * 0.5),
    k: mix(toRatio(face, time.sunlight, 1.11), time.wash, time.washAmount * 0.5),
  };
}

// Real heights, in metres, so everything downstream stays honest about scale.
export const STOREY = {
  shopfront: 4.5,
  shop: 3.4,
  flat: 3.2,
  office: 3.8,
};

// Arch profiles, written out by hand per window width: how far to pull each row
// in from both sides, top row first. A circle rounded to whole cells puts the
// steps in the wrong places, and on something seven cells wide you can see it.
//
// Shallow on purpose. A profile that pulls in by three on a seven wide window
// comes out as a church spire, and the reference arches are barely more than a
// rounded corner sitting on a tall rectangle.
const ARCH = {
  5: [2, 1, 0],
  6: [2, 1, 0],
  7: [2, 1, 0],
  8: [3, 1, 0],
  9: [3, 2, 1, 0],
  10: [3, 2, 1, 0],
};

// A shop keeps its lights on later than an office and opens before one, so it
// never goes fully dark. Without this the terrace at noon is a row of blank
// windows and the street looks abandoned.
const shopLit = () => Math.max(timeOfDay().lit, 0.45);

// Written as metres rather than as a count of rows, which is what these used to
// be. A row count is a metre figure in disguise: five rows was a metre of
// cornice while a cell was 0.2 m, and the day the cell changed it silently
// became two metres of it and swallowed the top storey of every shop.
const CORNICE = cells(1); // a shop cap, including its dentils and its shadow
const PLINTH = cells(0.6); // stonework at street level
const COURSE = cells(1); // between the lines in brickwork
const JOINT = cells(0.6); // between two openings, and at the ends of a run

export function buildFacade(spec) {
  const kind = spec.kind || 'shop';

  if (kind === 'tower') return tower(spec);
  if (kind === 'block') return block(spec);
  if (kind === 'townhouse') return townhouse(spec);
  return shop(spec);
}

// ---------------------------------------------------------------- shopfronts

// Two storeys over a shop. The one you see from the pavement, so it carries the
// most detail of anything in the city.
function shop({ cols, rows, floors = 2, texture = 'render', rng = () => 0.5 }) {
  const g = createGrid(cols, rows, 'd');

  wall(g, texture);
  cornice(g);

  const top = CORNICE;
  const bottom = rows - PLINTH;
  // The shopfront is worth about a storey and a half, because a shop window is
  // a good deal taller than the ones over it.
  const storey = (bottom - top) / (floors + 1.45);

  for (let floor = 0; floor < floors; floor += 1) {
    const y = Math.round(top + storey * floor);
    const h = Math.round(top + storey * (floor + 1)) - y;
    upperStorey(g, y, h, rng);
  }

  shopfront(g, Math.round(top + storey * floors), bottom - Math.round(top + storey * floors), rng);
  plinth(g);
  edges(g);

  return g.done();
}

// Where the shopfront storey begins, counted in rows from the top.
//
// Exported because an awning hangs off the front of the building, past where
// the wall stops, so it cannot live in the grid and has to be painted over the
// top. Both sides reading the same function is what stops the canopy drifting a
// row or two off the fascia it is supposed to be fixed to.
export function shopfrontRow(rows, floors = 2) {
  const top = CORNICE;
  const bottom = rows - PLINTH;
  return Math.round(top + ((bottom - top) / (floors + 1.45)) * floors);
}

// A house rather than a shop. No fascia, no glazing bars, a front door up a
// couple of steps, and one more floor for the same frontage.
function townhouse({ cols, rows, floors = 3, texture = 'brick', rng = () => 0.5 }) {
  const g = createGrid(cols, rows, 'd');

  wall(g, texture);
  cornice(g);

  const top = CORNICE;
  const bottom = rows - PLINTH;
  const storey = (bottom - top) / floors;

  for (let floor = 0; floor < floors - 1; floor += 1) {
    const y = Math.round(top + storey * floor);
    upperStorey(g, y, Math.round(top + storey * (floor + 1)) - y, rng);
  }

  const groundTop = Math.round(top + storey * (floors - 1));
  groundFloor(g, groundTop, bottom - groundTop, rng);
  plinth(g);
  edges(g);

  return g.done();
}

// ---------------------------------------------------------------- mid rise

// Six to a dozen storeys of flats or offices. Flat cap, regular grid, and a
// fire escape zigzagging down one side, which is the detail that makes a plain
// block read as a city block rather than as a filing cabinet.
function block({ cols, rows, texture = 'brick', escape = true, rng = () => 0.5 }) {
  const g = createGrid(cols, rows, 'd');

  wall(g, texture);

  // A capping band rather than a moulded cornice. Anything fussier is invisible
  // at the height these stand at.
  g.fill(0, 0, cols, cells(0.8), 'e');
  g.fill(0, cells(0.8), cols, 1, 'b');

  const top = cells(1);
  const bottom = rows - PLINTH;
  const storey = cells(STOREY.flat);
  const groundHeight = cells(STOREY.shopfront);
  const floors = Math.max(Math.floor((bottom - top - groundHeight) / storey), 1);

  const winW = cells(1.2);
  const bays = layout(cols, winW);

  for (let floor = 0; floor < floors; floor += 1) {
    const y = top + storey * floor + cells(0.6);
    const h = storey - cells(1.4);
    if (h < 3) break;

    for (let i = 0; i < bays.count; i += 1) {
      const x = bays.start + i * (bays.width + bays.gap);
      window(g, x, y, bays.width, h, rng() < timeOfDay().lit, false);
    }
  }

  const groundTop = top + storey * floors;
  groundFloor(g, groundTop, bottom - groundTop, rng);
  if (escape && cols > cells(8)) fireEscape(g, top, groundTop, storey);
  plinth(g);
  edges(g);

  return g.done();
}

// A ladder and a landing at every floor, hung off the right hand bay. Drawn in
// the darkest tone because it is ironwork in silhouette against a lit wall.
function fireEscape(g, top, bottom, storey) {
  const x = g.cols - cells(3.4);
  const width = cells(2.6);

  for (let y = top + storey; y < bottom; y += storey) {
    g.fill(x, y, width, 1, 'a'); // the landing
    g.fill(x, y + 1, width, 1, 'b');
    // Balustrade, every other cell, so it reads as railings and not as a wall.
    for (let i = 0; i < width; i += 2) g.fill(x + i, y - 3, 1, 3, 'a');
    // The ladder down to the next one.
    g.fill(x + width - 3, y + 2, 1, storey - 2, 'a');
    g.fill(x + width - 1, y + 2, 1, storey - 2, 'a');
    for (let j = y + 3; j < y + storey; j += 3) g.fill(x + width - 3, j, 3, 1, 'a');
  }
}

// ---------------------------------------------------------------- towers

// Skyscrapers. Five silhouettes, because a skyline is read as a shape long
// before anyone counts the windows in it, and five flat topped slabs at
// different heights is a bar chart.
//
// The detail is layered rather than drawn once: silhouette, then curtain wall,
// then the corners the building turns, then the crown, then whatever is bolted
// to the roof. Each pass only overwrites what it should, so adding one never
// means going back and rearranging the others.
const SHAPES = ['setback', 'deco', 'spire', 'chamfer', 'slab'];

export { SHAPES };

// The flat surfaces on top of a building, in grid rows and columns.
//
// This exists because the towers grew setbacks, spires and cut corners while
// the anchors were still a straight line across the full width at full height.
// On a spire that put a web on thin air ten metres out from the stonework, and
// on a ziggurat it ignored five perfectly good terraces.
//
// A ledge is anywhere the silhouette gets wider as you go down. Reading it off
// the same `insetAt` the renderer draws with means the two can never disagree,
// which matters more here than anywhere else in the project: this is the one
// piece of art the physics actually touches.
export function roofLedges({ kind, shape, cols, rows }) {
  // Everything but a tower is a flat roof across its whole width.
  if (kind !== 'tower') return [{ row: 0, from: 0, to: cols }];

  const form = silhouette(shape, cols, rows);
  const top = form.insetAt(form.top);
  // The apex always counts, however narrow it is. A spire tapers to two cells
  // and produces no other flat surface at all, so without this the tallest
  // thing on the skyline would be the one building you cannot web.
  const ledges = [{ row: form.top, from: top, to: cols - top, apex: true }];

  // A step has to be deep enough to stand on. Without this the spire's smooth
  // taper reads as several hundred one cell ledges all the way down.
  const minimum = cells(1.2);

  // Inclusive of the podium roof, which is a step like any other and the lowest
  // thing on a tower worth webbing. Stopping one short of it, which is what the
  // exclusive bound used to do, threw away the only ledge under fifty metres on
  // every tower in the city.
  for (let y = form.top + 1; y <= form.podiumTop; y += 1) {
    const above = form.insetAt(y - 1);
    const here = form.insetAt(y);
    if (above - here < minimum) continue;

    ledges.push({ row: y, from: here, to: above });
    ledges.push({ row: y, from: cols - above, to: cols - here });
  }

  return ledges;
}

function tower({ cols, rows, shape = 'setback', rng = () => 0.5 }) {
  const g = createGrid(cols, rows, CLEAR);
  const form = silhouette(shape, cols, rows);

  for (let y = form.top; y < rows; y += 1) {
    const inset = form.insetAt(y);
    const width = cols - inset * 2;
    if (width >= 2) g.fill(inset, y, width, 1, 'd');
  }

  curtainWall(g, form, rng);
  returns(g, form);
  crown(g, form, rng);
  roofPlant(g, form, rng);
  podium(g, form, rng);
  // Not the near black keyline everything else gets. The reference's towers
  // have no outline at all, only a slightly darker edge where the wall turns,
  // and a black one round a pale grey tower is the single loudest thing on the
  // skyline. This still separates two buildings that touch, which is the only
  // job the outline actually has now the city is packed.
  g.outline('b');

  return g.done();
}

// How much to pull each row in from both sides. Everything about a tower's
// character lives in this one function.
// Every tower in the reference stands on a podium wider than its shaft: four or
// five storeys of stonework, a heavy cornice, and the tower set back off it.
// Getting this wrong is what made the old towers read as slabs dropped on the
// pavement, because a shaft that runs straight into the ground has no scale on
// it anywhere a person could stand.
const PODIUM = {
  height: 19, // metres of it, about five tall storeys
  setback: 2.2, // how far the shaft steps in off its edge, each side
};

function silhouette(shape, cols, rows) {
  // How far each setback pulls in. Deep enough to be a terrace somebody could
  // stand on rather than a moulding, because the anchors are read off this and
  // a ledge a metre and a half deep is not somewhere to put a web.
  const step = Math.max(cells(2.4), 2);
  const limit = Math.floor(cols / 2) - 3;
  const clamp = (inset) => Math.max(Math.min(inset, limit), 0);

  // Only on a tower tall enough that the podium is a base rather than most of
  // the building, and never so deep it eats the frontage on a narrow plot.
  const podiumTop = rows - Math.min(cells(PODIUM.height), Math.round(rows * 0.3));
  const setback = rows > cells(60) ? clamp(cells(PODIUM.setback)) : 0;

  // Every inset is measured against the shaft, then the podium below it opens
  // back out to the full plot. Wrapping it here rather than writing it into all
  // five shapes is what keeps them each about their own silhouette.
  //
  // The podium's own top row counts as podium, not as shaft. That is the row the
  // roof of it is, so getting it the other way round left the widest step on the
  // building drawn but invisible to the ledge finder, and every tower's lowest
  // anchor stayed up at the crown.
  const onPodium = (insetAt) => (y) => (y >= podiumTop ? 0 : insetAt(y) + setback);

  const base = { cols, rows, shape, podiumTop, setback, top: 0 };

  if (shape === 'slab') {
    return { ...base, top: cells(2), insetAt: onPodium(() => 0), steps: [] };
  }

  if (shape === 'spire') {
    // A long tapering needle over the top fifth, down to something two cells
    // across. This is the one that gives a skyline a point on it.
    const shoulder = Math.round(rows * 0.22);
    return {
      ...base,
      top: 0,
      steps: [shoulder],
      insetAt: onPodium((y) => (y >= shoulder ? 0 : clamp(Math.round(((shoulder - y) / shoulder) * (cols / 2))))),
    };
  }

  if (shape === 'chamfer') {
    // Corners cut off at forty five degrees. Cheap, and it reads as a modern
    // tower from any distance because nothing else in the city has a diagonal.
    const cut = Math.min(Math.round(rows * 0.07), limit);
    return {
      ...base,
      top: cells(2),
      steps: [cut + cells(2)],
      insetAt: onPodium((y) => clamp(cut + cells(2) - y)),
    };
  }

  if (shape === 'deco') {
    // A ziggurat. Five steps crowded into the top third, which is what makes a
    // nineteen thirties tower look like one.
    const bands = [0.05, 0.09, 0.14, 0.2, 0.3].map((f) => Math.round(rows * f));
    return {
      ...base,
      top: cells(1),
      steps: bands,
      insetAt: onPodium((y) => {
        for (let i = 0; i < bands.length; i += 1) if (y < bands[i]) return clamp(step * (bands.length - i));
        return 0;
      }),
    };
  }

  const neck = Math.round(rows * 0.14);
  const shoulder = Math.round(rows * 0.34);
  return {
    ...base,
    top: cells(2),
    steps: [neck, shoulder],
    insetAt: onPodium((y) => clamp(y < neck ? step * 2 : y < shoulder ? step : 0)),
  };
}

// The shaft, traced off the tall tower in the reference sheet.
//
// Four numbers, all measured at the reference's own resolution rather than
// guessed. Its shaft is eighty six art pixels across and holds seventeen
// window columns, so the beat across is five cells: two of window, three of
// pier. Averaging by row gives a floor of nine cells: seven of window and two
// of sill. Nothing else is on it.
//
// The version before this drew unbroken vertical channels with a one cell break
// at each floor, and that one cell is the whole mistake. A window has to be a
// separate rectangle with wall above and below it, or a tower is a barcode.
const BEAT = {
  pitch: 2, // metres from one window to the next
  window: 0.8, // and how much of that is glass
  floor: 3.6, // metres per storey
  sill: 0.8, // the solid band under each row of windows
};

// How many windows are lit, as a fraction of how lit the hour is. The reference
// is a daytime sheet with about one window in seventy showing a light, and a
// tower with one in twenty lit at noon reads as an office block on fire.
const LIT_SHARE = 0.35;

function curtainWall(g, form, rng) {
  const { cols } = g;
  const time = timeOfDay();
  const pitch = cells(BEAT.pitch);
  const winW = cells(BEAT.window);
  const storey = cells(BEAT.floor);
  const winH = Math.max(storey - cells(BEAT.sill), 2);
  const edge = cells(1.2); // wall left at the corner, never glazed

  const top = form.top + cells(6); // clear of the cornice
  const bottom = form.podiumTop;

  // One column grid for the whole tower, centred on the plot and fixed for its
  // full height. Laying the columns out per storey instead lets a setback shift
  // the glazing sideways as it steps in, and the two halves of the building
  // then read as two buildings.
  const count = Math.max(Math.floor((cols - edge * 2 + (pitch - winW)) / pitch), 1);
  const first = Math.round((cols - (count * pitch - (pitch - winW))) / 2);

  // Lit windows are a small bright block inside a pane rather than the whole
  // pane, which is what they are in the reference: a lit floor of an office is
  // one room, not the whole elevation.
  const lamp = time.lit > 0.3 ? 'h' : 'f';
  const lampH = Math.min(Math.max(cells(1.2), 1), winH);

  for (let y = top; y + winH <= bottom; y += storey) {
    const inset = form.insetAt(y);

    for (let i = 0; i < count; i += 1) {
      const x = first + i * pitch;
      if (x < inset + edge || x + winW > cols - inset - edge) continue;

      g.fill(x, y, winW, winH, 'j');
      if (rng() < time.lit * LIT_SHARE) {
        g.fill(x, y + Math.floor(rng() * (winH - lampH + 1)), winW, lampH, lamp);
      }
    }
  }
}

// The corner the building turns. Two cells of solid wall down both edges, drawn
// after the glazing so it always wins, which stops the glass running off the
// side and taking the building's edge with it.
function returns(g, form) {
  const { cols } = g;
  const edge = cells(1.2);

  for (let y = form.top; y < form.podiumTop; y += 1) {
    const inset = form.insetAt(y);
    if (cols - inset * 2 < 6) continue;
    // Sun from the left, so that return catches it and the far one does not.
    // The reference is emphatic about this and it is most of what stops a
    // tower reading as a flat rectangle of one colour.
    g.fill(inset, y, edge, 1, 'k');
    g.fill(cols - inset - edge, y, edge, 1, 'c');
  }
}

// Cornices at every step, a railing on the terrace each one leaves, a lit band
// near the top, and whatever the shape needs above that.
function crown(g, form, rng) {
  const { cols, rows } = g;

  for (const y of form.steps) {
    const below = form.insetAt(y + 1);
    const above = form.insetAt(y - 2);
    if (cols - below * 2 < 4) continue;

    g.fill(below - 1, y, cols - below * 2 + 2, 2, 'e');
    g.fill(below, y + 2, cols - below * 2, 1, 'b');

    // The terrace the step leaves behind, with railings on it. Only where the
    // step is deep enough to stand on.
    if (above - below >= 3) {
      for (let x = below + 1; x < above; x += 2) {
        g.fill(x, y - 3, 1, 3, 'b');
        g.fill(cols - x - 1, y - 3, 1, 3, 'b');
      }
    }
  }

  // The crown, read straight off a vertical slice down the middle of the
  // reference tower. From the top: a pale parapet, a short return to the body
  // tone, a dark cornice band, one light course, and then the windows start.
  // Four bands in about six metres, and that is the entire top of the building.
  if (form.shape !== 'spire') {
    const bands = [
      ['k', 2.2],
      ['d', 1],
      ['j', 2],
      ['k', 0.8],
    ];

    let y = form.top;
    for (const [tone, metres] of bands) {
      const inset = form.insetAt(y + 1);
      const height = cells(metres);
      if (cols - inset * 2 >= 4) g.fill(inset, y, cols - inset * 2, height, tone);
      y += height;
    }

    // Notches out of the parapet. The reference's flat topped towers all have
    // them, and they are the one thing that stops a plain slab ending in a
    // ruled line across the sky.
    if (form.shape === 'slab' || form.shape === 'chamfer') {
      const inset = form.insetAt(form.top + 1);
      const notch = cells(1.6);
      for (let x = inset + notch; x + notch < cols - inset; x += notch * 2) {
        g.fill(x, form.top, notch, cells(0.8), 'j');
      }
    }
  }

  if (form.shape === 'deco') fins(g, form);
  if (form.shape === 'spire') mast(g, form, cells(9));
}

// Vertical ribs up the crown, the way every nineteen thirties tower has them.
function fins(g, form) {
  const top = form.top;
  const bottom = form.steps[form.steps.length - 1];

  for (let y = top; y < bottom; y += 1) {
    const inset = form.insetAt(y);
    const width = g.cols - inset * 2;
    if (width < 6) continue;
    for (let x = inset + 2; x < g.cols - inset - 2; x += cells(1.2)) g.fill(x, y, 1, 1, 'b');
  }
}

// The pole, and the light on it that stops aircraft.
function mast(g, form, height) {
  const middle = Math.round(g.cols / 2);
  const top = Math.max(form.top - height, 0);

  g.fill(middle - 1, top, 2, form.top - top, 'c');
  g.fill(middle - 2, top, 4, 2, 'b');
  g.fill(middle - 1, top, 2, 1, 'h');

  // Guy wires, one cell every other row, which is all a wire can be.
  for (let y = top + 4; y < form.top; y += 2) {
    const spread = Math.round((y - top) * 0.6);
    g.set(middle - spread, y, 'b');
    g.set(middle + spread, y, 'b');
  }
}

// One cooling box on the roof, and only on a roof wide enough that it is not
// the thing you notice about the building.
//
// The dish, the aerial and the aircraft mast that used to be here are gone.
// None of the reference's flat topped towers has anything above the parapet at
// all, and a mast on every one of them is the sort of detail that makes a
// skyline look like it was assembled from a kit.
function roofPlant(g, form, rng) {
  if (form.shape !== 'slab' && form.shape !== 'setback') return;
  if (rng() > 0.5) return;

  const y = form.top;
  const inset = form.insetAt(y + 2);
  const width = g.cols - inset * 2;
  if (width < cells(9)) return;

  const boxW = cells(3.2);
  const boxH = cells(2);
  const left = inset + Math.round(width * 0.3);

  g.fill(left, y - boxH, boxW, boxH, 'j');
  g.fill(left, y - boxH, boxW, 1, 'k');
}

// The base the tower stands on: five storeys of stonework wider than the shaft,
// a heavy cornice over them, tall bays between pilasters, and a door.
//
// Everything here is deliberately coarser than the shaft. It is the part you
// actually swing past at head height, and the reference draws it the same way,
// with a handful of big openings rather than a hundred small ones.
function podium(g, form, rng) {
  const { cols, rows } = g;
  const top = form.podiumTop;
  const height = rows - top;
  if (height < cells(6)) return;

  g.fill(0, top, cols, height, 'd');

  // The cornice. A light slab that overhangs, then the line of shadow it casts,
  // which is what makes the tower look set back rather than merely narrower.
  const slab = cells(1.6);
  g.fill(0, top, cols, slab, 'k');
  g.fill(0, top + slab, cols, cells(0.8), 'j');

  const bayTop = top + slab + cells(2);
  const bayHeight = rows - bayTop - cells(1.6);
  if (bayHeight < cells(4)) return;

  // Pilasters every four metres or so, with the openings between them. Laid out
  // by the same routine every other opening in the city uses, so the margins
  // each side match instead of leaving a wide strip down one edge.
  const bays = layout(cols, cells(4));
  const doorBay = Math.floor((bays.count - 1) / 2);

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    // The end bays are storeyed and the middle ones are one tall opening, which
    // is exactly how the reference's podiums are arranged and the reason they
    // read as a lobby with offices either side rather than as a garage door.
    if (i === 0 || i === bays.count - 1) storeyedBay(g, x, bayTop, bays.width, bayHeight);
    else tallBay(g, x, bayTop, bays.width, bayHeight);

    if (i === doorBay && bays.width >= 3) {
      const w = Math.max(bays.width - 2, 2);
      g.fill(x + 1, rows - cells(3), w, cells(3), 'b');
      g.fill(x + 1, rows - cells(3), w, 1, 'e');
    }
  }

  // The plinth the whole thing sits on, so it meets the pavement with a line
  // rather than just stopping.
  g.fill(0, rows - 1, cols, 1, 'b');
}

// Four floors of small windows in one bay of the podium.
function storeyedBay(g, x, y, w, h) {
  const storey = Math.max(Math.floor(h / 4), 3);
  const winW = cells(0.8);
  const gap = cells(0.8);
  const count = Math.max(Math.floor((w + gap) / (winW + gap)), 1);
  const first = x + Math.floor((w - (count * (winW + gap) - gap)) / 2);

  for (let row = 0; row + storey <= h; row += storey) {
    for (let i = 0; i < count; i += 1) {
      g.fill(first + i * (winW + gap), y + row, winW, storey - cells(0.8), 'j');
    }
  }
}

// One opening the full height of the podium, divided by mullions. This is the
// two storey glass a real tower puts either side of its doors.
function tallBay(g, x, y, w, h) {
  g.fill(x, y, w, h, 'j');

  const pitch = cells(1.6);
  for (let m = pitch; m < w; m += pitch) g.fill(x + m, y, 1, h, 'd');
  // A transom near the top, so the opening has a head to it.
  g.fill(x, y + cells(3.2), w, 1, 'd');
}

// ---------------------------------------------------------------- shared

function wall(g, texture) {
  const { cols, rows } = g;

  // Brick gets a fine course line every few rows. Render does not, and getting
  // that wrong is what turned the first version into corrugated iron: a full
  // width dark line every five rows reads as ribbing, not as masonry.
  if (texture === 'brick') {
    for (let y = CORNICE + 3; y < rows - PLINTH; y += COURSE) {
      for (let x = 1; x < cols - 1; x += 2) g.set(x, y, 'c');
    }
  }

  // Lit from the left the same as everything else in the scene. A narrow strip
  // rather than a third of the frontage, because a terrace this close reads as
  // flat and only the return down the side catches shadow.
  g.fill(cols - 3, 0, 3, rows, 'c');
}

// Cap, dentils, and the shadow the cap throws on the wall under it. The dentils
// are the giveaway detail: a plain light band reads as a mistake, a band with
// teeth reads as a building.
function cornice(g) {
  const { cols } = g;
  const cap = Math.max(CORNICE - 2, 1);

  g.fill(0, 0, cols, 1, 'a'); // the keyline along the top
  g.fill(0, 1, cols, cap, 'f');
  for (let x = 1; x < cols - 1; x += 2) g.set(x, cap, 'a'); // the teeth
  g.fill(0, CORNICE - 1, cols, 1, 'b'); // the shadow it throws
}

// One floor of arched windows, with a band under it.
function upperStorey(g, y, h, rng) {
  const bays = layout(g.cols, cells(1.4));
  const winH = Math.min(h - cells(1), cells(2.2));
  if (winH < 4 || bays.count < 1) return;

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    window(g, x, y + 1, bays.width, winH, rng() < timeOfDay().lit, true);
  }

  // The storey band, which is what stops two floors reading as one tall wall.
  g.fill(0, y + h - 2, g.cols, 1, 'e');
  g.fill(0, y + h - 1, g.cols, 1, 'b');
}

// Big glazing, a door, and a sign board over the top of both.
function shopfront(g, y, h, rng) {
  const { cols } = g;

  // The fascia the shop name goes on. Dark, with the lettering only suggested,
  // because at this size real letters would be one cell each.
  const fascia = cells(0.8);
  g.fill(0, y, cols, fascia, 'b');
  g.fill(0, y + fascia, cols, 1, 'a');
  for (let x = 2; x < cols - 2; x += 3) g.set(x, y + 1, 'e');

  const top = y + fascia + cells(0.6);
  const height = h - (top - y) - cells(0.4);
  const bays = layout(cols, cells(2));
  if (height < 5 || bays.count < 1) return;

  const doorBay = Math.min(bays.count - 1, Math.max(1, Math.floor(bays.count / 2)));

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    if (i === doorBay) {
      door(g, x, top, bays.width, height, rng);
      continue;
    }

    window(g, x, top, bays.width, height, rng() < shopLit(), false);
    glazingBars(g, x, top, bays.width, height);
  }
}

// A front door with a window either side of it, no fascia. What sits under a
// block of flats, and under a townhouse.
function groundFloor(g, y, h, rng) {
  const bays = layout(g.cols, cells(1.6));
  const height = Math.min(h - cells(0.8), cells(2.4));
  if (height < 4 || bays.count < 1) return;

  const doorBay = Math.min(bays.count - 1, Math.max(0, Math.floor((bays.count - 1) / 2)));
  const step = cells(0.6);
  const top = y + h - height - step;

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    if (i === doorBay) door(g, x, top, bays.width, height + step, rng);
    else window(g, x, top, bays.width, height, rng() < timeOfDay().lit, false);
  }
}

// Panelled, with a fanlight over it and a handle on the side away from the
// hinges. Two point one metres tall wherever it appears, because a door is the
// one thing in a street everybody already knows the size of.
function door(g, x, y, w, h, rng) {
  g.fill(x - 1, y - 1, w + 2, h + 1, 'a');
  g.fill(x, y, w, h, 'b');

  const light = Math.max(Math.round(h * 0.3), 3);
  g.fill(x + 1, y + 1, w - 2, light, rng() < 0.5 ? 'h' : 'g');

  // Panels below the fanlight, which is what stops it reading as a slab.
  const panelTop = y + light + 3;
  if (h - light > 8 && w > 5) {
    g.fill(x + 2, panelTop, w - 4, 1, 'c');
    g.fill(x + 2, y + h - 3, w - 4, 1, 'c');
  }

  g.set(x + w - 2, y + Math.round(h * 0.6), 'e'); // the handle
}

// A pane with a frame around it, a keyline around that, and a sill under it.
// `arched` swaps the square top for the hand written profile, which is the
// shape the reference uses on every upper storey.
//
// Built from the silhouette outwards rather than by painting rectangles and
// carving the corners back off. Carving is how the first version went wrong:
// with an arch three cells deep it ate the whole top row and left a notch.
function window(g, x, y, w, h, lit, arched) {
  const glass = lit ? 'h' : 'g';
  const arch = arched ? ARCH[w] || [] : [];

  const inside = (row, col) => {
    if (row < 0 || row >= h || col < 0 || col >= w) return false;
    const inset = arch[row] ?? 0;
    return col >= inset && col <= w - 1 - inset;
  };

  // A cell on the edge of the silhouette is frame, everything deeper is glass.
  // Testing the neighbours means the frame follows the curve for free.
  //
  // The frame is the dark tone, not the light one. Cream frames were the single
  // thing making this read as clip art: in the reference the surround is dark
  // joinery and the only light on the facade is the wall itself.
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      if (!inside(row, col)) continue;
      const edge = !inside(row - 1, col) || !inside(row + 1, col)
        || !inside(row, col - 1) || !inside(row, col + 1);
      g.set(x + col, y + row, edge ? 'b' : glass);
    }
  }

  // A sill, and nothing else around it.
  //
  // There used to be a keyline one ring outside the frame as well. Two rings of
  // dark is 0.8 m of joinery round a window now that a cell is 0.4, and on a
  // nine metre shop it ate the wall between the openings until the whole facade
  // was a dark grid with three panes in it. The frame alone already separates
  // the glass from the wall, which is all the keyline was ever for.
  g.fill(x - 1, y + h, w + 2, 1, 'e');
}

// A shop window is not one sheet of glass. The reference divides every one with
// a transom near the top and a mullion or two down it, and those bars are most
// of what tells you the thing on the ground floor is a shop.
function glazingBars(g, x, y, w, h) {
  if (w < 4 || h < 5) return;

  g.fill(x + 1, y + Math.round(h * 0.3), w - 2, 1, 'b');

  const bays = w >= cells(2.4) ? 3 : 2;
  for (let i = 1; i < bays; i += 1) g.fill(x + Math.round((w * i) / bays), y + 1, 1, h - 2, 'b');
}

// Evenly spaced bays, worked out so the margins either side match. Doing this
// by dividing and truncating leaves a wide strip down one edge, which is the
// first thing that makes a facade look generated.
function layout(cols, want) {
  const usable = cols - JOINT * 2;
  const count = Math.max(Math.floor((usable + JOINT) / (want + JOINT)), 1);
  const width = Math.max(Math.min(want, Math.floor((usable - (count - 1) * JOINT) / count)), 2);

  // Whatever is left over goes into the margins, not into the gaps. Putting it
  // in the gaps is what this used to do, and with only two bays on a nine metre
  // shop it left three and a half metres of blank wall down the middle and the
  // windows pushed out to the corners.
  const span = count * width + (count - 1) * JOINT;
  return { width, gap: JOINT, count, start: Math.floor((cols - span) / 2) };
}

function plinth(g) {
  g.fill(0, g.rows - PLINTH, g.cols, 1, 'e');
  g.fill(0, g.rows - PLINTH + 1, g.cols, PLINTH - 1, 'b');
}

// The keyline. Every shape on the sprite has one, and without it a facade sits
// on the sky rather than in front of it.
function edges(g) {
  for (let y = 0; y < g.rows; y += 1) {
    g.set(0, y, 'a');
    g.set(g.cols - 1, y, 'a');
  }
}
