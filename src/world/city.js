// An endless city, generated in chunks.
//
// The city is never stored, only derived. A chunk is a pure function of the
// seed, the layer and the chunk index, so you can swing east for ten minutes,
// come back, and every building is exactly where you left it. Chunks are
// cached only to avoid regenerating the ones on screen, and the cache can be
// thrown away at any time without changing anything.

import { mulberry32, hashInts, range } from './random.js';
import { makeBuilding, randomBuildingSize } from './building.js';
import { generateStreetChunk } from './street.js';
import { withinReach } from '../physics/world.js';

export const CHUNK_WIDTH = 260; // metres of city per chunk
// Smaller than it used to be. A cached chunk now holds rasterised buildings
// rather than a few numbers each, so holding a hundred of them is tens of
// megabytes of canvases for city you cannot see.
const CACHE_LIMIT = 20;
const KEEP_RADIUS = 3; // chunks either side of the view to keep cached

// Ordered back to front. Only the last layer is real, everything before it is
// scenery that moves slower to sell distance.
//
// Distant layers are the pale ones. Air between you and a building eats its
// contrast, so far buildings sit close to the sky colour and near ones go
// almost black. Doing it the other way round makes the skyline read flat.
export const LAYERS = [
  {
    depth: 0.3,
    width: [14, 30],
    height: [30, 96],
    gap: [4, 16], // packed tight, the way a real skyline crowds at distance
    shade: '#9aa4c2',
    palette: ['#9aa4c2', '#a5adc9', '#b2b6cd', '#929ebc', '#aab0c8', '#9fa8c6'],
    // Almost everything back here is a tower, which is what a far skyline is.
    towerAbove: 50,
    haze: 0.34,
    anchors: false,
  },
  {
    depth: 0.62,
    width: [18, 40],
    height: [40, 118],
    gap: [8, 24],
    shade: '#9a8098',
    palette: ['#94809f', '#a9868c', '#8a7ba4', '#b0918a', '#8e7f9c', '#a0839b'],
    towerAbove: 62,
    haze: 0.15,
    anchors: false,
  },
  {
    depth: 1,
    // Narrower than they were. A skyline of wide slabs fills the frame with two
    // buildings and reads as walls, and it also leaves whole stretches of
    // street with nothing to aim at between one roof and the next.
    width: [16, 38],
    height: [52, 168],
    gap: [12, 34],
    shade: '#a8563a',
    // The vibrant end of the reference, the row that has to hold its own next
    // to a bright red and blue sprite.
    palette: [
      '#c05a38', // rust
      '#d8963f', // mustard
      '#8a6a45', // stone
      '#3f8078', // teal
      '#ab453d', // brick red
      '#6b5a7a', // plum
      '#c2703c', // orange
      '#5b81a4', // slate blue
      '#b9a259', // sand
    ],
    // The layer he swings on. Towers start higher here so there is a proper mix
    // of blocks and towers at the height he actually flies.
    towerAbove: 78,
    haze: 0,
    anchors: true,
  },
];

export const NEAR_LAYER = LAYERS.length - 1;

export function createCity(seed = 20250806) {
  // The street is cached the same way the skyline is, and for the same reason,
  // but it is kept apart because it is not a layer: it has no anchors, no
  // parallax of its own, and it is drawn in front of everything.
  return { seed, chunks: LAYERS.map(() => new Map()), street: new Map() };
}

function generateChunk(seed, layerIndex, chunkIndex, ground) {
  const layer = LAYERS[layerIndex];
  const rng = mulberry32(hashInts(seed, layerIndex * 7919, chunkIndex));

  const start = chunkIndex * CHUNK_WIDTH;
  const end = start + CHUNK_WIDTH;
  const buildings = [];

  let x = start + range(rng, 0, layer.gap[1]);

  while (x < end) {
    const { width, height } = randomBuildingSize(rng, layer);
    // Stop rather than overhang, so buildings in neighbouring chunks can never
    // overlap and rooftops stay clean lines rather than stepped ones.
    if (x + width > end) break;

    buildings.push(makeBuilding(rng, layer, x, width, height, ground));
    x += width + range(rng, layer.gap[0], layer.gap[1]);
  }

  return buildings;
}

function chunkAt(city, layerIndex, chunkIndex, ground) {
  const cache = city.chunks[layerIndex];
  let chunk = cache.get(chunkIndex);

  if (!chunk) {
    chunk = generateChunk(city.seed, layerIndex, chunkIndex, ground);
    cache.set(chunkIndex, chunk);
  }

  return chunk;
}

function prune(cache, centre) {
  if (cache.size <= CACHE_LIMIT) return;
  for (const key of cache.keys()) {
    if (Math.abs(key - centre) > KEEP_RADIUS) cache.delete(key);
  }
}

