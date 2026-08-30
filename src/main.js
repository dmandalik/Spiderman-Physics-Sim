// Wiring. Canvas setup, input, and the frame loop that ties the fixed timestep
// physics to a variable rate display.

import { createWorld, step, attachWeb, releaseWeb, reelWeb } from './physics/world.js';
import { assistForce, assistReel, assistReach } from './physics/assist.js';
import { lerp } from './physics/vec.js';
import { createStepper } from './loop.js';
import { createCity, pickAnchor, repaintCity } from './world/city.js';
import { createCamera, updateCamera, screenToWorld } from './render/camera.js';
import { drawScene } from './render/scene.js';
import { createHud } from './ui/hud.js';
import { createControls } from './ui/controls.js';
import { createTimeButton } from './ui/timeButton.js';
import { createTitle, createHints } from './ui/chrome.js';
import { labDefaults, modeSettings } from './physics/tunables.js';
import { loadAgent, createPilot } from './ml/agent.js';
import { resolveReel } from './ml/env.js';

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

// Both filled in only if the rigged renderer is asked for.
let stage = null;
let character = null;

// Loaded on demand rather than imported at the top of the file.
//
// three.js is one and a third megabytes and the pixel renderer, which is what
// everybody gets, never touches a line of it. A plain import at the top would
// still fetch and parse all of it before the first frame, so every visitor paid
// for a renderer hidden behind a query string they will never type. Behind a
// dynamic import it costs nothing at all unless somebody asks for it.
if (renderer === '3d') loadStage();

async function loadStage() {
  try {
    const [{ createStage }, { createCharacter }] = await Promise.all([
      import('./render/three/stage.js'),
      import('./render/three/character.js'),
    ]);

    stage = createStage(document.getElementById('stage3d'));
    resize();
    // Starts as the mannequin and swaps itself for the rigged mesh the moment
    // one finishes loading, so the page is never waiting on an asset.
    character = await createCharacter();
    stage.scene.add(character.object);
  } catch (error) {
    // If WebGL is unavailable the flat painter takes over, so the page still
    // runs rather than showing a city with nobody in it.
    console.warn('no webgl, falling back to the flat character', error);
    stage = null;
  }
}

// ?seed=123 gives a different city. Same seed, same skyline, every time.
const seed = Number(new URLSearchParams(location.search).get('seed')) || undefined;

// ?embed=1 is the version that sits in a card on a web page.
//
// It is the same simulation, not a cut down copy of it, and that is the point:
// what it shows is the trained policy flying the real physics rather than a
// looping recording of one. What changes is only what is on top of it. Nothing
// to read, nothing to press, no invitation to play, because a panel of readouts
// at three hundred and fifty pixels wide is unreadable and the whole surface is
// a link to somewhere it is readable.
const embedded = new URLSearchParams(location.search).get('embed') === '1';

const world = createWorld();
const city = createCity(seed);
const camera = createCamera();
const advance = createStepper();
const hud = createHud(document.getElementById('hud'));

// The lab's own copy of every number. Declared before the panel because the
// panel writes into it, and mutated in place from then on, never replaced: the
// solver holds this exact object while you are in lab mode and the controls
// close over it, so handing either of them a new one would leave them reading
// the old.
//
// It is reloaded from whichever mode you opened it from, which is a deliberate
// reversal. It used to persist, so that switching away and back kept whatever
// you had set up, and the cost of that was worse: opening the lab from heroic
// showed you real gravity and thin heroic air together, a world you had not
// been in and could not get back to. Starting from where you were is the more
// useful of the two, and the price is that a trip out to heroic and back loses
// an experiment.
const lab = labDefaults();
const controls = createControls(document.getElementById('lab'), lab, resetLab);
if (embedded) document.body.classList.add('embed');

// The live counter in the corner of an embed.
//
// Deliberately the two numbers that say what this is: how fast he is going, and
// how many arcs the policy has flown since the page loaded. A card that shows a
// figure moving could be a video; a card showing a swing count that goes up
// cannot be.
const embedTag = document.getElementById('embedTag');
let embedSwings = 0;
let embedWasAttached = false;

function updateEmbedTag() {
  if (!embedded || !embedTag) return;

  const attached = world.web.attached;
  if (attached && !embedWasAttached) embedSwings += 1;
  embedWasAttached = attached;

  const speed = Math.round(Math.hypot(world.hero.vel.x, world.hero.vel.y));
  embedTag.textContent = `${speed} m/s · ${embedSwings} swing${embedSwings === 1 ? '' : 's'}`;
}
// Changing the hour changes colours that are baked into the sprites, so every
// one of them is dropped and rebuilt. The budget keeps that off the frame.
createTimeButton(document.getElementById('corner'), () => repaintCity(city));

// The last two bits of smooth type on the screen, redrawn in the bitmap font.
// The subtitle says what the sim is rather than making a joke about it, and it
// now claims a trained agent because there is one: agent.json, four hundred and
// odd swings an episode, press A to watch it fly. The line read "built for
// reinforcement learning" while that was still only a promise.
createTitle(document.querySelector('.title'), 'Spider Swing', 'Rope physics, played by an agent trained with RL');
createHints(document.querySelector('.hints'), [
  { keys: ['A'], text: 'agent flies' },
  { keys: ['L'], text: 'lab' },
  { keys: ['M'], text: 'mode' },
  { keys: ['Click'], text: 'web' },
  { keys: ['W', 'S'], text: 'reel' },
  { keys: ['Space'], text: 'toggle' },
  { keys: ['H'], text: 'hide' },
  { keys: ['R'], text: 'reset' },
]);

// The trained agent, once it has been asked for. Null until then, so a build
// with no agent.json beside it still runs exactly as before.
let pilot = null;
let agent = null;

