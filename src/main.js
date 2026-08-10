// Wiring. Canvas setup, input, and the frame loop that ties the fixed timestep
// physics to a variable rate display.

import { createWorld, step, attachWeb, releaseWeb, reelWeb } from './physics/world.js';
import { lerp } from './physics/vec.js';
import { createStepper } from './loop.js';
import { createCity, pickAnchor } from './world/city.js';
import { createCamera, updateCamera, screenToWorld } from './render/camera.js';
import { drawScene } from './render/scene.js';
import { createHud } from './ui/hud.js';
import { createStage } from './render/three/stage.js';
import { createCharacter } from './render/three/character.js';

const TRAIL_LENGTH = 48;
const TRAIL_INTERVAL = 0.02; // seconds between samples

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

// If WebGL is unavailable the flat painter takes over, so the page still runs
// rather than showing a city with nobody in it.
const stage = tryStage();

// Starts as the mannequin and swaps itself for the rigged mesh the moment one
// finishes loading, so the page is never waiting on an asset to be playable.
let character = null;
if (stage) {
  createCharacter().then((loaded) => {
    character = loaded;
    stage.scene.add(character.object);
  });
}

function tryStage() {
  try {
    return createStage(document.getElementById('stage3d'));
  } catch (error) {
    console.warn('no webgl, falling back to the flat character', error);
    return null;
  }
}

// ?seed=123 gives a different city. Same seed, same skyline, every time.
const seed = Number(new URLSearchParams(location.search).get('seed')) || undefined;

const world = createWorld();
const city = createCity(seed);
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
  camera.width = canvas.clientWidth || window.innerWidth;
  camera.height = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(camera.width * dpr);
  canvas.height = Math.round(camera.height * dpr);
  // Draw in CSS pixels and let the transform handle the device scaling, so
  // every other file can ignore retina displays entirely.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (stage) stage.resize(camera.width, camera.height, dpr);
}

function pointerWorld() {
  return pointer ? screenToWorld(camera, pointer) : null;
}

// Webs stick to buildings, not to the sky, so the cursor only chooses which
// reachable anchor to aim at.
function aimedAnchor() {
  const target = pointerWorld();
  if (!target) return null;
  return pickAnchor(city, world.hero.pos, target, world.params.maxWebRange, world.ground);
}

function shootWeb() {
  const anchor = aimedAnchor();
  if (anchor) attachWeb(world, anchor);
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

// Watching the canvas itself rather than the window catches every case, from
// a browser resize to a phone rotating to the pane it lives in changing size.
new ResizeObserver(resize).observe(canvas);

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
  const dt = Math.min(frameTime, 0.1);

  updateCamera(camera, world.hero, dt, world.ground);

  const pose = drawScene(ctx, world, camera, {
    flat: !stage,
    city,
    heroPos,
    trail,
    dt,
    aimAnchor: world.web.attached ? null : aimedAnchor(),
  });

  if (stage && character) {
    character.apply(pose, dt, world.hero.vel);
    stage.sync(camera);
    stage.render();
  }

  updateHud(world, frameTime);
  requestAnimationFrame(frame);
}

resize();
camera.pos = { ...world.hero.pos };
requestAnimationFrame(frame);
