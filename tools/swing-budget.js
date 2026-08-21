// Measures whether a swing pays for itself.
//
//   node tools/swing-budget.js
//
// Real swinging loses height every arc and eventually puts him on the street.
// Before inventing an assist it is worth knowing exactly where the energy goes,
// because guessing produces a mode that feels arbitrary. This flies an ideal
// swinger through repeated arcs and reports what each arc costs.
//
// Two sinks matter:
//
//   Attachment. An inextensible rope going taut is a perfectly inelastic
//   collision. The velocity along the web is destroyed outright, so the energy
//   kept is |v|^2 - (v . d)^2 and everything else is gone in one frame.
//
//   Drag. Quadratic, so the power it steals goes with the cube of speed. That
//   is why fast swinging is disproportionately expensive.
//
// One source is available without cheating: reeling the web in while it is
// under tension does work on him, exactly the way pumping a playground swing
// does. The question is whether it can cover the other two.

import { createWorld, step, attachWeb, releaseWeb, reelWeb, energy } from '../src/physics/world.js';
import { assistForce, assistReel } from '../src/physics/assist.js';

const DT = 1 / 240;

// Where an ideal anchor sits relative to him when he fires: ahead, and above.
const AHEAD = 34; // metres
const ABOVE = 30; // metres

function flySwings(params, { reel = 0, swings = 6, assist = false } = {}) {
  const world = createWorld(params);
  world.hero.pos = { x: 0, y: 120 };
  world.hero.prevPos = { x: 0, y: 120 };
  world.hero.vel = { x: 26, y: 0 };

  const apexes = [];
  let attachLoss = 0;
  let apex = world.hero.pos.y;
  let hitGround = false;

  for (let i = 0; i < swings * 240 * 8; i += 1) {
    const { hero, web } = world;

    if (!web.attached) {
      apex = Math.max(apex, hero.pos.y);
      // Fire again once he is on the way down.
      if (hero.vel.y < 0) {
        const before = energy(world).total;
        attachWeb(world, { x: hero.pos.x + AHEAD, y: hero.pos.y + ABOVE });
        step(world, DT); // the taut snap lands on this step
        attachLoss += before - energy(world).total;
        continue;
      }
    } else if (hero.vel.y > 0 && hero.pos.x > web.anchor.x) {
      // Swung through and climbing on the far side. Let go.
      apexes.push(apex);
      apex = hero.pos.y;
      releaseWeb(world);
      if (apexes.length >= swings) break;
    }

    // Pump: haul in through the bottom, pay back out on the way up. Reeling
    // against tension is where the energy comes from.
    if (assist) {
      world.applied = assistForce(world);
      reelWeb(world, assistReel(world), DT);
    }
    else if (reel && web.attached) reelWeb(world, hero.vel.y < 0 ? -reel : reel, DT);

    step(world, DT);

    if (hero.pos.y <= hero.radius + 0.01) {
      hitGround = true;
      break;
    }
  }

  return { apexes, attachLoss, hitGround };
}

function report(label, params, options) {
  const { apexes, attachLoss, hitGround } = flySwings(params, options);
  if (apexes.length < 2) {
    console.log(`${label.padEnd(30)} ${hitGround ? 'hit the ground' : 'no clean arcs'}`);
    return;
  }

  const drop = (apexes[0] - apexes[apexes.length - 1]) / (apexes.length - 1);
  const heights = apexes.map((h) => h.toFixed(0)).join(' ');

  console.log(
    `${label.padEnd(30)} ${drop >= 0 ? '-' : '+'}${Math.abs(drop).toFixed(1)} m per swing` +
      `   attach cost ${(attachLoss / 1000 / apexes.length).toFixed(1)} kJ` +
      `   apexes ${heights}`,
  );
}

console.log('apex height per arc, starting at 120 m\n');

report('as it ships', {});
report('no drag at all', { drag: 0 });
report('half drag', { drag: 0.06 });
report('elastic web', { webMode: 'elastic', stiffness: 9000, damping: 260 });
report('elastic, half drag', { webMode: 'elastic', stiffness: 9000, damping: 260, drag: 0.06 });
report('pumping only', {}, { reel: 1 });
report('elastic and pumping', { webMode: 'elastic', stiffness: 9000, damping: 260 }, { reel: 1 });
report(
  'elastic, half drag, pumping',
  { webMode: 'elastic', stiffness: 9000, damping: 260, drag: 0.06 },
  { reel: 1 },
);

console.log('');
report('heroic mode', {}, { assist: true, swings: 10 });

// Starting low is the case that actually matters, because that is where a real
// run ends up and where a player would otherwise be dead.
const low = flySwings({}, { assist: true, swings: 10 });
console.log(`heroic from low`.padEnd(30) + ` starts at 120 m, floor is 55 m, lowest apex ` +
  `${Math.min(...low.apexes).toFixed(0)} m, ${low.hitGround ? 'HIT THE GROUND' : 'never hit the ground'}`);
