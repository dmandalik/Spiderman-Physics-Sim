// Wiring. Canvas setup, input, and the frame loop that ties the fixed timestep
// physics to a variable rate display.

import { createWorld, step, attachWeb, releaseWeb, reelWeb } from './physics/world.js';
import { lerp } from './physics/vec.js';
import { createStepper } from './loop.js';
import { createCamera, updateCamera, screenToWorld } from './render/camera.js';
import { drawScene } from './render/scene.js';
import { createHud } from './ui/hud.js';

const TRAIL_LENGTH = 48;
const TRAIL_INTERVAL = 0.02; // seconds between samples

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const world = createWorld();
const camera = createCamera();
const advance = createStepper();
const updateHud = createHud(document.getElementById('hud'));

const trail = [];
let trailClock = 0;
let pointer = null; // last pointer position in screen pixels
let reelDirection = 0; // -1 reels in, +1 pays out
let lastFrame = performance.now();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  camera.width = canvas.clientWidth;
  camera.height = canvas.clientHeight;
  canvas.width = Math.round(camera.width * dpr);
  canvas.height = Math.round(camera.height * dpr);
  // Draw in CSS pixels and let the transform handle the device scaling, so
  // every other file can ignore retina displays entirely.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function pointerWorld() {
  return pointer ? screenToWorld(camera, pointer) : null;
}

function shootWeb() {
  const target = pointerWorld();
  if (target) attachWeb(world, target);
}

canvas.addEventListener('pointermove', (e) => {
  pointer = { x: e.offsetX, y: e.offsetY };
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointer = { x: e.offsetX, y: e.offsetY };
  shootWeb();
});

canvas.addEventListener('pointerup', () => releaseWeb(world));
canvas.addEventListener('pointerleave', () => {
  pointer = null;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') reelDirection = -1;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') reelDirection = 1;
  if (e.code === 'KeyR') reset();
  if (e.code === 'Space') {
    e.preventDefault();
    world.web.attached ? releaseWeb(world) : shootWeb();
  }
});

window.addEventListener('keyup', (e) => {
  const releasing = ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'].includes(e.code);
  if (releasing) reelDirection = 0;
});

window.addEventListener('resize', resize);

function reset() {
  const fresh = createWorld(world.params);
  world.hero = fresh.hero;
  world.web = fresh.web;
  world.tension = 0;
  world.time = 0;
  trail.length = 0;
  camera.pos = { ...world.hero.pos };
}

function frame(now) {
  const frameTime = (now - lastFrame) / 1000;
  lastFrame = now;

  const { alpha } = advance(frameTime * world.params.timeScale, (dt) => {
    reelWeb(world, reelDirection, dt);
    step(world, dt);

    trailClock += dt;
    if (trailClock >= TRAIL_INTERVAL) {
      trailClock = 0;
      trail.push({ ...world.hero.pos });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }
  });

  // The physics has already moved past the moment we are drawing, so blend the
  // last two states. Without this a 60 Hz display shows a 240 Hz simulation
  // stepping in visible jumps.
  const heroPos = lerp(world.hero.prevPos, world.hero.pos, alpha);

  updateCamera(camera, world.hero, Math.min(frameTime, 0.1), world.ground);

  const aim = pointerWorld();
  drawScene(ctx, world, camera, {
    heroPos,
    trail,
    aim,
    aimInRange: aim
      ? Math.hypot(aim.x - heroPos.x, aim.y - heroPos.y) <= world.params.maxWebRange
      : false,
  });

  updateHud(world, frameTime);
  requestAnimationFrame(frame);
}

resize();
camera.pos = { ...world.hero.pos };
requestAnimationFrame(frame);
