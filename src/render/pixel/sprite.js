// Turning a grid of letters into something the screen can draw fast.
//
// A tower is a hundred and forty cells by six hundred and forty. Painting that
// with one fillRect per cell is ninety thousand calls for one building, and
// there are a dozen on screen. It cannot be done per frame and it does not need
// to be: the grid never changes once its chunk is generated, so it is rasterised
// once into an offscreen canvas at one pixel per cell and then blitted.
//
// Blitting is also what keeps it pixel art. Scaling an image with smoothing off
// is nearest neighbour, which is exactly the look, and it is one drawImage call
// however many cells the sprite has.

import { CLEAR } from './grid.js';

// Grid to raw pixels. Pure, so the interesting half can be tested without a
// browser anywhere near it.
export function spritePixels(grid, palette) {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  const data = new Uint8ClampedArray(width * height * 4);

  // Hex parsing is the expensive part per cell, so every colour is unpacked
  // once up front and looked up by character code after that.
  const table = new Map();
  for (const [key, hex] of Object.entries(palette)) {
    table.set(key, [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
  }

  for (let y = 0; y < height; y += 1) {
    const row = grid[y];
    for (let x = 0; x < width; x += 1) {
      const key = row[x];
      if (key === CLEAR) continue; // left fully transparent

      const colour = table.get(key);
      if (!colour) continue;

      const at = (y * width + x) * 4;
      data[at] = colour[0];
      data[at + 1] = colour[1];
      data[at + 2] = colour[2];
      data[at + 3] = 255;
    }
  }

  return { width, height, data };
}

// A sprite is the grid plus a canvas that is built the first time it is drawn.
// Building it at generation time instead would mean rasterising every building
// in a chunk whether or not it ever comes on screen.
export function createSprite(grid, palette) {
  return { grid, palette, cols: grid[0]?.length ?? 0, rows: grid.length, canvas: null };
}

// How much of a frame may be spent making sprites that did not exist yet.
//
// A tower costs about ten milliseconds to lay out and seven more to rasterise,
// and when the camera crosses into a new chunk several of them want making at
// once. Without a cap that is a dropped frame every time a chunk loads. With
// one, the work spreads over the next few frames and the caller draws a flat
// silhouette in the meantime, which nobody notices for two frames but everybody
// notices as a stutter.
const FRAME_BUDGET = 4; // milliseconds

let spent = 0;
let clock = () => (typeof performance === 'object' ? performance.now() : Date.now());

export function startSpriteFrame(now = clock) {
  clock = now;
  spent = 0;
}

export function spriteBudgetLeft() {
  return Math.max(FRAME_BUDGET - spent, 0);
}

// Runs the work if there is time left this frame, and reports what it cost.
// Returns null when the budget is gone, which is the caller's cue to draw
// something cheap instead and try again next frame.
export function ifAffordable(build) {
  if (spent >= FRAME_BUDGET) return null;

  const started = clock();
  const made = build();
  spent += clock() - started;

  return made;
}

function raster(sprite) {
  if (sprite.canvas) return sprite.canvas;

  const { width, height, data } = spritePixels(sprite.grid, sprite.palette);
  const canvas = surface(width, height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(data, width, height), 0, 0);

  sprite.canvas = canvas;
  // The grid has done its job. Dropping it here is the difference between the
  // chunk cache holding a few megabytes of strings and holding none.
  sprite.grid = null;

  return canvas;
}

function surface(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Draws a sprite into the rectangle x, y, width, height.
//
// A rectangle rather than a cells-per-pixel scale, because the caller knows
// where the thing has to land in the world and that has to win. A building
// drawn even a couple of pixels wider than it is would put its rooftop, and so
// its anchors, somewhere the physics disagrees with.
//
// Edges are rounded rather than the size, so neighbours always meet: rounding
// width independently leaves hairline gaps between buildings as they slide.
export function drawSprite(ctx, sprite, x, y, width, height) {
  const image = raster(sprite);

  const left = Math.round(x);
  const top = Math.round(y);
  const right = Math.round(x + width);
  const bottom = Math.round(y + height);

  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, left, top, Math.max(right - left, 1), Math.max(bottom - top, 1));
  ctx.imageSmoothingEnabled = smoothing;
}

// Whether any of a sprite would land on screen, so the caller can skip the
// blit entirely rather than asking the browser to clip it.
export function spriteVisible(x, y, width, height, viewWidth, viewHeight) {
  return x + width > 0 && x < viewWidth && y + height > 0 && y < viewHeight;
}
