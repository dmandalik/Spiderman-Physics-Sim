// The simulation, wrapped as something an agent can be trained against.
//
// Nothing here is new physics. It is the same solver, the same city and the
// same heroic assist the game runs, driven by four numbers instead of by a
// mouse, and reporting back what happened as a number instead of as a picture.
// That is the whole point: an agent that learns here has learned the game, not
// a simplified copy of it that behaves differently when you go and watch it.
//
// Three rates, and keeping them apart matters:
//
//   The solver steps at 240 Hz, because that is what the physics needs.
//   The agent decides at 20 Hz, because that is all a human does and it makes
//     an episode twelve times cheaper to run.
//   An episode is 45 simulated seconds, which is twenty or so swings, long
//     enough that a policy which only looks good for one arc is found out.
//
// Measured at 3.1 ms per episode, so a generation of sixty four policies on
// three cities is about six tenths of a second on one core. That number is why
// the trainer can be a search rather than a gradient method.

import { createWorld, step, attachWeb, releaseWeb, reelWeb, DEFAULT_PARAMS } from '../physics/world.js';
import { assistForce, assistReel, assistReach, HEROIC } from '../physics/assist.js';
import { createCity, buildingsBetween, pickAnchor, NEAR_LAYER } from '../world/city.js';
import { vec } from '../physics/vec.js';

const DT = 1 / 240;
export const STEPS_PER_DECISION = 12; // 20 decisions a second
export const EPISODE_SECONDS = 45;

// What the observation divides by. Written down rather than inlined because
// every one of them is a claim about the scale of the thing: speeds run to
// about forty, useful heights to about a hundred.
const SCALE = { speed: 40, height: 100, rate: 2 };

// How far ahead the skyline sensor looks, in metres, and in how many bins.
//
// This is the agent's eyes. Without it there is nothing in the observation that
// says where a building is, and no amount of training can fix that: a policy
// can only be a function of what it is shown. Four bins is a coarse view on
// purpose, because every extra number is another row of policy parameters for
// the search to find.
export const SKYLINE_BINS = 4;
const SKYLINE_REACH = 120; // metres ahead

export const OBS_SIZE = 4 + 4 + SKYLINE_BINS + 1;
export const ACTION_SIZE = 4;

// Where the aim can point, measured from the direction he is travelling.
//
// Both ends are deliberate. A web fired below the horizon can only pull him
// down, and one fired straight up cannot be reached, so the range is the arc
// that is actually useful. Slightly behind is allowed because sometimes the
// only rooftop in reach is one he has just passed.
const AIM = { low: -0.35, high: 1.25 }; // radians above the direction of travel
const RANGE = { near: 0.35, far: 1 }; // as a fraction of how far he can fire

export function createEnv({ seed = 1, params = {}, assist = HEROIC } = {}) {
  const world = createWorld({ ...DEFAULT_PARAMS, drag: assist.drag, gravity: assist.gravity, ...params });
  const city = createCity(seed);
  const reach = assistReach(world.params, assist);

  // Everything the reward needs to remember between decisions.
  const memory = { lastAim: 0, arcStart: 0, arcs: [], event: 0, grounded: false };

  world.hero.pos = vec(0, 88);
  world.hero.vel = vec(26, 0);

  return { world, city, assist, reach, memory };
}

// The same wrapper around a world and a city that already exist.
//
// The game owns its world; the trainer makes its own. Both need the handful of
// extra things an observation is read from, and this is the one place that
// knows what those are.
export function wrapEnv(world, city, assist = HEROIC) {
  return {
    world,
    city,
    assist,
    reach: assistReach(world.params, assist),
    memory: { lastAim: 0, arcStart: 0, arcs: [], event: 0, grounded: false },
  };
}

