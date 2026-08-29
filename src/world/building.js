// One building. Built once when its chunk is generated, then only ever read.
//
// What is stored is a description, not a picture: how big it is, what kind of
// building it is, what colour, and which seed decides its windows. The pixel
// grid and the raster that comes off it are built by the renderer the first
// time the building is actually on screen, because a chunk holds buildings you
// may never look at and a tower grid is a hundred and sixty thousand cells.
//
// The anchors are the exception, and they are computed here on purpose. Aiming
// runs against buildings that are miles off screen and has to work whether or
// not anything has ever been drawn.

import { chance, range } from './random.js';
import { SHAPES, roofLedges } from '../render/pixel/facade.js';
import { cells } from '../render/pixel/grid.js';
import { mix, desaturate } from './daylight.js';

const ROOF_ANCHOR_STEP = 12; // metres between anchors along a rooftop
const ROOF_ANCHOR_INSET = 2.5;
// A terrace narrower than this is a moulding, not somewhere to put a web. The
// apex is exempt, since a spire has nothing wider anywhere on it.
const NARROWEST_LEDGE = 2; // metres

export function makeBuilding(rng, layer, x, width, height, ground) {
  // Its own facade colour, drawn once at generation so the same building is
  // always the same building. A skyline painted in one flat shade reads as a
  // cardboard cutout, and picking per building is what breaks that up.
  //
  // Then pushed back by how far back the layer is: the colour drained out of it
  // first, so a distant tower stops competing for attention, then a little
  // darker. Both are fixed rather than taken from the time of day, because this
  // is depth and has to hold whatever hour it is.
  let face = layer.palette[Math.floor(rng() * layer.palette.length)];
  if (layer.dull) face = desaturate(face, layer.dull);
  if (layer.darken) face = mix(face, '#20263c', layer.darken);

  // What sort of building it is follows from how tall it is, which is how it
  // works in a real city. Nobody builds a two storey shop ninety metres high.
  const kind = height >= layer.towerAbove ? 'tower' : 'block';
  const shape = kind === 'tower' ? SHAPES[Math.floor(rng() * SHAPES.length)] : null;

  return {
    x,
    width,
    height,
    face,
    kind,
    shape,
    texture: kind === 'block' && chance(rng, 0.7) ? 'brick' : 'render',
    escape: chance(rng, 0.55),
    // Its own stream of randomness, so the window pattern is stable across
    // sessions without the grid having to be stored.
    seed: Math.floor(rng() * 0xffffffff),
    // Filled in by the renderer the first time it is drawn, and dropped again
    // when the chunk is pruned.
    sprite: null,
    anchors: layer.anchors ? makeRoofAnchors(kind, shape, x, width, height, ground) : [],
  };
}

// Rooftops are the only places a web can stick. The buildings themselves are
// scenery he swings past, so nothing lower down needs an anchor.
//
// Anchors follow the silhouette the renderer will actually draw, so a ziggurat
// offers every terrace and a spire offers only its apex. Laying them in a
// straight line across the top, as this used to, put anchors on empty sky
// wherever a building was not a plain box.
function makeRoofAnchors(kind, shape, x, width, height, ground) {
  const cols = cells(width);
  const rows = cells(height);
  const anchors = [];

  for (const ledge of roofLedges({ kind, shape, cols, rows })) {
    // Grid rows count down from the top of the building, so a row near zero is
    // near the roof.
    const y = ground + height * (1 - ledge.row / rows);
    const left = x + width * (ledge.from / cols);
    const right = x + width * (ledge.to / cols);
    if (!ledge.apex && right - left < NARROWEST_LEDGE) continue;

    const inset = Math.min(ROOF_ANCHOR_INSET, (right - left) / 3);

    for (let ax = left + inset; ax <= right - inset; ax += ROOF_ANCHOR_STEP) {
      anchors.push({ x: ax, y });
    }
    // Always keep the far corner, otherwise wide roofs lose their best anchor
    // to the step size.
    anchors.push({ x: right - inset, y });
  }

  return anchors;
}

export function randomBuildingSize(rng, layer) {
  return {
    width: range(rng, layer.width[0], layer.width[1]),
    height: range(rng, layer.height[0], layer.height[1]),
  };
}
