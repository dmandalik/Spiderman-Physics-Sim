// Draws the skyline, back to front.
//
// Each layer gets its own camera so it scrolls at its own rate, then a wash of
// sky colour is painted over it before the next layer goes down. That haze is
// doing most of the work, because distance in air is really just contrast
// being eaten by the atmosphere.

import { worldToScreen, layerCamera } from './camera.js';
import { LAYERS, buildingsBetween } from '../world/city.js';
import { WINDOW } from '../world/building.js';

const HAZE = '#101c3c';
const WINDOW_DIM = 'rgba(255, 214, 150, 0.34)';
const WINDOW_BRIGHT = 'rgba(255, 236, 196, 0.85)';
const ANCHOR_DOT = 'rgba(77, 226, 255, 0.3)';

// Below this many pixels per metre the windows are smaller than a pixel and
// only cost time, so they get skipped entirely.
const WINDOW_ZOOM_CUTOFF = 3.4;

export function drawCity(ctx, city, camera, ground) {
  LAYERS.forEach((layer, index) => {
    const cam = layerCamera(camera, layer.depth, ground);
    const margin = camera.width / 2 / cam.zoom + 80;
    const buildings = buildingsBetween(city, index, cam.pos.x - margin, cam.pos.x + margin, ground);

    drawLayer(ctx, buildings, cam, layer, ground);

    if (layer.haze > 0) {
      ctx.globalAlpha = layer.haze;
      ctx.fillStyle = HAZE;
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.globalAlpha = 1;
    }
  });
}

function drawLayer(ctx, buildings, cam, layer, ground) {
  const rects = [];

  ctx.fillStyle = layer.shade;
  for (const building of buildings) {
    const topLeft = worldToScreen(cam, { x: building.x, y: ground + building.height });
    const bottomRight = worldToScreen(cam, { x: building.x + building.width, y: ground });

    const rect = {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y,
    };

    // Off screen sideways, so skip it and its windows too.
    if (rect.x + rect.w < 0 || rect.x > cam.width) continue;

    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    rects.push({ rect, building });
  }

  drawRoofEdges(ctx, rects, layer);

  if (cam.zoom >= WINDOW_ZOOM_CUTOFF) drawWindows(ctx, rects, cam);
  if (layer.anchors) drawAnchors(ctx, rects, cam);
}

// A lit top edge separates overlapping silhouettes that are all the same
// colour, and doubles as a hint about where a web will stick.
function drawRoofEdges(ctx, rects, layer) {
  ctx.strokeStyle = layer.roof;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (const { rect } of rects) {
    ctx.moveTo(rect.x, rect.y);
    ctx.lineTo(rect.x + rect.w, rect.y);
  }

  ctx.stroke();
}

// Two passes, one fill colour each. Setting fillStyle per window would mean
// thousands of state changes a frame for no visible gain.
function drawWindows(ctx, rects, cam) {
  const w = Math.max(WINDOW.width * cam.zoom, 1);
  const h = Math.max(WINDOW.height * cam.zoom, 1);

  for (const bright of [false, true]) {
    ctx.fillStyle = bright ? WINDOW_BRIGHT : WINDOW_DIM;

    for (const { building } of rects) {
      for (const win of building.windows) {
        if (win.bright !== bright) continue;
        const p = worldToScreen(cam, { x: win.x, y: win.y + WINDOW.height });
        ctx.fillRect(p.x, p.y, w, h);
      }
    }
  }
}

function drawAnchors(ctx, rects, cam) {
  if (cam.zoom < 2.5) return;

  ctx.fillStyle = ANCHOR_DOT;
  for (const { building } of rects) {
    for (const anchor of building.anchors) {
      const p = worldToScreen(cam, anchor);
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
  }
}
