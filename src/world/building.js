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
import { SHAPES } from '../render/pixel/facade.js';

const ROOF_ANCHOR_STEP = 12; // metres between anchors along a rooftop
const ROOF_ANCHOR_INSET = 2.5;

export function makeBuilding(rng, layer, x, width, height, ground) {
  // Its own facade colour, drawn once at generation so the same building is
  // always the same building. A skyline painted in one flat shade reads as a
  // cardboard cutout, and picking per building is what breaks that up.
  const face = layer.palette[Math.floor(rng() * layer.palette.length)];

  // What sort of building it is follows from how tall it is, which is how it
  // works in a real city. Nobody builds a two storey shop ninety metres high.
  const kind = height >= layer.towerAbove ? 'tower' : 'block';

  return {
    x,
    width,
    height,
    face,
    kind,
    shape: kind === 'tower' ? SHAPES[Math.floor(rng() * SHAPES.length)] : null,
    texture: kind === 'block' && chance(rng, 0.7) ? 'brick' : 'render',
    escape: chance(rng, 0.55),
    // Its own stream of randomness, so the window pattern is stable across
    // sessions without the grid having to be stored.
    seed: Math.floor(rng() * 0xffffffff),
    // Filled in by the renderer the first time it is drawn, and dropped again
    // when the chunk is pruned.
    sprite: null,
    anchors: layer.anchors ? makeRoofAnchors(x, width, height, ground) : [],
  };
}

// Rooftops are the only places a web can stick. The buildings themselves are
// scenery he swings past, so nothing lower down needs an anchor.
function makeRoofAnchors(x, width, height, ground) {
  const roof = ground + height;
  const anchors = [];

  for (let ax = x + ROOF_ANCHOR_INSET; ax <= x + width - ROOF_ANCHOR_INSET; ax += ROOF_ANCHOR_STEP) {
    anchors.push({ x: ax, y: roof });
  }
  // Always keep the far corner, otherwise wide buildings lose their best anchor
  // to the step size.
  anchors.push({ x: x + width - ROOF_ANCHOR_INSET, y: roof });

  return anchors;
}

export function randomBuildingSize(rng, layer) {
  return {
    width: range(rng, layer.width[0], layer.width[1]),
    height: range(rng, layer.height[0], layer.height[1]),
  };
}
