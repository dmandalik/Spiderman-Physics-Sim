// Wiring. Canvas setup, input, and the frame loop that ties the fixed timestep
// physics to a variable rate display.

import { createWorld, step, attachWeb, releaseWeb, reelWeb, DEFAULT_PARAMS } from './physics/world.js';
import { assistForce, assistReel, assistReach, HEROIC } from './physics/assist.js';
import { lerp } from './physics/vec.js';
import { createStepper } from './loop.js';
import { createCity, pickAnchor, repaintCity } from './world/city.js';
import { createCamera, updateCamera, screenToWorld } from './render/camera.js';
import { drawScene } from './render/scene.js';
import { createHud } from './ui/hud.js';
import { createControls } from './ui/controls.js';
import { createTimeButton } from './ui/timeButton.js';
import { createTitle, createHints } from './ui/chrome.js';
import { labDefaults } from './physics/tunables.js';
import { createStage } from './render/three/stage.js';
import { createCharacter } from './render/three/character.js';

const ZERO = { x: 0, y: 0 };

const TRAIL_LENGTH = 48;
const TRAIL_INTERVAL = 0.02; // seconds between samples

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

// If WebGL is unavailable the flat painter takes over, so the page still runs
// rather than showing a city with nobody in it.
// Pixel art by default. The rigged model is kept behind ?render=3d rather than
// deleted, so the two can be compared without digging through history.
const renderer = new URLSearchParams(location.search).get('render') === '3d' ? '3d' : 'pixel';

const stage = renderer === '3d' ? tryStage() : null;

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
const hud = createHud(document.getElementById('hud'));

// The lab's own copy of every number, so switching away and back keeps whatever
// you set up. Declared before the panel because the panel writes into it.
const lab = labDefaults();
const controls = createControls(document.getElementById('lab'), lab, resetLab);
// Changing the hour changes colours that are baked into the sprites, so every
// one of them is dropped and rebuilt. The budget keeps that off the frame.
createTimeButton(document.getElementById('corner'), () => repaintCity(city));

// The last two bits of smooth type on the screen, redrawn in the bitmap font.
createTitle(document.querySelector('.title'), 'Spider Swing', 'A pendulum in a mask');
createHints(document.querySelector('.hints'), [
  { keys: ['Click'], text: 'web' },
  { keys: ['W', 'S'], text: 'reel' },
  { keys: ['Space'], text: 'toggle' },
  { keys: ['M'], text: 'mode' },
  { keys: ['L'], text: 'lab' },
  { keys: ['H'], text: 'hide' },
  { keys: ['R'], text: 'reset' },
]);

const trail = [];
let trailClock = 0;
let pointer = null; // last pointer position in screen pixels
let reelDirection = 0; // -1 reels in, +1 pays out

// Three modes, and they differ in one thing: who decides the numbers.
//
// Real is the honest simulation. Heroic keeps the same solver but thins the air,
// pulls harder and lets him pump the swing along the web. Lab hands the whole
// parameter set to you, which is the only one of the three where the physics can
// be wrong on purpose, and that is the point of it.
const MODES = ['real', 'heroic', 'lab'];
let mode = 'real';

const REAL_ASSIST = { ...HEROIC, enabled: false };
const HEROIC_ASSIST = { ...HEROIC, enabled: true };

let lastFrame = performance.now();

// What the solver reads this frame. Assigning the whole object rather than
// copying values across is what makes a slider take effect immediately: the lab
// panel writes into the very object the solver is about to read.
function applyMode() {
  if (mode === 'lab') {
    world.params = lab.params;
    return;
  }

  world.params = {
    ...DEFAULT_PARAMS,
    // Real air is thick enough to matter. Heroic air is not, and heroic gravity
    // pulls harder so the falls do not float.
    ...(mode === 'heroic' ? { drag: HEROIC.drag, gravity: HEROIC.gravity } : {}),
  };
}

function assistSettings() {
  if (mode === 'lab') return lab.assist;
  return mode === 'heroic' ? HEROIC_ASSIST : REAL_ASSIST;
}

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
  const settings = assistSettings();
  const range = settings.enabled ? assistReach(world.params, settings) : world.params.maxWebRange;
  // Passing which way he is going lets the pick favour anchors ahead of him.
  return pickAnchor(city, world.hero.pos, target, range, world.ground, world.hero.vel.x);
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
  if (e.code === 'KeyM') setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  if (e.code === 'KeyL') setMode(mode === 'lab' ? 'real' : 'lab');
  if (e.code === 'KeyH') hud.toggle();
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

function setMode(next) {
  mode = next;
  applyMode();
  controls.show(mode === 'lab');
}

// Puts every knob back where the honest simulation has it, without leaving lab
// mode, so you can undo an experiment rather than having to remember what it
// was before you started.
function resetLab() {
  const fresh = labDefaults();
  Object.assign(lab.params, fresh.params);
  Object.assign(lab.assist, fresh.assist);
  controls.refresh();
}

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
    // Reeling by hand always wins, so the assist never fights the player.
    const settings = assistSettings();
    world.applied = settings.enabled ? assistForce(world, settings) : ZERO;
    reelWeb(world, reelDirection || (settings.enabled ? assistReel(world, settings) : 0), dt);
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
    mode: renderer,
    flat: renderer === '3d' && !stage,
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

  hud.update(world, frameTime, mode);
  requestAnimationFrame(frame);
}

resize();
setMode(mode);
camera.pos = { ...world.hero.pos };
requestAnimationFrame(frame);
