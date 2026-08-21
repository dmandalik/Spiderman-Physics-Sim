// The street. Road, pavement, the terrace of shopfronts, and everything
// standing on the kerb.
//
// Drawn after the skyline and before the hero, so the shops hide the bases of
// the towers the way the reference does, and he always passes in front of the
// lot. Shops and props are pixel grids blitted once rasterised, the same as the
// buildings behind them; the road surface is the one thing still drawn as flat
// bands, because it is flat bands.

import { worldToScreen } from './camera.js';
import { streetBetween } from '../world/city.js';
import { STREET } from '../world/street.js';
import { buildFacade, facadePalette, shopfrontRow } from './pixel/facade.js';
import { buildProp, PROP_COLOURS, PROP_SIZES } from './pixel/props.js';
import { cells } from './pixel/grid.js';
import { createSprite, drawSprite, ifAffordable } from './pixel/sprite.js';
import { mulberry32 } from '../world/random.js';

const PAVEMENT = '#cbb49a';
const PAVEMENT_SHADE = '#b09880';
const PAVEMENT_JOINT = 'rgba(96, 68, 62, 0.4)';
const KERB = '#8d7a68';
const ROAD = '#3a3341';
const ROAD_EDGE = '#2c2632';
const ROAD_LINE = '#e9d9ab';
const OUTLINE = 'rgba(22, 11, 26, 0.62)';

const PAVING = 4; // metres between paving joints
const DASH = 9; // metres of road paint, then the same again of gap
const MANHOLE = 46; // metres between covers in the road

export function drawStreetscape(ctx, city, camera, ground) {
  const half = camera.width / 2 / camera.zoom;
  const { shops, props } = streetBetween(city, camera.pos.x - half - 60, camera.pos.x + half + 60, ground);

  drawGround(ctx, camera, ground);
  for (const shop of shops) drawShop(ctx, camera, shop, ground);
  for (const prop of props) drawProp(ctx, camera, prop);
}

// Pavement, kerb and asphalt. All measured off the ground line so the hero, who
// lands on that line, is always standing at the back of the pavement.
function drawGround(ctx, camera, ground) {
  const top = worldToScreen(camera, { x: 0, y: ground }).y;
  if (top > camera.height) return;

  const kerbY = worldToScreen(camera, { x: 0, y: ground + STREET.kerb }).y;
  const width = camera.width;
  const left = camera.pos.x - width / 2 / camera.zoom;
  const right = camera.pos.x + width / 2 / camera.zoom;
  const worldX = (x) => worldToScreen(camera, { x, y: ground }).x;

  ctx.fillStyle = PAVEMENT;
  block(ctx, 0, top, width, kerbY - top);

  // Paving slabs, snapped to a world grid so they slide past at the right speed
  // instead of being painted on the screen and following the camera. Two rows,
  // offset from each other, because one row of lines reads as a fence.
  const slabH = (kerbY - top) / 2;
  ctx.fillStyle = PAVEMENT_JOINT;
  const first = Math.floor(left / PAVING) * PAVING;
  for (let x = first; x < right; x += PAVING) {
    block(ctx, worldX(x), top, 1, slabH);
    block(ctx, worldX(x + PAVING / 2), top + slabH, 1, slabH);
  }
  block(ctx, 0, top + slabH, width, 1);

  ctx.fillStyle = PAVEMENT_SHADE;
  block(ctx, 0, kerbY - Math.max(camera.zoom * 0.8, 2), width, Math.max(camera.zoom * 0.8, 2));
  ctx.fillStyle = KERB;
  block(ctx, 0, kerbY, width, Math.max(camera.zoom * 0.7, 2));

  const roadTop = kerbY + Math.max(camera.zoom * 0.7, 2);
  ctx.fillStyle = ROAD;
  block(ctx, 0, roadTop, width, camera.height - roadTop);
  // The gutter, where the asphalt meets the kerb and never sees the sun.
  ctx.fillStyle = ROAD_EDGE;
  block(ctx, 0, roadTop, width, Math.max(camera.zoom * 0.5, 1));

  // A cover every so often. Cheap, and without it the asphalt is the one
  // surface in the city with nothing on it.
  const coverY = roadTop + Math.max(camera.zoom * 3, 8);
  for (let x = Math.floor(left / MANHOLE) * MANHOLE; x < right; x += MANHOLE) {
    block(ctx, worldX(x), coverY, Math.max(camera.zoom * 1.6, 4), Math.max(camera.zoom * 0.5, 2));
  }

  // The dashed centre line, on the same world grid as the paving.
  const lineY = worldToScreen(camera, { x: 0, y: ground + STREET.kerb - 9 }).y;
  if (lineY > camera.height) return;

  ctx.fillStyle = ROAD_LINE;
  for (let x = Math.floor(left / (DASH * 2)) * DASH * 2; x < right; x += DASH * 2) {
    block(ctx, worldX(x), lineY, DASH * camera.zoom, Math.max(camera.zoom * 0.35, 1));
  }
}

