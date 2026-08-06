// An endless city, generated in chunks.
//
// The city is never stored, only derived. A chunk is a pure function of the
// seed, the layer and the chunk index, so you can swing east for ten minutes,
// come back, and every building is exactly where you left it. Chunks are
// cached only to avoid regenerating the ones on screen, and the cache can be
// thrown away at any time without changing anything.

import { mulberry32, hashInts, range } from './random.js';
import { makeBuilding, randomBuildingSize } from './building.js';

export const CHUNK_WIDTH = 260; // metres of city per chunk
const CACHE_LIMIT = 96;
const KEEP_RADIUS = 6; // chunks either side of the view to keep cached

// Ordered back to front. Only the last layer is real, everything before it is
// scenery that moves slower to sell distance.
//
// Distant layers are the pale ones. Air between you and a building eats its
// contrast, so far buildings sit close to the sky colour and near ones go
// almost black. Doing it the other way round makes the skyline read flat.
export const LAYERS = [
  {
    depth: 0.3,
    width: [16, 32],
    height: [28, 74],
    gap: [8, 24],
    shade: '#1a2750',
    roof: 'rgba(150, 185, 255, 0.2)',
    windowDensity: 0.16,
    haze: 0.5,
    anchors: false,
  },
  {
    depth: 0.62,
    width: [18, 40],
    height: [38, 104],
    gap: [12, 30],
    shade: '#101a3a',
    roof: 'rgba(120, 175, 255, 0.3)',
    windowDensity: 0.3,
    haze: 0.26,
    anchors: false,
  },
  {
    depth: 1,
    width: [22, 52],
    height: [52, 168],
    gap: [18, 48],
    shade: '#05070f',
    roof: 'rgba(77, 226, 255, 0.55)',
    windowDensity: 0.46,
    haze: 0,
    anchors: true,
  },
];

export const NEAR_LAYER = LAYERS.length - 1;

export function createCity(seed = 20250806) {
  return { seed, chunks: LAYERS.map(() => new Map()) };
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

// Picks what a web fired at `target` should actually stick to. Anchors below
// the hero are skipped because a web you cannot swing under is useless, and
// the winner is whichever reachable anchor sits closest to where you aimed,
// which is what makes rough aiming feel generous instead of fussy.
export function pickAnchor(city, from, target, maxRange, ground = 0) {
  const buildings = buildingsBetween(city, NEAR_LAYER, from.x - maxRange, from.x + maxRange, ground);

  let best = null;
  let bestScore = Infinity;

  for (const building of buildings) {
    for (const anchor of building.anchors) {
      if (anchor.y <= from.y + 2) continue;
      if (Math.hypot(anchor.x - from.x, anchor.y - from.y) > maxRange) continue;

      const score = Math.hypot(anchor.x - target.x, anchor.y - target.y);
      if (score < bestScore) {
        bestScore = score;
        best = anchor;
      }
    }
  }

  return best;
}
