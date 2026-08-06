// One building. Built once when its chunk is generated, then only ever read.
//
// The expensive parts, the window pattern and the anchor points, are computed
// here rather than per frame, because a chunk is generated once and drawn
// thousands of times.

import { chance, range } from './random.js';

export const WINDOW = { width: 1.4, height: 1.9, stepX: 3.4, stepY: 4.8 };

const ROOF_ANCHOR_STEP = 12; // metres between anchors along a rooftop
const ROOF_ANCHOR_INSET = 2.5;

export function makeBuilding(rng, layer, x, width, height, ground) {
  return {
    x,
    width,
    height,
    windows: layer.windowDensity > 0 ? makeWindows(rng, layer, x, width, height, ground) : [],
    anchors: layer.anchors ? makeRoofAnchors(x, width, height, ground) : [],
  };
}

// A grid of lit windows. Each one is either lit or dark, and a few of the lit
// ones are brighter, so the renderer can draw them in two passes instead of
// changing fill colour thousands of times a frame.
//
// Each building gets its own occupancy on top of the layer's, so some towers
// are nearly asleep and others are lit end to end. A single flat probability
// makes every building look like the same building.
function makeWindows(rng, layer, x, width, height, ground) {
  const windows = [];
  const density = layer.windowDensity * range(rng, 0.35, 1.35);
  const top = ground + height - WINDOW.height * 2;

  for (let wx = x + 2.2; wx + WINDOW.width < x + width - 2.2; wx += WINDOW.stepX) {
    for (let wy = ground + 4; wy < top; wy += WINDOW.stepY) {
      if (!chance(rng, density)) continue;
      windows.push({ x: wx, y: wy, bright: chance(rng, 0.28) });
    }
  }

  return windows;
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
