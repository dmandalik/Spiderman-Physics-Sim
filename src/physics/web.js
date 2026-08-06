// The web. Two models of the same thing.
//
// A rope is inextensible, so it is solved as a position constraint after the
// integration step. A real web is elastic, so it is solved as a damped spring
// force during the integration step. Both only ever pull, never push, which is
// why every function here bails out while the web is slack.

import { sub, add, scale, dot, length, normalize } from './vec.js';

// Unit vector from the anchor out to the hero, plus the current web length.
// Everything else in this file is written in terms of these two.
export function webAxis(hero, web) {
  const offset = sub(hero.pos, web.anchor);
  return { dir: normalize(offset), len: length(offset) };
}

export const isSlack = (hero, web) => webAxis(hero, web).len <= web.restLength;

// Elastic mode. Hooke's law along the web line with a damper on the radial
// velocity, so the web stretches, snaps back, and settles instead of ringing
// forever. Returns a force in newtons.
export function springForce(hero, web, params) {
  const { dir, len } = webAxis(hero, web);
  const stretch = len - web.restLength;
  if (stretch <= 0) return { x: 0, y: 0 };

  const radialSpeed = dot(hero.vel, dir);
  const magnitude = params.stiffness * stretch + params.damping * radialSpeed;

  // Clamped at zero so a fast inward swing can never turn the damper into a
  // push. Negative sign because the force pulls back toward the anchor.
  return scale(dir, -Math.max(magnitude, 0));
}

// Rigid mode. Snap the hero back onto the circle of radius restLength and
// strip out the radial part of the velocity, since a rope that cannot stretch
// cannot let you move along its own length. Mutates the hero.
export function solveRopeConstraint(hero, web) {
  const { dir, len } = webAxis(hero, web);
  if (len <= web.restLength) return;

  hero.pos = add(web.anchor, scale(dir, web.restLength));

  const radialSpeed = dot(hero.vel, dir);
  if (radialSpeed > 0) hero.vel = sub(hero.vel, scale(dir, radialSpeed));
}

// Tension in newtons, for the HUD, the g force readout and screen shake.
//
// Rigid mode has no spring to read a force off, so it comes from Newton's
// second law in the radial direction. The net inward force has to supply the
// centripetal term m v_t^2 / L, and gravity already contributes part of it,
// so the rope makes up the difference. That is why tension peaks at the
// bottom of a swing and not at the sides.
export function webTension(hero, web, params) {
  if (!web.attached) return 0;
  const { dir, len } = webAxis(hero, web);

  if (params.webMode === 'elastic') {
    return length(springForce(hero, web, params));
  }

  if (len < web.restLength - 1e-6) return 0;

  const radial = scale(dir, dot(hero.vel, dir));
  const tangentialSpeed = length(sub(hero.vel, radial));
  const gravity = { x: 0, y: -params.gravity };
  const centripetal = (params.mass * tangentialSpeed ** 2) / Math.max(len, 1e-6);

  return Math.max(centripetal + params.mass * dot(gravity, dir), 0);
}
