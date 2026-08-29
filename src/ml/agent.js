// Flying a trained policy inside the real game.
//
// The point of this file is how little is in it. Training ran against the same
// solver, the same city and the same heroic assist the game runs, so watching
// the agent play is a matter of asking it what to do twenty times a second and
// then doing exactly what a player pressing the same buttons would do. Nothing
// here reimplements any part of the environment: what an action means comes from
// env.js, so the agent you watch cannot drift away from the agent that trained.
//
// It does not step the physics either. The game's own loop does that, and the
// agent is a hand on the mouse rather than a second simulation running
// alongside the first.

import { createPolicy, PARAM_COUNT } from './policy.js';
import { observe, plan, wrapEnv, STEPS_PER_DECISION } from './env.js';
import { attachWeb, releaseWeb } from '../physics/world.js';
import { pickAnchor } from '../world/city.js';

const DECISION_SECONDS = STEPS_PER_DECISION / 240;

export async function loadAgent(url = './agent.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`no agent at ${url}: ${response.status}`);

  const file = await response.json();
  // Weights arrive over the network as plain JSON, so nothing about them can be
  // assumed. A file from an older build with a different observation would
  // otherwise load happily and fly like nothing in particular.
  if (!Array.isArray(file.weights) || file.weights.length !== PARAM_COUNT) {
    throw new Error(`agent has ${file.weights?.length} weights, this build wants ${PARAM_COUNT}`);
  }

  return { policy: createPolicy(Float64Array.from(file.weights)), meta: file };
}

// A hand on the controls of a world the game already owns.
//
// It keeps its own clock rather than deciding once a frame, because the policy
// was trained at exactly twenty decisions a second. Letting a 144 Hz display
// give it seven times as many would be a different agent from the one that was
// trained, and it would fly differently for reasons nothing would explain.
export function createPilot(agent, world, city, assist) {
  const env = wrapEnv(world, city, assist);
  let owed = 0;
  let reel = 0;
  let aimedAt = null;

  return {
    // What the agent last pointed at, so the game can draw the marker it draws
    // for a player's cursor.
    get target() {
      return aimedAt;
    },
    // Which way it is working the web, in the same form the keyboard gives.
    get reel() {
      return reel;
    },

    update(dt) {
      owed += dt;
      let decisions = 0;

      while (owed >= DECISION_SECONDS) {
        owed -= DECISION_SECONDS;
        decide();
        decisions += 1;
        // A tab that has been in the background for a minute must not try to
        // catch up on a minute of swinging in one frame.
        if (decisions >= 8) {
          owed = 0;
          break;
        }
      }
    },
  };

  function decide() {
    const { fire, release, target, reel: wanted } = plan(env, agent.policy(observe(env)));
    reel = wanted;
    aimedAt = target;

    if (release) releaseWeb(world);
    else if (fire) {
      const anchor = pickAnchor(city, world.hero.pos, target, env.reach, world.ground, world.hero.vel.x);
      if (anchor) attachWeb(world, anchor);
    }
  }
}
