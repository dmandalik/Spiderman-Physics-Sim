// Everything the solver knows, worked out for display.
//
// Pure, so the readouts can be tested without a browser and cannot drift from
// the simulation. Nothing here feeds back into the physics.

import { sub, dot, scale, length, normalize } from './vec.js';
import { netForce, energy } from './world.js';

export function metrics(world) {
  const { hero, web, params } = world;

  const speed = length(hero.vel);
  const weight = params.mass * params.gravity;

  // Drag is quadratic, so its magnitude is k v^2 and it always opposes motion.
  const drag = params.drag * speed * speed;
  const applied = length(world.applied);

  const net = netForce(world);
  const { kinetic, potential, total } = energy(world);

  // Power is the rate the non conservative forces do work. Gravity and the rope
  // are left out on purpose: neither changes the total, they only move it
  // between kinetic and potential.
  const dragPower = -drag * speed;
  const assistPower = dot(world.applied, hero.vel);

  return {
    speed,
    vx: hero.vel.x,
    vy: hero.vel.y,
    height: Math.max(hero.pos.y - world.ground, 0),
    distance: hero.pos.x,
    acceleration: length(net) / params.mass,

    tension: world.tension,
    load: world.tension / weight, // in body weights
    drag,
    weight,
    net: length(net),
    applied,

    kinetic,
    potential,
    total,
    dragPower,
    assistPower,
    power: dragPower + assistPower,

    ...pendulum(world),
  };
}

// Where drag balances weight, so he stops speeding up. Square root of mg over
// k, straight out of setting k v squared equal to mg.
//
// Infinite in a vacuum, which is the honest answer rather than a large number:
// with no drag there is nothing to balance the weight and he accelerates for
// as long as he is falling.
export function terminalSpeed(params) {
  if (params.drag <= 0) return Infinity;
  return Math.sqrt((params.mass * params.gravity) / params.drag);
}

// Small angle period of a rope of a given length. Notice the mass is not in it,
// which is the single most surprising thing about a pendulum and the reason the
// mass slider does nothing to the rhythm of a swing.
export function swingPeriod(params, length) {
  if (params.gravity <= 0 || length <= 0) return Infinity;
  return 2 * Math.PI * Math.sqrt(length / params.gravity);
}

// The swing seen as a pendulum. Zero across the board when he is in free
// flight, because none of it is defined without a rope.
function pendulum(world) {
  const { hero, web, params } = world;
  if (!web.attached) {
    return { webLength: 0, angle: 0, omega: 0, centripetal: 0, period: 0, radial: 0 };
  }

  const offset = sub(hero.pos, web.anchor);
  const webLength = Math.max(length(offset), 1e-6);
  const dir = normalize(offset);

  // Angle off straight down, positive ahead of the anchor.
  const angle = Math.atan2(offset.x, -offset.y);

  const radial = dot(hero.vel, dir);
  const tangential = length(sub(hero.vel, scale(dir, radial)));

  return {
    webLength,
    angle,
    radial,
    omega: tangential / webLength, // rad/s
    centripetal: (tangential * tangential) / webLength,
    // Small angle period. Only exact near the bottom, which is where a swing
    // spends most of its time anyway.
    period: 2 * Math.PI * Math.sqrt(webLength / params.gravity),
  };
}
