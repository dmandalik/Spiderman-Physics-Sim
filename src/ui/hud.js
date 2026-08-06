// Writes the readouts into the DOM overlay. Kept out of the canvas so the text
// stays crisp and selectable, and so the renderer has one job.

import { length } from '../physics/vec.js';
import { energy } from '../physics/world.js';

export function createHud(root) {
  const fields = {};
  for (const el of root.querySelectorAll('[data-field]')) {
    fields[el.dataset.field] = el;
  }

  let smoothedFps = 60;

  return function updateHud(world, frameTime) {
    if (frameTime > 0) {
      smoothedFps += (1 / frameTime - smoothedFps) * 0.08;
    }

    const { hero, params } = world;
    const weight = params.mass * params.gravity;

    set(fields.speed, length(hero.vel).toFixed(1));
    set(fields.height, Math.max(hero.pos.y - world.ground, 0).toFixed(1));
    // Tension divided by body weight, so 3.0 means he feels three times his
    // own weight through the arm holding the web.
    set(fields.gforce, (world.tension / weight).toFixed(2));
    set(fields.energy, (energy(world).total / 1000).toFixed(1));
    set(fields.web, world.web.attached ? `${world.web.restLength.toFixed(0)} m` : 'free');
    set(fields.fps, Math.round(smoothedFps));
  };
}

function set(el, value) {
  if (el && el.textContent !== String(value)) el.textContent = value;
}
