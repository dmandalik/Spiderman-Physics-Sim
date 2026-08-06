// World state and the single physics step. Pure and deterministic. Nothing in
// here knows about canvases, pixels or input events.
//
// SI units in a y up frame. Metres, kilograms, seconds. Ground is y = 0.

import { vec, add, sub, scale, dot, length, distance } from './vec.js';
import { springForce, solveRopeConstraint, webTension } from './web.js';

export const DEFAULT_PARAMS = {
  gravity: 9.81, // m/s^2
  mass: 75, // kg
  drag: 0.12, // quadratic drag coefficient, N per (m/s)^2
  webMode: 'rigid', // 'rigid' or 'elastic'
  stiffness: 20000, // N/m, elastic mode only
  damping: 900, // N per m/s, elastic mode only
  maxWebRange: 110, // m, how far a web can reach
  minWebLength: 3, // m, stops the hero being reeled into the anchor
  reelRate: 14, // m/s
  timeScale: 1,
  groundBounce: 0.18,
  groundFriction: 0.7,
};

export function createWorld(params = {}) {
  const start = vec(0, 70);
  return {
    params: { ...DEFAULT_PARAMS, ...params },
    hero: { pos: start, prevPos: start, vel: vec(22, 0), radius: 0.9 },
    web: { attached: false, anchor: vec(0, 0), restLength: 0 },
    ground: 0,
    tension: 0, // newtons, recomputed every step for the HUD and the renderer
    time: 0,
  };
}

// Everything acting on the hero this instant, in newtons.
export function netForce(world) {
  const { hero, web, params } = world;

  let force = { x: 0, y: -params.gravity * params.mass };

  // Quadratic drag. Grows with the square of speed and always opposes motion,
  // which is what puts a ceiling on how fast a swing can get.
  const speed = length(hero.vel);
  if (speed > 0) force = sub(force, scale(hero.vel, params.drag * speed));

  if (web.attached && params.webMode === 'elastic') {
    force = add(force, springForce(hero, web, params));
  }

  return force;
}

// One fixed timestep. Semi implicit Euler, which means velocity is updated
// first and the new velocity is what moves the position. It costs nothing over
// plain Euler and it does not pump energy into an orbit the way plain Euler
// does, so a frictionless pendulum actually stays put instead of spiralling.
export function step(world, dt) {
  const { hero, web, params } = world;

  hero.prevPos = hero.pos;

  const acceleration = scale(netForce(world), 1 / params.mass);
  hero.vel = add(hero.vel, scale(acceleration, dt));
  hero.pos = add(hero.pos, scale(hero.vel, dt));

  if (web.attached && params.webMode === 'rigid') {
    solveRopeConstraint(hero, web);
  }

  resolveGround(world);
  world.tension = webTension(hero, web, params);
  world.time += dt;
}

function resolveGround(world) {
  const { hero, params } = world;
  const floor = world.ground + hero.radius;
  if (hero.pos.y >= floor) return;

  hero.pos = vec(hero.pos.x, floor);
  if (hero.vel.y < 0) {
    hero.vel = vec(hero.vel.x * params.groundFriction, -hero.vel.y * params.groundBounce);
  }
}

// Returns false when the anchor is out of range, so the caller can play a miss.
export function attachWeb(world, anchor) {
  const reach = distance(world.hero.pos, anchor);
  if (reach > world.params.maxWebRange) return false;

  world.web = {
    attached: true,
    anchor: vec(anchor.x, anchor.y),
    restLength: Math.max(reach, world.params.minWebLength),
  };
  return true;
}

export function releaseWeb(world) {
  world.web.attached = false;
  world.tension = 0;
}

// Winching. Shortening the web while it is under tension does work on the
// hero, which is how you gain height without a push, same as pumping a swing.
export function reelWeb(world, direction, dt) {
  const { web, params } = world;
  if (!web.attached || direction === 0) return;

  const next = web.restLength + direction * params.reelRate * dt;
  web.restLength = Math.min(Math.max(next, params.minWebLength), params.maxWebRange);
}

export function energy(world) {
  const { hero, params } = world;
  const kinetic = 0.5 * params.mass * dot(hero.vel, hero.vel);
  const potential = params.mass * params.gravity * (hero.pos.y - world.ground);
  return { kinetic, potential, total: kinetic + potential };
}
