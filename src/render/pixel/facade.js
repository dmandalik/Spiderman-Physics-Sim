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
import { darken, lighten } from '../../world/palette.js';

export { CELL, cells };

// Eight tones, the same count the sprite is drawn with. Six come from the
// building's own colour so every facade lights the same way, and the two glass
// tones are shared, because a window is the sky and a lamp, not the wall.
export function facadePalette(face) {
  return {
    a: darken(face, 0.84), // outline and the darkest lines
    b: darken(face, 0.52), // joinery, recesses, the plinth
    c: darken(face, 0.24), // the side the sun has left, spandrels
    d: face,
    e: lighten(face, 0.44), // trim, sills, storey bands
    f: lighten(face, 0.78), // cornice highlight
    // Both glass tones sit clearly darker than the trim, or a lit window turns
    // into a solid cream slab with no pane inside it at all.
    g: '#55688a', // glass with the dusk sky in it
    h: '#f0ac4e', // glass with a lamp behind it
    // The ninth. A curtain wall is a mirror, and the one thing that stops a
    // hundred metres of it reading as graph paper is the band of brighter sky
    // sliding diagonally across it.
    i: '#8fa6c8', // glass catching the sun off to the west
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

const CORNICE = 5; // rows a shop cap takes, including its dentils and shadow
const PLINTH = 3; // rows of stonework at street level
const COURSE = 5; // rows between the lines in brickwork

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
  g.fill(0, 0, cols, 1, 'a');
  g.fill(0, 1, cols, 2, 'e');
  g.fill(0, 3, cols, 1, 'b');

  const top = 5;
  const bottom = rows - PLINTH;
  const storey = cells(STOREY.flat);
  const groundHeight = cells(STOREY.shopfront);
  const floors = Math.max(Math.floor((bottom - top - groundHeight) / storey), 1);

  const winW = Math.min(cells(1.3), 8);
  const bays = layout(cols, winW);

  for (let floor = 0; floor < floors; floor += 1) {
    const y = top + storey * floor + 3;
    const h = storey - 7;
    if (h < 4) break;

    for (let i = 0; i < bays.count; i += 1) {
      const x = bays.start + i * (bays.width + bays.gap);
      window(g, x, y, bays.width, h, rng() < 0.45, false);
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
  lobby(g, form.lobbyTop, rows - form.lobbyTop, rng);
  g.outline('a');

  return g.done();
}

// How much to pull each row in from both sides. Everything about a tower's
// character lives in this one function.
function silhouette(shape, cols, rows) {
  const step = Math.max(cells(1.5), 2);
  const limit = Math.floor(cols / 2) - 3;
  const clamp = (inset) => Math.max(Math.min(inset, limit), 0);
  const base = { cols, rows, shape, lobbyTop: rows - cells(9), top: 0 };

  if (shape === 'slab') {
    return { ...base, top: cells(2), insetAt: () => 0, steps: [] };
  }

  if (shape === 'spire') {
    // A long tapering needle over the top fifth, down to something two cells
    // across. This is the one that gives a skyline a point on it.
    const shoulder = Math.round(rows * 0.22);
    return {
      ...base,
      top: 0,
      steps: [shoulder],
      insetAt: (y) => (y >= shoulder ? 0 : clamp(Math.round(((shoulder - y) / shoulder) * (cols / 2)))),
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
      insetAt: (y) => clamp(cut + cells(2) - y),
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
      insetAt: (y) => {
        for (let i = 0; i < bands.length; i += 1) if (y < bands[i]) return clamp(step * (bands.length - i));
        return 0;
      },
    };
  }

  const neck = Math.round(rows * 0.14);
  const shoulder = Math.round(rows * 0.34);
  return {
    ...base,
    top: cells(2),
    steps: [neck, shoulder],
    insetAt: (y) => clamp(y < neck ? step * 2 : y < shoulder ? step : 0),
  };
}

// Bays of glazing with the wall left standing between them. The standing wall
// is the pier, which is cheaper than drawing piers and then fitting windows
// around them, and it is why a tower reads as vertical.
//
// Bay positions come off one grid spanning the full width, not off whatever the
// width happens to be at that height, so the piers run dead straight through
// every setback instead of jinking sideways at each step.
function curtainWall(g, form, rng) {
  const { cols } = g;
  const pitch = cells(4.2);
  const pier = cells(1.1);
  const glass = pitch - pier;
  const first = Math.round(((cols % pitch) + pier) / 2);

  const storey = cells(STOREY.office);
  const winH = storey - cells(1.1);
  const mullion = cells(1.4);

  // Where the band of reflected sun crosses the building. Sloped, because a
  // vertical stripe reads as a mistake and a horizontal one as a floor.
  const sheenAt = (x, y) => ((x * 2 + y) % (cols * 3.2)) < cols * 0.9;

  for (let y = form.top + cells(2); y + storey < form.lobbyTop; y += storey) {
    const inset = form.insetAt(y + winH);
    if (cols - inset * 2 < pitch) continue;

    // Offices work late by the floor, not by the window. Lighting them one at a
    // time gives static; lighting them in bands gives a building.
    const busy = rng() < 0.42;

    for (let x = first; x + glass <= cols; x += pitch) {
      if (x < inset + pier || x + glass > cols - inset - pier) continue;

      const lit = rng() < (busy ? 0.78 : 0.12);
      g.fill(x, y, glass, winH, lit ? 'h' : sheenAt(x, y) ? 'i' : 'g');

      // Mullions down the bay and a transom across the head of it. Without
      // these a bay is a rectangle of colour rather than a window.
      for (let m = mullion; m < glass; m += mullion) g.fill(x + m, y, 1, winH, 'b');
      g.fill(x, y, glass, 1, 'b');
    }

    // The spandrel under each band of glass, its highlight, and its shadow.
    g.fill(inset, y + winH, cols - inset * 2, 1, 'e');
    g.fill(inset, y + winH + 1, cols - inset * 2, 1, 'c');
    g.fill(inset, y + winH + 2, cols - inset * 2, 1, 'b');
  }
}

// The corner the building turns. Two cells of solid wall down both edges, drawn
// after the glazing so it always wins, which stops the glass running off the
// side and taking the building's edge with it.
function returns(g, form) {
  const { cols, rows } = g;

  for (let y = form.top; y < form.lobbyTop; y += 1) {
    const inset = form.insetAt(y);
    if (cols - inset * 2 < 6) continue;
    g.fill(inset, y, 2, 1, 'd');
    g.fill(cols - inset - 2, y, 2, 1, 'c');
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

  // A lit band under the parapet. This is the detail that makes a night skyline
  // look expensive, and it costs three rows.
  const top = form.top + cells(1);
  const inset = form.insetAt(top + 3);
  if (cols - inset * 2 >= 6 && form.shape !== 'spire') {
    g.fill(inset + 1, top, cols - inset * 2 - 2, 1, 'h');
    g.fill(inset, top + 1, cols - inset * 2, 1, 'e');
  }

  if (form.shape === 'deco') fins(g, form);
  if (form.shape === 'spire') mast(g, form, cells(9));
  else if (form.shape !== 'deco') mast(g, form, cells(6));
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

// Cooling plant, a dish and an aerial. Nothing up here is webbable, so it is
// free to be as cluttered as a real roof.
function roofPlant(g, form, rng) {
  if (form.shape === 'spire' || form.shape === 'chamfer') return;

  const y = form.top;
  const inset = form.insetAt(y + 2);
  const width = g.cols - inset * 2;
  if (width < cells(4)) return;

  const boxW = cells(1.8);
  const boxH = cells(1.4);
  const left = inset + 2;

  g.fill(left, y - boxH, boxW, boxH, 'c');
  g.fill(left, y - boxH, boxW, 1, 'e');
  for (let i = 1; i < 4; i += 1) g.fill(left + Math.round((boxW * i) / 4), y - boxH + 2, 1, boxH - 3, 'b');

  if (width > cells(7)) {
    // A dish, which is the one curved thing on the whole building.
    const cx = g.cols - inset - cells(2.2);
    g.disc(cx, y - cells(1.2), cells(0.9), 'c');
    g.fill(cx, y - cells(1.2), 1, cells(1.2), 'b');
  }
}

// Tall glass, a canopy over the doors, and a dark band above it all.
function lobby(g, y, h, rng) {
  const { cols } = g;

  g.fill(0, y, cols, 2, 'b');
  g.fill(0, y + 2, cols, 1, 'a');
  g.fill(0, y + 3, cols, h - 3, 'c');

  const glassTop = y + 6;
  const glassHeight = h - 10;
  if (glassHeight < 6) return;

  const bays = layout(cols, cells(2.2));
  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    window(g, x, glassTop, bays.width, glassHeight, true, false);
    glazingBars(g, x, glassTop, bays.width, glassHeight);
  }

  // The canopy, which is the one thing that gives a tower a human sized door.
  const canopy = Math.round(cols * 0.34);
  g.fill(Math.round((cols - canopy) / 2), glassTop + Math.round(glassHeight * 0.45), canopy, 2, 'e');
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

  g.fill(0, 0, cols, 1, 'a');
  g.fill(0, 1, cols, 2, 'f');
  g.fill(0, 3, cols, 1, 'e');
  for (let x = 1; x < cols - 1; x += 2) g.set(x, 3, 'a');
  g.fill(0, 4, cols, 1, 'b');
}

// One floor of arched windows, with a band under it.
function upperStorey(g, y, h, rng) {
  const bays = layout(g.cols, 7);
  const winH = Math.min(h - 5, cells(2.4));
  if (winH < 6 || bays.count < 1) return;

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    window(g, x, y + 2, bays.width, winH, rng() < 0.45, true);
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
  g.fill(0, y, cols, 3, 'b');
  g.fill(0, y + 3, cols, 1, 'a');
  for (let x = 3; x < cols - 3; x += 3) g.fill(x, y + 1, 2, 1, 'e');

  const top = y + 6;
  const height = h - 7;
  const bays = layout(cols, cells(2));
  if (height < 6 || bays.count < 1) return;

  const doorBay = Math.min(bays.count - 1, Math.max(1, Math.floor(bays.count / 2)));

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    if (i === doorBay) {
      door(g, x, top, bays.width, height, rng);
      continue;
    }

    window(g, x, top, bays.width, height, rng() < 0.6, false);
    glazingBars(g, x, top, bays.width, height);
  }
}

// A front door with a window either side of it, no fascia. What sits under a
// block of flats, and under a townhouse.
function groundFloor(g, y, h, rng) {
  const bays = layout(g.cols, cells(1.6));
  const height = Math.min(h - 4, cells(2.6));
  if (height < 5 || bays.count < 1) return;

  const doorBay = Math.min(bays.count - 1, Math.max(0, Math.floor((bays.count - 1) / 2)));
  const top = y + h - height - 3;

  for (let i = 0; i < bays.count; i += 1) {
    const x = bays.start + i * (bays.width + bays.gap);
    if (i === doorBay) door(g, x, top, bays.width, height + 3, rng);
    else window(g, x, top, bays.width, height, rng() < 0.5, false);
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

  // The keyline, one ring outside the silhouette, corners included so the arch
  // never shows a stray diagonal gap.
  for (let row = -1; row <= h; row += 1) {
    for (let col = -1; col <= w; col += 1) {
      if (inside(row, col)) continue;
      const touches = inside(row - 1, col) || inside(row + 1, col)
        || inside(row, col - 1) || inside(row, col + 1)
        || inside(row - 1, col - 1) || inside(row - 1, col + 1)
        || inside(row + 1, col - 1) || inside(row + 1, col + 1);
      if (touches) g.set(x + col, y + row, 'a');
    }
  }

  g.fill(x - 2, y + h + 1, w + 4, 1, 'e'); // sill
  g.fill(x - 2, y + h + 2, w + 4, 1, 'b'); // its shadow
}

// A shop window is not one sheet of glass. The reference divides every one with
// a transom near the top and a mullion or two down it, and those bars are most
// of what tells you the thing on the ground floor is a shop.
function glazingBars(g, x, y, w, h) {
  if (w < 6 || h < 8) return;

  g.fill(x + 1, y + Math.round(h * 0.28), w - 2, 1, 'b');

  const bays = w >= 12 ? 3 : 2;
  for (let i = 1; i < bays; i += 1) g.fill(x + Math.round((w * i) / bays), y + 1, 1, h - 2, 'b');
}

// Evenly spaced bays, worked out so the margins either side match. Doing this
// by dividing and truncating leaves a wide strip down one edge, which is the
// first thing that makes a facade look generated.
function layout(cols, want) {
  const usable = cols - 6;
  const count = Math.max(Math.floor(usable / (want + 3)), 1);
  const width = Math.max(Math.min(want, Math.floor((usable - (count - 1) * 3) / count)), 3);
  const gap = count > 1 ? Math.floor((usable - count * width) / (count - 1)) : 0;

  return { width, gap, count, start: Math.floor((cols - (count * width + (count - 1) * gap)) / 2) };
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
