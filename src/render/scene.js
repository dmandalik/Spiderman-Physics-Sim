// Draws the world. Reads state, never changes it.

import { worldToScreen } from './camera.js';
import { drawCity } from './city.js';
import { drawStreetscape } from './streetscape.js';
import { startSpriteFrame } from './pixel/sprite.js';
import { drawSky } from './sky.js';
import { createHeroPainter } from './hero.js';
import { drawPixelHero, wristPosition, poseCell } from './pixel/painter.js';
import { selectPose } from './pixel/select.js';

const WEB = '#fdfcff';
const WEB_EDGE = '#1b1116';
const ANCHOR = '#ffbe6a';
const WEB_TIP = '#ffe9c4';

// How long the strand takes to fly out. Long enough to actually watch, short
// enough that the swing has barely begun by the time it lands.
const SHOOT_TIME = 0.18; // seconds
// The shot leaves the wrist fast and eases into the wall rather than running at
// a constant speed, which is what makes it read as thrown instead of extruded.
const SHOOT_EASE = 0.65;
// How long the splat at the far end lasts once the strand arrives.
const SPLAT_TIME = 0.16; // seconds

const paintHero = createHeroPainter();

export function drawScene(ctx, world, camera, view) {
  // Resets the allowance for making sprites that do not exist yet, so the cap
  // is per frame rather than per city.
  startSpriteFrame();

  drawSky(ctx, camera);
  drawCity(ctx, view.city, camera, world.ground);
  // The shops go over the bases of the towers, the way the reference stacks a
  // terrace in front of a skyline, and he passes in front of all of it.
  drawStreetscape(ctx, view.city, camera, world.ground);
  drawTrail(ctx, camera, view.trail);

  const pose = paintHero.pose({
    pos: view.heroPos,
    vel: world.hero.vel,
    web: world.web,
    time: world.time,
    dt: view.dt,
  });

  if (view.mode === 'pixel') {
    const pixelPose = { pos: view.heroPos, up: pose.up };
    const poseName = selectPose({ web: world.web, vel: world.hero.vel, time: world.time });

    // Drawn before the figure, so the line ends behind his glove rather than
    // crossing over the top of it.
    if (world.web.attached) {
      drawWeb(ctx, camera, wristPosition(pixelPose, poseName), world.web,
        Math.max(poseCell(poseName) * camera.zoom, 1), world.time - world.web.since);
    }
    if (view.aimAnchor) drawAimAnchor(ctx, camera, view.heroPos, view.aimAnchor);

    drawPixelHero(ctx, camera, pixelPose, poseName);
    return pose;
  }

  // Anchored at the hand, not at the centre of mass.
  if (world.web.attached) drawWeb(ctx, camera, pose.webArm[2], world.web, 2);
  if (view.aimAnchor) drawAimAnchor(ctx, camera, view.heroPos, view.aimAnchor);

  // The rigged character lives on the WebGL layer above this one. The flat
  // painter stays as the fallback for anything that cannot give us a context.
  if (view.flat) {
    paintHero.draw(ctx, camera, pose, Math.hypot(world.hero.vel.x, world.hero.vel.y));
  }

  return pose;
}