// The skyline he can see: the tallest rooftop in each bin ahead of him.
//
// Read off the anchors rather than off the building heights, because an anchor
// is what he can actually web to. A tower with no reachable ledge is not a
// place to aim however tall it is.
function skyline(env) {
  const { world, city } = env;
  const forward = world.hero.vel.x >= 0 ? 1 : -1;
  const from = world.hero.pos.x;

  const bins = new Array(SKYLINE_BINS).fill(0);
  const width = SKYLINE_REACH / SKYLINE_BINS;

  const lo = forward > 0 ? from : from - SKYLINE_REACH;
  const buildings = buildingsBetween(city, NEAR_LAYER, lo, lo + SKYLINE_REACH, world.ground);

  for (const building of buildings) {
    for (const anchor of building.anchors) {
      const ahead = (anchor.x - from) * forward;
      if (ahead < 0 || ahead >= SKYLINE_REACH) continue;
      const bin = Math.floor(ahead / width);
      // Relative to him, not to the ground. What matters when you are choosing
      // where to aim is how far above you it is.
      const rise = (anchor.y - world.hero.pos.y) / SCALE.height;
      if (rise > bins[bin]) bins[bin] = rise;
    }
  }

  return bins;
}

export function observe(env) {
  const { world, reach } = env;
  const { hero, web } = world;

  const speed = Math.hypot(hero.vel.x, hero.vel.y);
  const height = hero.pos.y - world.ground;

  // Rope geometry. Zero across the board when he is not holding one, so the
  // attached flag is the only thing that says which situation he is in.
  let ropeLength = 0;
  let ropeAngle = 0;
  let ropeRate = 0;

  if (web.attached) {
    const dx = hero.pos.x - web.anchor.x;
    const dy = hero.pos.y - web.anchor.y;
    const r = Math.hypot(dx, dy) || 1;
    ropeLength = r / reach;
    // Sine of the angle off vertical, signed, which is the useful form: it is
    // zero at the bottom of the arc and biggest at the ends.
    ropeAngle = dx / r;
    // Angular rate, from the component of velocity across the rope.
    ropeRate = (hero.vel.x * -dy + hero.vel.y * dx) / (r * r) / SCALE.rate;
  }

  return [
    hero.vel.x / SCALE.speed,
    hero.vel.y / SCALE.speed,
    height / SCALE.height,
    speed / SCALE.speed,

    web.attached ? 1 : 0,
    ropeLength,
    ropeAngle,
    ropeRate,

    ...skyline(env),

    1, // bias, so the policy can hold an opinion with no evidence
  ];
}

// Turns the policy's four numbers, each in minus one to one, into the things a
// player does with a mouse and two keys.
//
// The gate is one number rather than two because firing and letting go are
// never both available: he is either holding a web or he is not.
export function decode(action) {
  const [aim, range, gate, reel] = action;

  return {
    aim: AIM.low + ((aim + 1) / 2) * (AIM.high - AIM.low),
    range: RANGE.near + ((range + 1) / 2) * (RANGE.far - RANGE.near),
    gate,
    // A dead band, so "leave the rope alone" is a thing it can choose rather
    // than something it has to balance on a knife edge.
    reel: Math.abs(reel) < 0.35 ? 0 : Math.sign(reel),
  };
}

// Where he is pointing, in world coordinates. The angle is measured from the
// way he is going, so a policy that has learned "aim a bit above my heading"
// works whether he is rising or falling.
export function aimPoint(env, aim, range) {
  const { world, reach } = env;
  const heading = Math.atan2(world.hero.vel.y, world.hero.vel.x);
  const angle = heading + aim;
  const distance = reach * range;

  return {
    x: world.hero.pos.x + Math.cos(angle) * distance,
    y: world.hero.pos.y + Math.sin(angle) * distance,
  };
}

// What an action asks for, without doing any of it.
//
// Split out so the trainer and the live game read the same definition of what
// the four numbers mean. If the game decoded them itself, the agent you watch
// would slowly stop being the agent that was trained, and nothing would say so.
export function plan(env, action) {
  const { aim, range, gate, reel } = decode(action);

  return {
    fire: !env.world.web.attached && gate > 0,
    release: env.world.web.attached && gate < 0,
    target: aimPoint(env, aim, range),
    reel,
    aim,
  };
}

