// Draws the figure from the joint positions the rig worked out.
//
// Limbs are strokes with round caps, which is the cheapest way to get a limb
// that looks like it has thickness and joints that look like joints.

import { worldToScreen } from './camera.js';
import { poseHero, targetUp } from './rig.js';

const RED = '#d8202f';
const RED_DARK = '#94141f';
const BLUE = '#1d3f9e';
const BLUE_DARK = '#132a6d';
const EYE = '#f2f6ff';

// Limb thickness as a fraction of body height.
const ARM = 0.062;
const LEG = 0.076;
const TORSO = 0.15;

// How fast the body swings round to the direction it wants to face. Snapping
// straight to it makes him flick round the instant a web lets go.
const TURN_RATE = 9;

// Posing and drawing are separate calls because the scene needs the hand
// position before it draws the web. A web that starts at his centre of mass
// instead of the hand holding it is the sort of detail you notice without
// being able to say why.
export function createHeroPainter() {
  let up = { x: 0, y: 1 };

  function pose({ pos, vel, web, time, dt }) {
    up = ease(up, targetUp(pos, vel, web), 1 - Math.exp(-TURN_RATE * dt));
    return poseHero({ pos, vel, web, up, time });
  }

  function draw(ctx, camera, pose) {
    const px = (fraction) => Math.max(fraction * pose.height * camera.zoom, 1);

    const project = (points) => points.map((p) => worldToScreen(camera, p));
    const [farLeg, nearLeg] = pose.legs.map(project);

    // Back to front, so the limbs on the far side sit behind the body.
    limb(ctx, farLeg, px(LEG), BLUE_DARK);
    limb(ctx, project(pose.freeArm), px(ARM), RED_DARK);
    torso(ctx, camera, pose, px(TORSO));
    limb(ctx, nearLeg, px(LEG), BLUE);
    limb(ctx, project(pose.webArm), px(ARM), RED);
    head(ctx, camera, pose);
  }

  return { pose, draw };
}

function limb(ctx, points, width, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

// Red down to the waist, blue below it, drawn as one tapering stroke each so
// the join stays clean at any zoom.
function torso(ctx, camera, pose, width) {
  const neck = worldToScreen(camera, pose.neck);
  const chest = worldToScreen(camera, pose.chest);
  const pelvis = worldToScreen(camera, pose.pelvis);
  const waist = { x: (chest.x + pelvis.x) / 2, y: (chest.y + pelvis.y) / 2 };

  limb(ctx, [waist, pelvis], width * 0.85, BLUE);
  limb(ctx, [neck, waist], width, RED);
}

function head(ctx, camera, pose) {
  const centre = worldToScreen(camera, pose.head);
  const radius = Math.max(pose.headRadius * camera.zoom, 1.5);

  // Screen y points down, so the world up vector flips before it becomes an
  // angle. Rotating the canvas is far easier than rotating two eye shapes by
  // hand.
  const angle = Math.atan2(pose.up.x, pose.up.y);

  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(angle);

  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  if (radius > 4) {
    ctx.fillStyle = EYE;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * radius * 0.42, -radius * 0.1, radius * 0.36, radius * 0.24, 0, 0, 7);
      ctx.fill();
    }
  }

  ctx.restore();
}

const ease = (from, to, t) => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});
