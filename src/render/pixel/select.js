// Chooses which pose to draw. Pure, so it can be tested without a canvas.
//
// The pose is quantised but it is not faked. Which one you get comes straight
// out of the solver: whether a web is attached, how long ago it went out, and
// which way he is moving through the arc. The art is hand made, the choice is
// physics.

// How long the throw pose holds after a web goes out.
export const THROW_TIME = 0.3; // seconds

// Vertical speed that counts as properly climbing or dropping rather than
// rolling through the bottom of an arc.
export const SWING_SPEED = 4; // m/s

export function selectPose({ web, vel, time }) {
  if (!web.attached) return 'freeFlight';

  if (time - (web.since ?? -Infinity) < THROW_TIME) return 'webbing';
  if (vel.y < -SWING_SPEED) return 'downSwing';
  if (vel.y > SWING_SPEED) return 'upSwing';

  // Rolling through the bottom of the arc, where the web is pulling hardest.
  return 'bottomSwing';
}
