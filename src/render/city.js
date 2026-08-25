// Draws the skyline, back to front.
//
// Each layer gets its own camera so it scrolls at its own rate, then a wash of
// sky colour is painted over it before the next layer goes down. That haze is
// doing most of the work, because distance in air is really just contrast
// being eaten by the atmosphere.
//
// Every building is a pixel grid rasterised once and then blitted. The grid is
// built the first time the building is on screen rather than when its chunk is
// generated, because a chunk holds buildings you may never look at and a tower
// is a hundred and sixty thousand cells.

import { worldToScreen, layerCamera } from './camera.js';
import { LAYERS, buildingsBetween } from '../world/city.js';
import { buildFacade, facadePalette } from './pixel/facade.js';
import { cells } from './pixel/grid.js';
import { createSprite, drawSprite, ifAffordable } from './pixel/sprite.js';
import { mulberry32 } from '../world/random.js';
import { timeOfDay, underLight } from '../world/daylight.js';

const ANCHOR_DOT = 'rgba(255, 170, 110, 0.35)';

export function drawCity(ctx, city, camera, ground) {
  LAYERS.forEach((layer, index) => {
    const cam = layerCamera(camera, layer.depth, ground);
    const margin = camera.width / 2 / cam.zoom + 80;
    const buildings = buildingsBetween(city, index, cam.pos.x - margin, cam.pos.x + margin, ground);

    drawLayer(ctx, buildings, cam, layer, ground);

    if (layer.haze > 0) {
      ctx.globalAlpha = layer.haze;
      ctx.fillStyle = timeOfDay().haze;
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.globalAlpha = 1;
    }
  });
}

function drawLayer(ctx, buildings, cam, layer, ground) {
  const visible = [];

  for (const building of buildings) {
    const topLeft = worldToScreen(cam, { x: building.x, y: ground + building.height });
    const width = building.width * cam.zoom;
    if (topLeft.x + width < 0 || topLeft.x > cam.width) continue;

    const height = building.height * cam.zoom;
    drawBuilding(ctx, building, topLeft.x, topLeft.y, width, height, layer);
    visible.push(building);
  }

  if (layer.anchors) drawAnchors(ctx, visible, cam);
}

// One blit, or a flat block if the sprite is not ready yet. The flat block is
// the right colour and exactly the right size, so a building that appears a
// frame or two before its detail does not move or change shape when it lands.
function drawBuilding(ctx, building, x, y, width, height, layer) {
  const sprite = building.sprite || make(building);

  if (!sprite) {
    // Washed by the current light like everything else. Raw, a rust facade
    // stands in as a bright orange slab against a night sky, which is a far
    // louder placeholder than the one it is covering for.
    ctx.fillStyle = underLight(building.face || layer.shade);
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(Math.round(width), 1), Math.max(Math.round(height), 1));
    return;
  }

  // Scaled to the world rectangle rather than to a whole number of pixels per
  // cell. Geometry has to win here: a rooftop is where a web sticks, so a
  // building drawn even a few pixels wider than it is would put its anchors
  // somewhere the physics disagrees with.
  drawSprite(ctx, sprite, x, y, width, height);
}

function make(building) {
  return ifAffordable(() => {
    const grid = buildFacade({
      kind: building.kind,
      shape: building.shape,
      texture: building.texture,
      escape: building.escape,
      cols: cells(building.width),
      rows: cells(building.height),
      rng: mulberry32(building.seed),
    });

    building.sprite = createSprite(grid, facadePalette(building.face));
    return building.sprite;
  });
}

function drawAnchors(ctx, buildings, cam) {
  if (cam.zoom < 2.5) return;

  ctx.fillStyle = ANCHOR_DOT;
  for (const building of buildings) {
    for (const anchor of building.anchors) {
      const p = worldToScreen(cam, anchor);
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    }
  }
}
