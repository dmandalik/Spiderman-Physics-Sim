// Springs for animation values.
//
// Every joint angle chases a target instead of being set to it. A spring
// overshoots slightly and settles, which is the difference between a pose that
// was computed and one that looks animated. It is the same semi implicit Euler
// the physics uses, just applied to a number rather than a body.

const MAX_STEP = 1 / 60; // long frames are substepped rather than trusted

export function createSpring(initial, frequency = 12, damping = 0.75) {
  let value = initial;
  let velocity = 0;

  const stiffness = frequency * frequency;
  const drag = 2 * damping * frequency;

  return function follow(target, dt) {
    let left = Math.min(dt, 0.1);

    while (left > 0) {
      const step = Math.min(left, MAX_STEP);
      velocity += (stiffness * (target - value) - drag * velocity) * step;
      value += velocity * step;
      left -= step;
    }

    return value;
  };
}

// Two independent springs, one per axis. Good enough for direction vectors
// because the result gets normalised by whoever uses it.
export function createVectorSpring(initial, frequency = 12, damping = 0.85) {
  const x = createSpring(initial.x, frequency, damping);
  const y = createSpring(initial.y, frequency, damping);

  return (target, dt) => ({ x: x(target.x, dt), y: y(target.y, dt) });
}
