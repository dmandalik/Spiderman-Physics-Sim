// Camera. Owns the only conversion between metres and pixels.
//
// It leads the hero rather than centring on him, because a camera locked to a
// fast moving target reads as the world sliding around instead of the hero
// moving through it. It also pulls back as he speeds up, which buys reaction
// time and makes fast swings feel fast.

import { vec } from '../physics/vec.js';

const BASE_ZOOM = 7.5; // pixels per metre at rest
const MIN_ZOOM = 3.6;
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
  targetY = Math.max(targetY, ground + halfHeight * 0.55);

  // Frame rate independent smoothing. A plain lerp by a constant would chase
  // faster on a 240 Hz display than on a 60 Hz one.
  const t = 1 - Math.exp(-FOLLOW_RATE * dt);

  camera.pos = vec(
    camera.pos.x + (targetX - camera.pos.x) * t,
    camera.pos.y + (targetY - camera.pos.y) * t,
  );
  camera.zoom += (wanted - camera.zoom) * (1 - Math.exp(-2 * dt));
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