// Hands the controls to the policy, or takes them back.
//
// Heroic mode, because that is the only world it was trained in. Switching it on
// anywhere else would be watching an agent fly a world it has never seen and
// concluding something about it.
//
// Pressing A means one thing at every moment: if anything is loading or flying,
// stop. Otherwise start.
//
// The guard is not paperwork. Fetching the weights is asynchronous, so a second
// press that landed while the first was still loading used to find the pilot
// still unset, start a second load, and end with both of them installing one.
// Press A twice quickly and you were further into agent mode rather than out
// of it, with no way back except pressing it an odd number of times.
let loadingAgent = false;
let cancelled = false;

async function toggleAgent() {
  if (pilot) {
    releaseAgent();
    return;
  }
  if (loadingAgent) {
    cancelled = true;
    return;
  }

  loadingAgent = true;
  cancelled = false;

  let loaded;
  try {
    loaded = agent || await loadAgent();
  } catch (error) {
    console.warn('no trained agent to watch', error);
    loadingAgent = false;
    return;
  }

  loadingAgent = false;
  agent = loaded;
  if (cancelled) {
    cancelled = false;
    return;
  }

  setMode('heroic');
  pilot = createPilot(agent, world, city, assistSettings());
}

// Giving the controls back, and letting go of the rope on the way out.
//
// Dropping the web matters more than it sounds. Without it you take over
// halfway through somebody else's swing, still attached to a rooftop you did
// not choose, and the flight carries on for a second or two exactly as it was.
// Pressing A then appears to have done nothing, which is most of what made this
// feel like it was not working.
function releaseAgent() {
  if (!pilot) return;
  pilot = null;
  releaseWeb(world);
}

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

let lastFrame = performance.now();

// What the solver reads this frame. Assigning the whole object rather than
// copying values across is what makes a slider take effect immediately: the lab
// panel writes into the very object the solver is about to read.
function applyMode() {
  // Real air is thick enough to matter. Heroic air is not, heroic gravity pulls
  // harder so the falls do not float, and the heroic clock runs a little fast so
  // an arc does not outstay its welcome. All of that lives in modeSettings,
  // which the trainer reads too.
  world.params = mode === 'lab' ? lab.params : modeSettings(mode).params;
}

function assistSettings() {
  return mode === 'lab' ? lab.assist : modeSettings(mode).assist;
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

// Where the marker goes: the agent's aim when it is flying, the cursor when you
// are. One function so the two can never be drawn differently.
function agentOrPointerAnchor() {
  if (!pilot) return aimedAnchor();
  const target = pilot.target;
  if (!target) return null;
  const settings = assistSettings();
  const range = settings.enabled ? assistReach(world.params, settings) : world.params.maxWebRange;
  return pickAnchor(city, world.hero.pos, target, range, world.ground, world.hero.vel.x);
}

function shootWeb() {
  const anchor = aimedAnchor();
  if (anchor) attachWeb(world, anchor);
}

canvas.addEventListener('pointermove', (e) => {
  if (embedded) return;
  pointer = { x: e.offsetX, y: e.offsetY };
});

canvas.addEventListener('pointerdown', (e) => {
  if (embedded) return;
  canvas.setPointerCapture(e.pointerId);
  pointer = { x: e.offsetX, y: e.offsetY };
  shootWeb();
});

canvas.addEventListener('pointerup', () => {
  if (!embedded) releaseWeb(world);
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
});

// An embed flies itself. It waits for the weights, then never gives the keyboard
// or the pointer a say, so it cannot be left in a state nobody asked for by a
// stray click from the page around it.
if (embedded) toggleAgent();

window.addEventListener('keydown', (e) => {
  if (embedded) return;
  if (e.code === 'KeyW' || e.code === 'ArrowUp') reelDirection = -1;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') reelDirection = 1;
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyM') setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  if (e.code === 'KeyL') setMode(mode === 'lab' ? 'real' : 'lab');
  if (e.code === 'KeyH') hud.toggle();
  if (e.code === 'KeyA') toggleAgent();
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
  // Opening the lab loads whatever you were just flying, so the first thing you
  // see is the world you were in rather than a different one. Assigned into the
  // existing objects rather than over them, because the solver and the panel are
  // both holding references to these.
  if (next === 'lab' && mode !== 'lab') {
    const from = modeSettings(mode);
    Object.assign(lab.params, from.params);
    Object.assign(lab.assist, from.assist);
  }

  mode = next;
  applyMode();
  // show() refreshes the panel on the way in, so the sliders land on whatever
  // was just loaded rather than on where they were left last time.
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

  // The agent presses the buttons; the loop below is untouched by it. Driving
  // it on simulated time rather than on frame time keeps its twenty decisions a
  // second true whatever the display is doing, and true through the heroic time
  // scale as well.
  if (pilot) pilot.update(frameTime * world.params.timeScale);

  const { alpha } = advance(frameTime * world.params.timeScale, (dt) => {
    // Reeling by hand always wins, so the assist never fights the player.
    const settings = assistSettings();
    const reel = pilot ? pilot.reel : reelDirection;
    world.applied = settings.enabled ? assistForce(world, settings) : ZERO;
    reelWeb(world, resolveReel(world, settings, reel), dt);
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
    aimAnchor: world.web.attached ? null : agentOrPointerAnchor(),
  });

  if (stage && character) {
    character.apply(pose, dt, world.hero.vel);
    stage.sync(camera);
    stage.render();
  }

  hud.update(world, frameTime, pilot ? 'agent' : mode);
  updateEmbedTag();
  requestAnimationFrame(frame);
}

resize();
setMode(mode);
camera.pos = { ...world.hero.pos };
requestAnimationFrame(frame);
