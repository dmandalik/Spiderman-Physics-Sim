// Works out where every joint is this frame. Pure maths, no drawing.
//
// Nothing here is keyframed. The arm reaches the anchor because it is solved
// to, the spine bows because he is swinging, the legs tuck because he is going
// fast. Every pose falls out of the physics state, which is why he can never
// end up in a pose that disagrees with what the simulation is doing.

import { add, sub, scale, dot, length, normalize } from '../physics/vec.js';

export const HERO_HEIGHT = 1.8; // metres, the real him

// Drawn bigger than life. A 1.8 metre figure against a 120 metre tower is a
// speck at any zoom that still frames the city, and detail you cannot see may
// as well not exist. The physics never sees this number.
export const RENDER_SCALE = 4.4;

// Proportions as fractions of body height, measured from the centre of mass.
// Radii are radii, so the drawn thickness is twice these.
// Heroic eight head proportions, measured off the reference. The centre of
// mass sits a little above the hips at roughly 0.57 of standing height, which
// is where the offsets below are measured from.
export const BODY = {
  pelvis: -0.07,
  waist: 0.05,
  chest: 0.15,
  neck: 0.25,
  head: 0.36,
  headRadius: 0.0625,

  shoulder: 0.105,
  upperArm: 0.16,
  forearm: 0.15,
  hip: 0.05,
  thigh: 0.22,
  shin: 0.22,

  hipWidth: 0.062,
  waistWidth: 0.055,
  chestWidth: 0.078,
  neckWidth: 0.028,
  armWidth: 0.03,
  wristWidth: 0.02,
  thighWidth: 0.048,
  ankleWidth: 0.022,
  handRadius: 0.028,
  footLength: 0.095,
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

// Everything the pose wants to be right now, before any smoothing. The painter
// runs each of these through a spring so the body arrives at them with a bit
// of overshoot rather than snapping.
export function poseTargets({ pos, vel, web }) {
  const up = targetUp(pos, vel, web);
  const right = { x: up.y, y: -up.x };

  const speed = length(vel);
  // How hard he is moving sideways relative to his own body. This one number
  // drives the lean, the limb trail and the shoulder twist.
  const drift = clamp(dot(vel, right) / 26, -1, 1);

  return {
    up,
    lean: drift,
    tuck: clamp(speed / 30, 0, 1),
    twist: web.attached ? 0.34 - drift * 0.2 : -drift * 0.45,
    look: web.attached ? 0.25 : clamp(drift, -0.5, 0.5),
  };
}

export function poseHero({
  pos,
  vel,
  web,
  up,
  lean = 0,
  tuck = 0,
  twist = 0,
  look = 0,
  time = 0,
}) {
  const height = HERO_HEIGHT * RENDER_SCALE;
  const right = { x: up.y, y: -up.x };
  const breathe = Math.sin(time * 1.7) * 0.008;

  // Spine points bow sideways with the lean, most at the waist, so the torso
  // is a curve rather than a plank.
  const bow = [0, 0.05, 0.038, 0.012];
  const spine = [BODY.pelvis, BODY.waist, BODY.chest, BODY.neck].map((along, i) =>
    place(pos, up, right, along + breathe, bow[i] * lean, height),
  );
  const [pelvis, , chest, neck] = spine;

  // Shoulders and hips counter rotate, which is what real bodies do and what
  // stops him reading as one rigid board.
  const shoulderAxis = rotate(right, twist);
  const hipAxis = rotate(right, -twist * 0.55);

  const head = add(neck, scale(up, (BODY.head - BODY.neck) * height));

  return {
    up,
    right,
    height,
    spine,
    head,
    headRadius: BODY.headRadius * height,
    headAngle: Math.atan2(up.x, up.y) + look * 0.5,
    webArm: webArm(chest, shoulderAxis, up, height, web, lean),
    freeArm: freeArm(chest, shoulderAxis, up, height, lean, time),
    legs: legs(pelvis, hipAxis, up, height, tuck, lean, time),
  };
}

const place = (pos, up, right, along, across, height) =>
  add(add(pos, scale(up, along * height)), scale(right, across * height));

// The one limb that has to touch something real.
function webArm(chest, axis, up, height, web, lean) {
  const shoulder = add(chest, scale(axis, BODY.shoulder * height));
  const reach = web.attached
    ? web.anchor
    : add(add(shoulder, scale(up, 0.26 * height)), scale(axis, (0.2 + lean * 0.12) * height));

  const solved = solveTwoBone(shoulder, reach, BODY.upperArm * height, BODY.forearm * height, -1);
  return [shoulder, solved.joint, solved.tip];
}

// The other arm is free, so it gets a target placed for balance and is solved
// to that. Going through IK rather than stacking angles keeps the elbow bending
// like an elbow no matter where the hand ends up.
function freeArm(chest, axis, up, height, lean, time) {
  const shoulder = sub(chest, scale(axis, BODY.shoulder * height));
  const swing = 0.72 - lean * 1.05 + Math.sin(time * 2.3) * 0.07;
  const armLength = (BODY.upperArm + BODY.forearm) * height;

  const target = add(shoulder, scale(rotate(scale(up, -1), swing), armLength * 0.93));
  const solved = solveTwoBone(shoulder, target, BODY.upperArm * height, BODY.forearm * height, 1);

  return [shoulder, solved.joint, solved.tip];
}

// Legs tuck as he speeds up and trail against the direction he is moving,
// which is most of what sells the swing. Each leg gets its own target so they
// scissor slightly instead of moving as one lump.
function legs(pelvis, axis, up, height, tuck, lean, time) {
  const legLength = (BODY.thigh + BODY.shin) * height;
  const trail = -lean * 0.6;

  // The two legs are deliberately not mirror images. One folds up under him
  // and the other trails out, which is what stops the pose reading as a
  // starfish and is what a body actually does when it is thrown around.
  const bias = [1.3, 0.55];

  return [-1, 1].map((side, index) => {
    const hip = add(pelvis, scale(axis, side * BODY.hipWidth * height));
    const scissor = Math.sin(time * 2.1 + index * 1.9) * 0.11 * (1 - tuck * 0.4);
    const spread = side * 0.38 + scissor;

    const reach = legLength * (1 - Math.min(tuck * bias[index], 0.92) * 0.55);
    const target = add(hip, scale(rotate(scale(up, -1), trail + spread), reach));
    const solved = solveTwoBone(hip, target, BODY.thigh * height, BODY.shin * height, 1);

    return [hip, solved.joint, solved.tip];
  });
}

const rotate = (v, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
