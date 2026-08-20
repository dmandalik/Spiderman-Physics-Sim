// World state and the single physics step. Pure and deterministic. Nothing in
// here knows about canvases, pixels or input events.
//
// SI units in a y up frame. Metres, kilograms, seconds. Ground is y = 0.

import { vec, add, sub, scale, dot, length, distance } from './vec.js';
import { springForce, solveRopeConstraint, webTension } from './web.js';

export const DEFAULT_PARAMS = {
  gravity: 9.81, // m/s^2
  mass: 75, // kg
  // Quadratic drag, in newtons per (m/s) squared. This is one half rho Cd A:
  // air at 1.225, a drag coefficient near 1 for a person, and roughly 0.75
  // square metres of frontal area. It puts terminal velocity around 40 m/s,
  // which is what a falling body actually does.
  drag: 0.45,
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
  // Down among the rooftops rather than above them. Start any higher and there
  // is nothing overhead to web on to, since a web can only pull you up.
  const start = vec(0, 88);
  return {
    params: { ...DEFAULT_PARAMS, ...params },
    hero: { pos: start, prevPos: start, vel: vec(26, 0), radius: 0.9 },
    web: { attached: false, anchor: vec(0, 0), restLength: 0, since: -Infinity },
    // Any extra force acting on him this step, in newtons. The physics does not
    // care where it comes from, which keeps assists and boosts out of here.
    applied: vec(0, 0),
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

  return add(force, world.applied);
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

// How much further he can fire straight up than straight along the street.
//
// Reach is an ellipse rather than a circle, for two reasons. A rope spent going
// up makes a tight fast arc, while the same length spent going down the street
// makes a lazy one, so height is worth more than distance metre for metre. And
// the roofs that sit above the top of the window are precisely the ones a
// circle cut off, which is what made tall towers feel unusable.
export const LIFT = 1.45;

// The reach test. Shared with anchor picking so the marker can never offer a
// rooftop the web will then refuse to attach to.
export function withinReach(from, anchor, maxRange) {
  const dx = (anchor.x - from.x) / maxRange;
  const rise = anchor.y - from.y;
  // Only upward gets the extra allowance. Falling to a low anchor is easy
  // enough already and does not need help.
  const dy = rise > 0 ? rise / (maxRange * LIFT) : rise / maxRange;

  return dx * dx + dy * dy <= 1;
}

// Returns false when the anchor is out of range, so the caller can play a miss.
export function attachWeb(world, anchor) {
  const reach = distance(world.hero.pos, anchor);
  if (!withinReach(world.hero.pos, anchor, world.params.maxWebRange)) return false;

  world.web = {
    attached: true,
    anchor: vec(anchor.x, anchor.y),
    restLength: Math.max(reach, world.params.minWebLength),
    // When it went out, so the renderer can hold a throw pose briefly.
    since: world.time,
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
  // The ceiling stops him paying out further than he can fire, but it must
  // never shorten a rope he already has. A steep shot can legitimately start
  // longer than the range, and trimming it to fit would break the constraint on
  // the spot and snap him at the roof.
  const ceiling = Math.max(params.maxWebRange, web.restLength);
  web.restLength = Math.min(Math.max(next, params.minWebLength), ceiling);
}

export function energy(world) {
  const { hero, params } = world;
  const kinetic = 0.5 * params.mass * dot(hero.vel, hero.vel);
  const potential = params.mass * params.gravity * (hero.pos.y - world.ground);
  return { kinetic, potential, total: kinetic + potential };
}