// Older points are both fainter and thinner, which reads as speed without
// needing a particle system.
function drawTrail(ctx, camera, trail) {
  if (!trail || trail.length < 2) return;

  ctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i += 1) {
    const t = i / trail.length;
    const a = worldToScreen(camera, trail[i - 1]);
    const b = worldToScreen(camera, trail[i]);

    // Faint on purpose. Now that there is a real figure to look at, a bold
    // streak through his chest reads as a mistake rather than as speed.
    ctx.strokeStyle = `rgba(255, 96, 120, ${t * t * 0.16})`;
    ctx.lineWidth = t * 2.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// A web under tension is a straight line. A slack one hangs, and how far it
// hangs is exactly how much longer the web is than the gap it spans, so the
// curve is reading the same number the solver is.
//
// Drawn as blocks rather than stroked, in cells the same size as the ones he is
// made of, and snapped to that grid. A smooth antialiased line beside a chunky
// pixel figure reads as two different drawings sharing a screen.
function drawWeb(ctx, camera, handPos, web, cell, age = Infinity) {
  const anchor = worldToScreen(camera, web.anchor);
  const hero = worldToScreen(camera, handPos);

  const span = Math.hypot(handPos.x - web.anchor.x, handPos.y - web.anchor.y);
  const slack = Math.max(web.restLength - span, 0);
  const sag = Math.min(slack * 0.45, web.restLength * 0.35) * camera.zoom;

  // Walked from his glove outward, so a partly flown strand is simply the front
  // of the list. Sag only appears once it has landed, because a strand still in
  // the air is taut by definition.
  const flown = Math.min(age / SHOOT_TIME, 1) ** SHOOT_EASE;
  const bend = {
    x: (anchor.x + hero.x) / 2,
    y: (anchor.y + hero.y) / 2 + (flown >= 1 && sag > 1 ? sag : 0),
  };

  const length = Math.hypot(hero.x - anchor.x, hero.y - anchor.y) + sag;
  const steps = Math.max(Math.ceil(length / cell) * 2, 2);
  const blocks = [];
  const seen = new Set();

  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * flown;
    const u = 1 - t;
    const x = u * u * hero.x + 2 * u * t * bend.x + t * t * anchor.x;
    const y = u * u * hero.y + 2 * u * t * bend.y + t * t * anchor.y;

    const col = Math.round(x / cell);
    const row = Math.round(y / cell);
    const key = `${col},${row}`;
    if (seen.has(key)) continue;

    seen.add(key);
    blocks.push({ x: col * cell, y: row * cell });
  }

  // Dark first so the whole strand carries an edge, the same way every shape on
  // him does, then the bright core over the top.
  ctx.fillStyle = WEB_EDGE;
  for (const b of blocks) ctx.fillRect(b.x - cell * 0.5, b.y - cell * 0.5, cell * 2, cell * 2);

  ctx.fillStyle = WEB;
  for (const b of blocks) ctx.fillRect(b.x, b.y, cell, cell);

  if (flown < 1) {
    drawMuzzle(ctx, hero, cell, flown);
    drawHead(ctx, blocks, cell);
    return;
  }

  // The anchor point gets the same treatment, a block rather than a circle, and
  // only once the strand has actually reached it.
  ctx.fillStyle = WEB_EDGE;
  ctx.fillRect(anchor.x - cell * 1.5, anchor.y - cell * 1.5, cell * 3, cell * 3);
  ctx.fillStyle = ANCHOR;
  ctx.fillRect(anchor.x - cell, anchor.y - cell, cell * 2, cell * 2);

  const landed = age - SHOOT_TIME;
  if (landed < SPLAT_TIME) drawSplat(ctx, anchor, cell, landed / SPLAT_TIME);
}

// The puff at his wrist as the strand leaves it. A cross rather than a square,
// because a square at the hand just reads as one more web block.
function drawMuzzle(ctx, hand, cell, flown) {
  const life = 1 - Math.min(flown / 0.4, 1);
  if (life <= 0) return;

  const arm = cell * (1 + life * 3);
  ctx.globalAlpha = life;
  ctx.fillStyle = WEB_TIP;
  ctx.fillRect(hand.x - cell * 0.5, hand.y - arm, cell, arm * 2);
  ctx.fillRect(hand.x - arm, hand.y - cell * 0.5, arm * 2, cell);
  ctx.globalAlpha = 1;
}

// A hot head on the front of the strand while it is still travelling, so the
// eye follows the shot out rather than noticing a line appear. Three blocks
// deep, brightest at the very front, which is enough to read as motion.
function drawHead(ctx, blocks, cell) {
  const head = blocks.slice(-3);
  if (!head.length) return;

  ctx.fillStyle = WEB_TIP;
  for (const b of head) ctx.fillRect(b.x - cell * 0.5, b.y - cell * 0.5, cell * 2, cell * 2);

  const tip = head[head.length - 1];
  ctx.fillRect(tip.x - cell * 1.5, tip.y - cell * 1.5, cell * 3, cell * 3);
}

// Web hitting brick. Eight specks thrown outward from the point of impact,
// snapped to the same grid as everything else and gone in a sixth of a second.
function drawSplat(ctx, anchor, cell, t) {
  const radius = cell * (1.5 + t * 3);

  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = WEB_TIP;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.round((anchor.x + Math.cos(a) * radius) / cell) * cell;
    const y = Math.round((anchor.y + Math.sin(a) * radius) / cell) * cell;
    ctx.fillRect(x, y, cell, cell);
  }
  ctx.globalAlpha = 1;
}

// Shows which anchor a web would actually grab, since aiming snaps to the
// nearest reachable one rather than sticking wherever the cursor sits.
function drawAimAnchor(ctx, camera, heroPos, anchor) {
  const from = worldToScreen(camera, heroPos);
  const to = worldToScreen(camera, anchor);

  ctx.save();
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = 'rgba(255, 180, 110, 0.45)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = ANCHOR;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(to.x, to.y, 7, 0, Math.PI * 2);
  ctx.stroke();
}

