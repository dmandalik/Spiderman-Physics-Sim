// Draws the world. Reads state, never changes it.

import { worldToScreen } from './camera.js';
import { drawCity } from './city.js';
import { drawSky } from './sky.js';

const WEB = 'rgba(226, 236, 255, 0.9)';
const HERO = '#ff3352';
const ANCHOR = '#4de2ff';
const LAMP_SPACING = 34; // metres between street lights

export function drawScene(ctx, world, camera, view) {
  const { width, height } = camera;

  drawSky(ctx, camera);
  drawCity(ctx, view.city, camera, world.ground);
  drawStreet(ctx, camera, world.ground, width, height);
  drawTrail(ctx, camera, view.trail);

  if (world.web.attached) drawWeb(ctx, camera, view.heroPos, world.web);
  if (view.aimAnchor) drawAimAnchor(ctx, camera, view.heroPos, view.aimAnchor);

  drawHero(ctx, camera, view.heroPos, world.hero.radius);
}

function drawStreet(ctx, camera, ground, width, height) {
  const y = worldToScreen(camera, { x: 0, y: ground }).y;
  if (y > height) return;

  // Sodium light bouncing off the haze at street level. Cheap, and it stops
  // the bottom of the frame reading as a flat black bar.
  const glow = ctx.createLinearGradient(0, y - camera.zoom * 26, 0, y);
  glow.addColorStop(0, 'rgba(255, 176, 102, 0)');
  glow.addColorStop(1, 'rgba(255, 176, 102, 0.09)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, y - camera.zoom * 26, width, camera.zoom * 26);

  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, y, width, height - y);

  ctx.strokeStyle = 'rgba(77, 226, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  drawLamps(ctx, camera, ground, y);
}

// Evenly spaced pools of light along the street. Snapping to a world aligned
// grid means they slide past at the right speed instead of being painted on
// the screen and following the camera.
function drawLamps(ctx, camera, ground, streetY) {
  const half = camera.width / 2 / camera.zoom;
  const first = Math.floor((camera.pos.x - half) / LAMP_SPACING) * LAMP_SPACING;

  ctx.fillStyle = 'rgba(255, 208, 140, 0.5)';
  for (let x = first; x < camera.pos.x + half; x += LAMP_SPACING) {
    const p = worldToScreen(camera, { x, y: ground + 6 });
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(camera.zoom * 0.35, 1), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 190, 120, 0.06)';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - camera.zoom * 4, streetY);
    ctx.lineTo(p.x + camera.zoom * 4, streetY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 208, 140, 0.5)';
  }
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

    ctx.strokeStyle = `rgba(255, 78, 106, ${t * 0.5})`;
    ctx.lineWidth = t * 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawWeb(ctx, camera, heroPos, web) {
  const anchor = worldToScreen(camera, web.anchor);
  const hero = worldToScreen(camera, heroPos);

  ctx.strokeStyle = WEB;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y);
  ctx.lineTo(hero.x, hero.y);
  ctx.stroke();

  ctx.fillStyle = ANCHOR;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Shows which anchor a web would actually grab, since aiming snaps to the
// nearest reachable one rather than sticking wherever the cursor sits.
function drawAimAnchor(ctx, camera, heroPos, anchor) {
  const from = worldToScreen(camera, heroPos);
  const to = worldToScreen(camera, anchor);

  ctx.save();
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = 'rgba(77, 226, 255, 0.4)';
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

function drawHero(ctx, camera, pos, radius) {
  const p = worldToScreen(camera, pos);
  const r = Math.max(radius * camera.zoom, 4);

  const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
  glow.addColorStop(0, 'rgba(255, 51, 82, 0.5)');
  glow.addColorStop(1, 'rgba(255, 51, 82, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = HERO;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}