function drawShop(ctx, camera, shop, ground) {
  const topLeft = worldToScreen(camera, { x: shop.x, y: ground + shop.height });
  const width = shop.width * camera.zoom;
  if (topLeft.x + width < 0 || topLeft.x > camera.width) return;

  const height = shop.height * camera.zoom;
  const sprite = shop.sprite || makeShopSprite(shop);

  if (!sprite) {
    ctx.fillStyle = shop.face;
    block(ctx, topLeft.x, topLeft.y, width, height);
  } else {
    drawSprite(ctx, sprite, topLeft.x, topLeft.y, width, height);
  }

  // The awning hangs off the front of the building, past where the wall stops,
  // so it cannot live in the grid and is painted over the top instead.
  if (shop.awning) drawAwning(ctx, camera, shop, ground, topLeft.x, width);
}

function makeShopSprite(shop) {
  return ifAffordable(() => {
    const grid = buildFacade({
      kind: shop.kind,
      floors: shop.floors,
      texture: shop.texture,
      cols: cells(shop.width),
      rows: cells(shop.height),
      rng: mulberry32(shop.seed),
    });

    shop.sprite = createSprite(grid, facadePalette(shop.face));
    return shop.sprite;
  });
}

// The striped canopy over the shopfront. In the reference this is the one thing
// carrying a bright accent colour at eye level, so it does a lot of work.
function drawAwning(ctx, camera, shop, ground, left, width) {
  // Sits exactly on the fascia. The row comes from the facade builder itself
  // rather than from a fraction guessed to match it, so a three storey shop
  // and a two storey one each get their canopy in the right place instead of
  // every awning in the terrace lining up into one long stripe.
  const rows = cells(shop.height);
  const head = ground + shop.height * (1 - shopfrontRow(rows, shop.floors) / rows);
  const top = worldToScreen(camera, { x: shop.x, y: head }).y;
  const drop = Math.max(shop.awning.drop * camera.zoom, 3);
  const overhang = Math.max(camera.zoom * 0.5, 1);

  ctx.fillStyle = OUTLINE;
  block(ctx, left - overhang - 1, top - 1, width + overhang * 2 + 2, drop + 2);
  ctx.fillStyle = shop.awning.colour;
  block(ctx, left - overhang, top, width + overhang * 2, drop);

  const stripe = Math.max(camera.zoom * 1.1, 2);
  ctx.fillStyle = 'rgba(255, 240, 214, 0.75)';
  for (let x = left - overhang; x < left + width + overhang; x += stripe * 2) {
    block(ctx, x, top, stripe, drop);
  }
}

function drawProp(ctx, camera, prop) {
  const size = PROP_SIZES[prop.kind];
  const width = size.spread * prop.scale * camera.zoom;
  const height = size.height * prop.scale * camera.zoom;

  const base = worldToScreen(camera, { x: prop.x, y: prop.base });
  const left = base.x - width / 2;
  if (left + width < 0 || left > camera.width) return;

  const sprite = prop.sprite || makePropSprite(prop);
  // No flat stand in for a prop. A tree is a shape, and a green rectangle where
  // one should be is worse than nothing at all for the frame it would take.
  if (!sprite) return;

  drawSprite(ctx, sprite, left, base.y - height, width, height);
}

function makePropSprite(prop) {
  return ifAffordable(() => {
    prop.sprite = createSprite(buildProp(prop.kind, mulberry32(prop.seed)), PROP_COLOURS);
    return prop.sprite;
  });
}

// Whole pixels only. Rounding the far edge rather than the width is what stops
// neighbouring blocks leaving hairline gaps between them as they slide.
function block(ctx, x, y, w, h) {
  const left = Math.round(x);
  const top = Math.round(y);
  ctx.fillRect(left, top, Math.max(Math.round(x + w) - left, 1), Math.max(Math.round(y + h) - top, 1));
}
