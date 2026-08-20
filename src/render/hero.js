// Draws the figure from the joint positions the rig worked out.
//
// Every part is a tapered capsule, drawn outline first then fill, back to
// front. That is the same flat vector language the city is drawn in, so he
// belongs in the scene instead of sitting on top of it.

import { worldToScreen } from './camera.js';
import { poseHero, poseTargets, BODY } from './rig.js';
import { createSpring, createVectorSpring } from './spring.js';

// Classic suit. Red mask, chest, gloves and boots. Blue arms and legs. The far
// side of the body is a shade down so the two sides read apart.
const RED = '#e0202f';
const RED_FAR = '#9c1622';
const BLUE = '#2246bd';
const BLUE_FAR = '#16307f';
const OUTLINE = '#05070d';
const EYE = '#f4f7ff';
const RIM = 'rgba(150, 200, 255, 0.5)';

const OUTLINE_PX = 1.6;
const GHOST_SPEED = 24; // m/s before the speed smear kicks in

export function createHeroPainter() {
  const up = createVectorSpring({ x: 0, y: 1 }, 9, 0.9);
  const lean = createSpring(0, 11, 0.55);
  const tuck = createSpring(0, 9, 0.7);
  const twist = createSpring(0, 10, 0.6);
  const look = createSpring(0, 14, 0.7);
  const history = [];

  function pose(state) {
    const want = poseTargets(state);
    const dt = state.dt;

    const posed = poseHero({
      ...state,
      up: up(want.up, dt),
      lean: lean(want.lean, dt),
      tuck: tuck(want.tuck, dt),
      twist: twist(want.twist, dt),
      look: look(want.look, dt),
    });

    history.push(posed);
    if (history.length > 5) history.shift();
    return posed;
  }

  function draw(ctx, camera, current, speed) {
    // A couple of stale poses behind him at speed. Cheaper than motion blur
    // and it reads better, because the shape you see is a shape he was in.
    if (speed > GHOST_SPEED) {
      const strength = Math.min((speed - GHOST_SPEED) / 26, 1);
      for (const [index, ghost] of history.slice(0, 2).entries()) {
        ctx.globalAlpha = strength * (0.1 + index * 0.07);
        silhouette(ctx, camera, ghost);
      }
      ctx.globalAlpha = 1;
    }

    figure(ctx, camera, current);
  }

  return { pose, draw };
}

function figure(ctx, camera, pose) {
  const to = (p) => worldToScreen(camera, p);
  const px = (fraction) => Math.max(fraction * pose.height * camera.zoom, 0.8);
  const [farLeg, nearLeg] = pose.legs;

  leg(ctx, to, px, farLeg, BLUE_FAR, RED_FAR, pose);
  arm(ctx, to, px, pose.freeArm, BLUE_FAR, RED_FAR);
  torso(ctx, to, px, pose);
  leg(ctx, to, px, nearLeg, BLUE, RED, pose);
  arm(ctx, to, px, pose.webArm, BLUE, RED);
  head(ctx, camera, pose);
}

// Just the trunk and skull, for the speed ghosts.
function silhouette(ctx, camera, pose) {
  const to = (p) => worldToScreen(camera, p);
  const px = (fraction) => Math.max(fraction * pose.height * camera.zoom, 0.8);
  const [pelvis, waist, chest, neck] = pose.spine.map(to);

  ctx.fillStyle = RED;
  fill(ctx, pelvis, waist, px(BODY.hipWidth), px(BODY.waistWidth));
  fill(ctx, waist, chest, px(BODY.waistWidth), px(BODY.chestWidth));
  fill(ctx, chest, neck, px(BODY.chestWidth), px(BODY.neckWidth));

  const skull = to(pose.head);
  ctx.beginPath();
  ctx.arc(skull.x, skull.y, px(BODY.headRadius), 0, Math.PI * 2);
  ctx.fill();
}

function torso(ctx, to, px, pose) {
  const [pelvis, waist, chest, neck] = pose.spine.map(to);

  bone(ctx, pelvis, waist, px(BODY.hipWidth), px(BODY.waistWidth), BLUE);
  bone(ctx, waist, chest, px(BODY.waistWidth), px(BODY.chestWidth), RED);
  bone(ctx, chest, neck, px(BODY.chestWidth), px(BODY.neckWidth), RED);

  emblem(ctx, chest, waist, px(BODY.chestWidth));
}

