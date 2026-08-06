// Draws the world. Reads state, never changes it.
//
// Placeholder art for now. The city goes in next phase and the real character
// after that, so this is deliberately just enough to see the physics working.

import { worldToScreen } from './camera.js';

const SKY_TOP = '#060915';
const SKY_BOTTOM = '#131f3f';
const GRID = 'rgba(120, 165, 255, 0.055)';
const WEB = 'rgba(226, 236, 255, 0.9)';
const HERO = '#ff3352';
const ANCHOR = '#4de2ff';

export function drawScene(ctx, world, camera, view) {
  const { width, height } = camera;

  drawSky(ctx, width, height);
  drawGrid(ctx, camera, world.ground);
  drawGround(ctx, camera, world.ground, width, height);
  drawTrail(ctx, camera, view.trail);

  if (world.web.attached) drawWeb(ctx, camera, view.heroPos, world.web);
  if (view.aim) drawAim(ctx, camera, view.heroPos, view.aim, view.aimInRange);

  drawHero(ctx, camera, view.heroPos, world.hero.radius);
}

function drawSky(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
}

// World aligned grid, so movement is readable even with nothing else on screen.
// Spacing grows with distance so the lines stay a similar size as we zoom out.
function drawGrid(ctx, camera, ground) {
  const spacing = camera.zoom < 5 ? 40 : 20;
  const halfW = camera.width / 2 / camera.zoom;
  const halfH = camera.height / 2 / camera.zoom;

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();

  const startX = Math.floor((camera.pos.x - halfW) / spacing) * spacing;
  for (let x = startX; x < camera.pos.x + halfW; x += spacing) {
    const p = worldToScreen(camera, { x, y: 0 });
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, camera.height);
  }

  const startY = Math.max(Math.floor((camera.pos.y - halfH) / spacing) * spacing, ground);
  for (let y = startY; y < camera.pos.y + halfH; y += spacing) {
    const p = worldToScreen(camera, { x: 0, y });
    ctx.moveTo(0, p.y);
    ctx.lineTo(camera.width, p.y);
  }

  ctx.stroke();
}

function drawGround(ctx, camera, ground, width, height) {
  const y = worldToScreen(camera, { x: 0, y: ground }).y;
  if (y > height) return;

  ctx.fillStyle = '#03050c';
  ctx.fillRect(0, y, width, height - y);

  ctx.strokeStyle = 'rgba(77, 226, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
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

// Dashed line to wherever the pointer is, red once it is out of web range.
function drawAim(ctx, camera, heroPos, aim, inRange) {
  const from = worldToScreen(camera, heroPos);
  const to = worldToScreen(camera, aim);

  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = inRange ? 'rgba(77, 226, 255, 0.45)' : 'rgba(255, 80, 80, 0.3)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
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