// One decision, then twelve physics steps under it.
//
// The action is held for the whole block rather than reapplied, which is what a
// held mouse button does and what keeps the decision rate honest: an agent that
// could change its mind every 240th of a second would be learning something no
// player could do.
export function stepEnv(env, action) {
  const { world, city, assist, memory } = env;
  const { fire, release, target, reel, aim } = plan(env, action);

  // Firing and releasing are both scored here rather than in the reward
  // function, because both are events and the reward is otherwise a function of
  // the state alone. Kept on the memory so score() can add them in.
  memory.event = 0;

  if (release) {
    releaseWeb(world);
    const seconds = world.time - memory.arcStart;
    memory.arcs.push(seconds);
    memory.event += arcValue(seconds);
  } else if (fire) {
    const anchor = pickAnchor(city, world.hero.pos, target, env.reach, world.ground, world.hero.vel.x);
    if (anchor && attachWeb(world, anchor)) {
      memory.arcStart = world.time;
      memory.event -= REWARD.web;
    }
  }

  for (let i = 0; i < STEPS_PER_DECISION; i += 1) {
    world.applied = assistForce(world, assist);
    // The agent's reel is added to the assist's own, so it can help or fight it
    // but never has to fight the slack gathering that keeps the rope sane.
    reelWeb(world, assistReel(world, assist) + reel, DT);
    step(world, DT);

    if (world.hero.pos.y - world.ground < 1) memory.grounded = true;
  }

  const reward = score(env, aim);
  memory.lastAim = aim;

  return {
    obs: observe(env),
    reward,
    done: memory.grounded || world.time >= EPISODE_SECONDS,
  };
}

// What good swinging is worth, one decision at a time.
//
// Every term is per decision and they are summed, so the weights are directly
// comparable: forward progress at 25 m/s earns about 1.25 a step, which is what
// everything else is sized against.
export const REWARD = {
  // Paid for forward speed, and it saturates.
  //
  // Saturating is the "consistent pace" term. Paying for raw speed makes the
  // best policy the fastest one, and the fastest one is frantic: the first
  // trained agent cruised at fifty five metres a second, which is a blur. Above
  // this it earns nothing more, so there is no reason to trade a good line for
  // another metre a second.
  //
  // Read off the velocity rather than off how far he moved, and that is not a
  // cosmetic choice. Hauling the rope in moves his position toward the anchor
  // without putting anything into his velocity, so distance covered and speed
  // travelled are not the same number here. The agent found that: five hundred
  // and twelve of its two thousand seven hundred metres were rope haul rather
  // than flight. Paying for velocity prices that at nothing, which is the
  // honest answer for as long as the winch model says what it currently says.
  pace: 32, // metres a second, where the pay stops going up
  paceWeight: 1,
  // Where a swing looks like a swing. Flat across the whole band, which is a
  // decision rather than an oversight.
  //
  // Grading it, so that the middle of the band paid best and there was a
  // gradient pulling him up, was tried and measured and is worse on every count:
  // the height did not move at all, the distance fell from 1.48 km to 1.26, the
  // arcs became half again as ragged, and it started falling off one city in
  // five. The reason is in the geometry rather than in the weights. A long arc
  // has to swing down through the bottom of itself, so riding three and a half
  // second arcs and staying high are the same thing asked for twice, and the
  // reward cannot have both. The hand written baseline sits twenty metres higher
  // precisely because its arcs are half as long.
  band: [45, 100], // metres
  inBand: 0.3,
  lowBelow: 30, // metres, where it starts looking like a crash
  lowPenalty: 1,
  shortRope: 25, // metres
  shortPenalty: 0.5,
  jitter: 0.2, // per radian of aim change between decisions
  ground: 50, // paid once, at the end

  // Every web fired costs, whether or not it was any good.
  //
  // This is the term that stops the thing the first trained policy did, which
  // was to fire and let go three times a second: a hundred and thirty seven
  // arcs in forty five seconds, each one a quarter of a second long. It covered
  // ground and it never fell, so it scored well, and it looked like a strobe.
  //
  // A short rope penalty does not catch that, because the rope it fires is a
  // long one, it just drops it immediately. Charging for the shot does catch
  // it, directly and by construction: a hundred and thirty seven shots costs a
  // hundred and thirty seven times as much as one.
  //
  // Six rather than two, and the first two were not enough: the policy kept
  // sixty one arcs of two thirds of a second, because the heroic assist only
  // pushes him while he is holding a rope, so a fresh well angled one is worth
  // paying for. The price has to beat that, and at six an arc has to last about
  // a second before it pays for the shot that started it.
  // Sixteen, and the climb from two is the whole story of tuning this.
  //
  // What decides the number is not the price on its own but how big the arc
  // terms are next to everything else. At a cost of eight the whole of the
  // arc economics came to about a hundred and eighty points of a reward that
  // totalled thirteen hundred: thirteen percent, against a pace and height
  // bonus that every surviving policy collects in full and that therefore tells
  // the search nothing. The style terms have to be a large enough share of the
  // score to be worth the search's attention, and at sixteen they are a third
  // of it.
  web: 16,

  // And a payment on release, for every second the arc lasted.
  //
  // Per second, and that is the whole of it. A flat bonus per arc was the second
  // thing tried and it is subtly wrong in a way worth writing down: a flat
  // payment rewards the *number* of arcs, so the policy found that thirty nine
  // arcs of one second beat twenty two of two, because it could fit more of them
  // in and each still cleared the cost of its web.
  //
  // Paying by the second inverts that. Time on the rope is roughly fixed, so the
  // total payment is roughly fixed too, and the only thing left to optimise is
  // how many webs were bought to get it. Fewer, longer arcs, by construction.
  arcRate: 8, // per second of arc
  arcCap: 3.5, // seconds, past which more hanging earns nothing
};

