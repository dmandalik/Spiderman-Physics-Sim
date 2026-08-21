// Camera. Owns the only conversion between metres and pixels.
//
// It leads the hero rather than centring on him, because a camera locked to a
// fast moving target reads as the world sliding around instead of the hero
// moving through it. It also pulls back as he speeds up, which buys reaction
// time and makes fast swings feel fast.

import { vec } from '../physics/vec.js';

// Pixels per metre. Both ends are multiples of five on purpose: an art cell is
// a fifth of a metre, so at five pixels per metre a cell is exactly one screen
// pixel and at ten it is exactly two. Anything between those puts cell edges on
// fractions of a pixel, and nearest neighbour then drops or doubles rows at
// random, which is the shimmer that gives cheap pixel art away.
const BASE_ZOOM = 10;
const MIN_ZOOM = 5;
const LOOKAHEAD = 0.45; // seconds of velocity to lead by
const FOLLOW_RATE = 3.2; // higher snaps harder to the target

export function createCamera(pos = vec(0, 70)) {
  return { pos, zoom: BASE_ZOOM, width: 1, height: 1 };
}

export function updateCamera(camera, hero, dt, ground = 0) {
  const speed = Math.hypot(hero.vel.x, hero.vel.y);

  // Zoom falls off with speed and flattens out, so it never keeps shrinking.
  const wanted = Math.max(BASE_ZOOM / (1 + speed / 55), MIN_ZOOM);

  let targetX = hero.pos.x + hero.vel.x * LOOKAHEAD;
  let targetY = hero.pos.y + hero.vel.y * LOOKAHEAD * 0.5;

  // Stop the view dropping below the ground and showing empty space.
  const halfHeight = camera.height / 2 / camera.zoom;
  targetY = Math.max(targetY, ground + halfHeight * 0.72);

  // Frame rate independent smoothing. A plain lerp by a constant would chase
  // faster on a 240 Hz display than on a 60 Hz one.
  const t = 1 - Math.exp(-FOLLOW_RATE * dt);

  camera.pos = vec(
    camera.pos.x + (targetX - camera.pos.x) * t,
    camera.pos.y + (targetY - camera.pos.y) * t,
  );
  camera.zoom += (wanted - camera.zoom) * (1 - Math.exp(-2 * dt));
}

// A view of the same scene for a background layer. Distant layers move a
// fraction of the real camera, both sideways and vertically, which is what
// makes them read as far away. Vertical parallax is measured from the ground
// rather than from zero so the street line stays put across every layer while
// the skyline still slides as he climbs.
export function layerCamera(camera, depth, ground = 0) {
  return {
    pos: {
      x: camera.pos.x * depth,
      y: ground + (camera.pos.y - ground) * depth,
    },
    zoom: camera.zoom,
    width: camera.width,
    height: camera.height,
  };
}

export function worldToScreen(camera, point) {
  return {
    x: (point.x - camera.pos.x) * camera.zoom + camera.width / 2,
    y: camera.height / 2 - (point.y - camera.pos.y) * camera.zoom,
  };
}

export function screenToWorld(camera, point) {
  return {
    x: (point.x - camera.width / 2) / camera.zoom + camera.pos.x,
    y: (camera.height / 2 - point.y) / camera.zoom + camera.pos.y,
  };
}