// The shopfronts and pavement clutter across a stretch of street. Same chunking
// and the same caching as the skyline, so it is just as stable and just as
// cheap to run past twice.
export function streetBetween(city, minX, maxX, ground = 0) {
  const first = Math.floor(minX / CHUNK_WIDTH);
  const last = Math.floor(maxX / CHUNK_WIDTH);
  const shops = [];
  const props = [];

  for (let index = first; index <= last; index += 1) {
    let chunk = city.street.get(index);
    if (!chunk) {
      chunk = generateStreetChunk(city.seed, index, CHUNK_WIDTH, ground);
      city.street.set(index, chunk);
    }

    shops.push(...chunk.shops);
    props.push(...chunk.props);
  }

  prune(city.street, first);
  return { shops, props };
}

// Throws away every rasterised building and prop, so they rebuild under the
// current light. The grids themselves are gone by then, dropped after
// rasterising, so this rebuilds from the description rather than recolouring
// anything, and the frame budget spreads the work over the next few frames.
export function repaintCity(city) {
  for (const cache of city.chunks) {
    for (const chunk of cache.values()) for (const building of chunk) building.sprite = null;
  }
  for (const chunk of city.street.values()) {
    for (const shop of chunk.shops) shop.sprite = null;
    for (const prop of chunk.props) prop.sprite = null;
  }
}

export function buildingsBetween(city, layerIndex, minX, maxX, ground = 0) {
  const first = Math.floor(minX / CHUNK_WIDTH);
  const last = Math.floor(maxX / CHUNK_WIDTH);
  const buildings = [];

  for (let index = first; index <= last; index += 1) {
    buildings.push(...chunkAt(city, layerIndex, index, ground));
  }

  prune(city.chunks[layerIndex], first);
  return buildings;
}

// Below this far under him there is no swing left in it, only a fall.
const BELOW_LIMIT = 55; // metres

// A rope shorter than this snaps him round rather than swinging him.
const SHORTEST_USEFUL = 22; // metres

// Aiming is scored as a column, not as a direction or a distance.
//
// Both of the earlier versions had the same blind spot at the top of the
// screen. A rooftop above the window is somewhere you physically cannot put the
// pointer, so scoring by distance to the cursor never chose it, and scoring by
// direction only half fixed it: the steepest thing you can point at is the top
// edge of the window, so a tower directly overhead still came out tens of
// degrees off whatever you aimed at and lost to a low roof nearer your angle.
//
// The column model has no top edge at all. The cursor picks a vertical strip of
// the city, and being higher up that strip is almost free, so putting the
// pointer underneath a tower is enough to grab it however far above the frame
// its roof sits. Everything here is priced in metres of horizontal error, which
// makes the numbers directly comparable: a cost of 70 means he would rather
// take an anchor 70 metres further along the street than accept that fault.
const COLUMN_COST = 1; // per metre between the anchor and the cursor, the unit
const ABOVE_COST = 0.05; // per metre the anchor sits above where you pointed
const UNDER_COST = 0.55; // per metre it sits below where you pointed
const BEHIND_COST = 70; // swinging backwards kills the run, so it stays dear
const SHORT_COST = 3; // per metre under SHORTEST_USEFUL

// The asymmetry between ABOVE_COST and UNDER_COST is the whole idea. Up is the
// direction you cannot ask for, so asking is cheap: a roof a hundred metres
// over your cursor is charged five metres of error, which almost nothing beats.
// Down is a direction you can point at perfectly well, so if you wanted a lower
// roof you would have said so, and picking one you did not ask for is dear.

// Picks what a web fired at `target` should actually stick to.
//
// The cursor says roughly where you want to go, not exactly what to grab, so
// this scores every reachable anchor and takes the best. Nearest to the cursor
// on its own is not enough: it happily hands you a ledge just behind your
// shoulder, which stops the swing dead and is the single most disruptive thing
// that can happen mid flight. Anchors behind take a heavy penalty, and short
// ropes take one that grows the shorter they get.
function aimError(target, anchor) {
  const across = Math.abs(anchor.x - target.x) * COLUMN_COST;
  const rise = anchor.y - target.y;

  return across + (rise >= 0 ? rise * ABOVE_COST : -rise * UNDER_COST);
}

export function pickAnchor(city, from, target, maxRange, ground = 0, heading = 0) {
  const buildings = buildingsBetween(city, NEAR_LAYER, from.x - maxRange, from.x + maxRange, ground);
  const forward = Math.sign(heading);

  let best = null;
  let bestScore = Infinity;

  for (const building of buildings) {
    for (const anchor of building.anchors) {
      if (anchor.y - from.y < -BELOW_LIMIT) continue;
      if (!withinReach(from, anchor, maxRange)) continue;

      const reach = Math.hypot(anchor.x - from.x, anchor.y - from.y);

      let score = aimError(target, anchor);

      if (forward !== 0 && (anchor.x - from.x) * forward < 0) score += BEHIND_COST;
      if (reach < SHORTEST_USEFUL) score += (SHORTEST_USEFUL - reach) * SHORT_COST;

      if (score < bestScore) {
        bestScore = score;
        best = anchor;
      }
    }
  }

  return best;
}