// What one completed arc was worth. Capped rather than tapered off, because
// past three and a half seconds he is not swinging any more, he is hanging, and
// the forward term already makes hanging expensive.
function arcValue(seconds) {
  return Math.min(seconds, REWARD.arcCap) * REWARD.arcRate;
}

function score(env, aim) {
  const { world, memory } = env;
  const height = world.hero.pos.y - world.ground;

  // The main driver.
  let reward = REWARD.paceWeight * Math.min(Math.max(world.hero.vel.x, 0), REWARD.pace) / REWARD.pace;

  if (height >= REWARD.band[0] && height <= REWARD.band[1]) reward += REWARD.inBand;
  if (height < REWARD.lowBelow) reward -= REWARD.lowPenalty * (1 - height / REWARD.lowBelow);

  if (world.web.attached && world.web.restLength < REWARD.shortRope) {
    reward -= REWARD.shortPenalty * (1 - world.web.restLength / REWARD.shortRope);
  }

  // Smoothness. A policy that jerks the aim around every twentieth of a second
  // can still cover ground, but it does not look like anybody swinging.
  reward -= Math.abs(aim - memory.lastAim) * REWARD.jitter;

  // What firing and letting go cost and earned this step.
  reward += memory.event;

  if (memory.grounded) reward -= REWARD.ground;

  return reward;
}

// Runs one whole episode and hands back both the score the trainer optimises
// and the numbers a person would judge it by.
//
// The two are kept apart on purpose. The reward is a guess at what good looks
// like; the report is what actually happened, and when the two disagree it is
// the reward that is wrong.
export function runEpisode(policy, { seed = 1, params, assist = HEROIC } = {}) {
  const env = createEnv({ seed, params, assist });
  let obs = observe(env);
  let total = 0;
  let heightSum = 0;
  let decisions = 0;
  let attachedSteps = 0;

  for (;;) {
    const result = stepEnv(env, policy(obs));
    obs = result.obs;
    total += result.reward;
    heightSum += env.world.hero.pos.y - env.world.ground;
    decisions += 1;
    if (env.world.web.attached) attachedSteps += 1;
    if (result.done) break;
  }

  const arcs = env.memory.arcs;
  const mean = arcs.length ? arcs.reduce((a, b) => a + b, 0) / arcs.length : 0;
  const spread = arcs.length > 1
    ? Math.sqrt(arcs.reduce((a, b) => a + (b - mean) ** 2, 0) / arcs.length)
    : 0;

  return {
    reward: total,
    distance: env.world.hero.pos.x,
    seconds: env.world.time,
    swings: arcs.length,
    meanHeight: heightSum / decisions,
    arcTime: mean,
    arcSpread: spread,
    holding: attachedSteps / decisions,
    grounded: env.memory.grounded,
  };
}
