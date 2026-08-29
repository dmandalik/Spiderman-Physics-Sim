// Heroic mode.
//
// Real swinging bleeds height. Measured with tools/swing-budget.js, an ideal
// swinger loses about 15 metres of apex every arc and is on the street inside
// eight swings. Two things about that number decide what an assist should do.
//
// Drag is not the culprit: turning it off entirely changes the loss from 15.0
// to 14.8 metres. Neither is the web snapping taut, which costs nothing when
// you fire ahead of yourself, because the rope goes slack first and catches
// gently. The loss is geometric. He lets go lower than he grabbed.
//
// So the assist adds energy rather than saving it. It does that by pulling him
// along the web, which is a force he could plausibly produce with his arms, and
// it is applied along the direction he is already travelling.
//
// Acting along the velocity is the whole trick. It raises horizontal and
// vertical speed in the same proportion, so the swing simply gets faster with
// no kick at any point in the arc. An earlier version pumped the rope instead,
// hauling in through the bottom the way you pump a playground swing. That works
// and it is beautiful physics, but it yanks him upward at the low point, and it
// runs out the moment the web reaches its minimum length.

import { vec, length, distance } from './vec.js';

export const HEROIC = {
  // Films are not fought by air. Heroic mode thins it out, which is one of
  // three places the mode changes the world rather than what he does in it.
  drag: 0.12,

  // The second. At movie speeds a real 9.81 reads as floating, because the
  // horizontal motion is so much faster than the fall that gravity looks weak
  // beside it. Heavier gravity makes the drops bite and the arcs snap.
  gravity: 14.5, // m/s^2

  // The third, and the only one that is about watching rather than about
  // physics. A heroic arc takes 2.3 seconds end to end, which is the right
  // answer for a pendulum 40 metres long and too long to sit through: a film
  // swing reads at about a second and a half. This runs the clock faster rather
  // than touching the solver, so every number on the dashboard is still true,
  // it just arrives sooner. At 1.35 an arc lands at 1.7 seconds.
  //
  // Not done by raising gravity further, which is the obvious alternative and
  // wrong: gravity is already carrying the weight of the falls, and pushing it
  // to get the pace would make him drop like a stone between webs.
  timeScale: 1.35,

  // Pull along the direction of travel, in metres per second squared. Drag and
  // the geometry of an arc cost him roughly 2, so this covers that several
  // times over and leaves him building speed.
  thrust: 7,

  // The pull fades to nothing here, which caps his speed without ever cutting
  // out abruptly. Nothing else limits it, so he keeps gaining for as long as
  // he holds the web.
  cruise: 46, // m/s

  // How far he bothers to reach. A rope stretching most of the way across the
  // block swings in a lazy arc that reads as loose however rigid it is, so he
  // picks a closer rooftop instead. Trimming the rope after it attaches would
  // be the obvious alternative and it is wrong: the rope is exactly taut the
  // moment it lands, so shortening it violates the constraint immediately and
  // yanks him at the roof.
  // Measured across the city, a 70 metre reach leaves him with nothing to grab
  // at 29 percent of positions, which is worse for the flow than a slightly
  // longer rope ever was. At 90 that falls to 14 percent.
  reach: 90, // metres // metres

  // Slack, in metres, that counts as loose. Below this he is effectively taut.
  slack: 0.5,

  // How fast he gathers slack in, as a multiple of the reel rate. Firing ahead
  // of yourself leaves the rope hanging and you fall until it catches, which is
  // most of what makes a swing feel rubbery. Hauling that in at once turns the
  // moment he fires into the moment the arc starts.
  gather: 3,

  // He tries to stay above this. Nothing pushes him up: below it he hauls the
  // web in, which shortens the rope and lifts the bottom of the arc.
  floor: 55, // metres

  // How hard he hauls when he is under the floor and still dropping.
  save: 2.2,
};

// How far heroic mode lets him fire, so the swing starts on a rope short
// enough to arc rather than sag.
export function assistReach(params, settings = HEROIC) {
  return Math.min(settings.reach, params.maxWebRange);
}

// The pull he adds along the web, in newtons. Zero unless he is holding on.
export function assistForce(world, settings = HEROIC) {
  const { hero, web, params } = world;
  if (!web.attached) return vec(0, 0);

  const speed = length(hero.vel);
  if (speed < 0.5) return vec(0, 0);

  // Eases off as he approaches cruise, so the acceleration tapers rather than
  // stopping dead at a threshold.
  const room = Math.max(1 - (speed / settings.cruise) ** 2, 0);
  const accel = settings.thrust * room;

  return vec((hero.vel.x / speed) * accel * params.mass, (hero.vel.y / speed) * accel * params.mass);
}

// Working the web is now only for keeping him off the street, not for speed.
// Returns a signed multiple of the reel rate: negative hauls in.
export function assistReel(world, settings = HEROIC) {
  const { hero, web } = world;
  if (!web.attached) return 0;

  // Gather in any slack first. Everything else assumes a taut rope.
  if (web.restLength - distance(hero.pos, web.anchor) > settings.slack) {
    return -settings.gather;
  }

  const height = hero.pos.y - world.ground;
  if (height >= settings.floor) return 0;

  // Dropping and low. Haul, which both shortens the arc and buys height back
  // through the work it does. Already climbing, leave the rope alone rather
  // than spending the recovery.
  return hero.vel.y < 0 ? -settings.save : 0;
}
