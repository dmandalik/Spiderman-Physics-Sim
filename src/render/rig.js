// Works out where every joint is this frame. Pure maths, no drawing.
//
// Nothing here is keyframed. The arm reaches the anchor because it is solved
// to, the body turns because the velocity turned, the legs tuck because he is
// going fast. Every pose falls out of the physics state, which is why he can
// never end up in a pose that disagrees with what the simulation is doing.

import { add, sub, scale, dot, length, normalize } from '../physics/vec.js';

export const HERO_HEIGHT = 1.8; // metres, the real him

// Drawn bigger than life. A 1.8 metre figure against a 120 metre tower is a
// speck at any zoom that still frames the city, so the renderer scales him up.
// The physics never sees this number.
export const RENDER_SCALE = 3.2;

// Proportions as fractions of body height, measured from the centre of mass.
const BODY = {
  pelvis: 0.1,
  chest: 0.18,
  neck: 0.29,
  head: 0.4,
  headRadius: 0.092,
  shoulder: 0.105,
  upperArm: 0.17,
  forearm: 0.17,
  hip: 0.062,
  thigh: 0.225,
  shin: 0.225,
};

// Two bone inverse kinematics. Given a shoulder and a target, there are only
// two elbow positions that let both bones reach, mirrored across the line
// between them. `bend` picks which one. If the target is further away than the
// arm is long the arm just straightens and points at it, which is the correct
// answer rather than a failure.
export function solveTwoBone(root, target, upper, lower, bend = 1) {
  const toTarget = sub(target, root);
  const reach = upper + lower;
  const dir = length(toTarget) > 1e-6 ? normalize(toTarget) : { x: 0, y: -1 };

  let span = length(toTarget);
  if (span >= reach) {
    return { joint: add(root, scale(dir, upper)), tip: add(root, scale(dir, reach)) };
  }

  // Cannot fold tighter than the difference between the two bones.
  span = Math.max(span, Math.abs(upper - lower) + 1e-4);

  // Distance along the line where the elbow's perpendicular offset starts,
  // straight out of the law of cosines.
  const along = (upper * upper - lower * lower + span * span) / (2 * span);
  const out = Math.sqrt(Math.max(upper * upper - along * along, 0));
  const perp = { x: -dir.y, y: dir.x };

  return {
    joint: add(add(root, scale(dir, along)), scale(perp, out * bend)),
    tip: add(root, scale(dir, span)),
  };
}

// Which way is up for the body. Hanging from a web he lines up with the web,
// because that is where the pull is. In free flight he goes head first along
// his velocity, which is what turns a fall into a dive.
export function targetUp(pos, vel, web) {
  if (web.attached) return normalize(sub(web.anchor, pos));
  return length(vel) > 2 ? normalize(vel) : { x: 0, y: 1 };
}

export function poseHero({ pos, vel, web, up, time = 0 }) {
  const height = HERO_HEIGHT * RENDER_SCALE;
  const right = { x: up.y, y: -up.x };
  const at = (u, r) => add(add(pos, scale(up, u * height)), scale(right, r * height));

  const speed = length(vel);
  // How hard he is moving sideways relative to his own body, which is what
  // makes limbs trail instead of hanging straight.
  const drift = clamp(dot(vel, right) / 26, -1, 1);
  const bob = Math.sin(time * 1.6) * 0.035;

  const chest = at(BODY.chest + bob, 0);
  const pelvis = at(-BODY.pelvis + bob, 0);

  return {
    up,
    right,
    height,
    head: at(BODY.head + bob, 0),
    headRadius: BODY.headRadius * height,
    neck: at(BODY.neck + bob, 0),
    chest,
    pelvis,
    webArm: webArm(chest, right, up, height, web, drift),
    freeArm: freeArm(chest, right, up, height, drift),
    legs: legs(pelvis, right, up, height, speed, drift),
  };
}

// The one limb that has to touch something real.
function webArm(chest, right, up, height, web, drift) {
  const shoulder = add(chest, scale(right, BODY.shoulder * height));
  const reach = web.attached
    ? web.anchor
    : add(add(shoulder, scale(up, 0.3 * height)), scale(right, (0.22 + drift * 0.1) * height));

  const solved = solveTwoBone(
    shoulder,
    reach,
    BODY.upperArm * height,
    BODY.forearm * height,
    -1,
  );

  return [shoulder, solved.joint, solved.tip];
}

// The other one is free to trail, so it is straight forward kinematics.
function freeArm(chest, right, up, height, drift) {
  const shoulder = sub(chest, scale(right, BODY.shoulder * height));
  const upperDir = rotate(scale(up, -1), 0.7 - drift * 0.9);
  const elbow = add(shoulder, scale(upperDir, BODY.upperArm * height));
  const hand = add(elbow, scale(rotate(upperDir, 0.5), BODY.forearm * height));

  return [shoulder, elbow, hand];
}

// Legs tuck as he speeds up and trail against the direction he is moving,
// which is most of what sells the swing.
function legs(pelvis, right, up, height, speed, drift) {
  const tuck = clamp(speed / 34, 0, 1);
  const knee = 0.3 + tuck * 1.15;
  const trail = -drift * 0.55;

  return [-1, 1].map((side) => {
    const hip = add(pelvis, scale(right, side * BODY.hip * height));
    const thighDir = rotate(scale(up, -1), trail + side * 0.22 - tuck * 0.35);
    const kneeAt = add(hip, scale(thighDir, BODY.thigh * height));
    const shinDir = rotate(thighDir, knee * side * 0.35 + knee * 0.65);

    return [hip, kneeAt, add(kneeAt, scale(shinDir, BODY.shin * height))];
  });
}

const rotate = (v, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