function arm(ctx, to, px, joints, sleeve, glove) {
  const [shoulder, elbow, hand] = joints.map(to);

  bone(ctx, shoulder, elbow, px(BODY.armWidth), px(BODY.armWidth * 0.85), sleeve);
  bone(ctx, elbow, hand, px(BODY.armWidth * 0.85), px(BODY.wristWidth), sleeve);
  blob(ctx, hand, px(BODY.handRadius), glove);
}

function leg(ctx, to, px, joints, trouser, boot) {
  const [hip, knee, ankle] = joints.map(to);

  bone(ctx, hip, knee, px(BODY.thighWidth), px(BODY.thighWidth * 0.78), trouser);
  bone(ctx, knee, ankle, px(BODY.thighWidth * 0.78), px(BODY.ankleWidth), trouser);

  // The foot points along the shin, so it swings with the leg for free.
  const shin = direction(knee, ankle);
  const toe = {
    x: ankle.x + shin.x * px(BODY.footLength),
    y: ankle.y + shin.y * px(BODY.footLength),
  };
  bone(ctx, ankle, toe, px(BODY.ankleWidth), px(BODY.ankleWidth * 0.8), boot);
}

function head(ctx, camera, pose) {
  const centre = worldToScreen(camera, pose.head);
  const radius = Math.max(pose.headRadius * camera.zoom, 1.5);

  ctx.save();
  ctx.translate(centre.x, centre.y);
  // Screen y points down, so the world up vector flips before it becomes an
  // angle. Rotating the canvas is far easier than rotating eye shapes by hand.
  ctx.rotate(pose.headAngle);

  // The mask is slightly taller than wide, which is what stops it reading as a
  // ball on a stick.
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.94 + OUTLINE_PX, radius * 1.06 + OUTLINE_PX, 0, 0, 7);
  ctx.fill();

  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.94, radius * 1.06, 0, 0, 7);
  ctx.fill();

  // Moonlight is up and to the left, same as the sky, so the highlight goes
  // on that edge.
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(radius * 0.14, 0.8);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.9, radius * 1.02, 0, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();

  eyes(ctx, radius);
  ctx.restore();
}

// Two angled almonds, tilted in toward the nose. The tilt is the entire
// difference between a mask and a pair of headlights.
function eyes(ctx, radius) {
  if (radius < 3.5) return;

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * radius * 0.4, -radius * 0.12);
    ctx.rotate(side * 0.38);

    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.4 + 1, radius * 0.26 + 1, 0, 0, 7);
    ctx.fill();

    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.4, radius * 0.26, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }
}

function emblem(ctx, chest, waist, width) {
  if (width < 4) return;

  const centre = { x: (chest.x * 0.65 + waist.x * 0.35), y: (chest.y * 0.65 + waist.y * 0.35) };
  const along = direction(waist, chest);
  const across = { x: -along.y, y: along.x };
  const size = width * 0.42;

  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, size * 0.5, size, Math.atan2(along.y, along.x), 0, 7);
  ctx.fill();

  // Four short legs either side, which is all a spider needs to be at this size.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(size * 0.22, 0.7);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const step of [-0.5, 0.5]) {
    for (const side of [-1, 1]) {
      const root = {
        x: centre.x + along.x * size * step,
        y: centre.y + along.y * size * step,
      };
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(root.x + across.x * side * size * 1.5, root.y + across.y * side * size * 1.5);
    }
  }
  ctx.stroke();
}

// A capsule that can be fatter at one end than the other, drawn outline first
// so each part separates from whatever is behind it.
function bone(ctx, a, b, wa, wb, colour) {
  ctx.fillStyle = OUTLINE;
  fill(ctx, a, b, wa + OUTLINE_PX, wb + OUTLINE_PX);
  ctx.fillStyle = colour;
  fill(ctx, a, b, wa, wb);
}

function fill(ctx, a, b, wa, wb) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);

  ctx.beginPath();
  ctx.arc(a.x, a.y, wa, angle + Math.PI / 2, angle - Math.PI / 2);
  ctx.arc(b.x, b.y, wb, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

function blob(ctx, at, radius, colour) {
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius + OUTLINE_PX, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function direction(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
