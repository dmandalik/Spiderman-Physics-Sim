// Sky, stars and moon. Everything here sits behind the city.
//
// Stars are drawn in screen space and drift by a few percent of the camera,
// because anything that far away barely moves at all. Running them through the
// normal parallax would squash them down onto the horizon instead.

import { mulberry32 } from '../world/random.js';

const STAR_COUNT = 180;
const DRIFT = 0.05; // fraction of camera movement the stars pick up
const STAR_BAND = 0.78; // keep them out of the bottom of the frame

// Positions are stored as fractions of the viewport so a resize does not
// rebuild the field or move the stars around.
const stars = buildStars();

function buildStars() {
  const rng = mulberry32(90210);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    size: 0.4 + rng() * 1.1,
    alpha: 0.15 + rng() * 0.6,
  }));
}

export function drawSky(ctx, camera) {
  const { width, height } = camera;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1f3d78');
  gradient.addColorStop(0.55, '#8f83ab');
  gradient.addColorStop(1, '#f2c286');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawStars(ctx, camera);
  drawMoon(ctx, width * 0.18, height * 0.2, Math.min(width, height) * 0.035);
}

function drawStars(ctx, camera) {
  const { width, height } = camera;
  const band = height * STAR_BAND;
  const offsetX = mod(-camera.pos.x * DRIFT, width);
  const offsetY = mod(camera.pos.y * DRIFT, band);

  ctx.fillStyle = '#ffe9c4';
  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillRect(
      mod(star.x * width + offsetX, width),
      mod(star.y * band + offsetY, band),
      star.size,
      star.size,
    );
  }
  ctx.globalAlpha = 1;
}

function drawMoon(ctx, x, y, radius) {
  const halo = ctx.createRadialGradient(x, y, radius, x, y, radius * 6);
  halo.addColorStop(0, 'rgba(255, 216, 150, 0.34)');
  halo.addColorStop(1, 'rgba(255, 208, 150, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius * 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff4dd';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Bite a crescent out with a second circle in the sky colour behind it.
  ctx.fillStyle = '#ffe9c4';
  ctx.beginPath();
  ctx.arc(x + radius * 0.42, y - radius * 0.3, radius * 0.94, 0, Math.PI * 2);
  ctx.fill();
}

const mod = (value, span) => ((value % span) + span) % span;
