// Fixed timestep accumulator.
//
// Display refresh rates vary and browsers stall, so physics must not be fed
// raw frame times. Instead every frame's elapsed time goes into a bank and the
// simulation is advanced in identical slices until the bank runs low. Same
// input always gives the same result, and a stiff spring cannot explode just
// because someone dragged the window.
//
// The leftover fraction comes back as alpha so the renderer can interpolate
// between the last two states instead of showing a stale one.

export const FIXED_DT = 1 / 240;

// A frame longer than this is treated as a pause rather than real time. Without
// it, returning to a backgrounded tab would try to simulate the whole gap in
// one go and lock the page up.
export const MAX_FRAME = 0.25;

export function createStepper(fixedDt = FIXED_DT, maxFrame = MAX_FRAME) {
  let accumulator = 0;

  return function advance(frameTime, tick) {
    accumulator += Math.min(Math.max(frameTime, 0), maxFrame);

    let steps = 0;
    while (accumulator >= fixedDt) {
      tick(fixedDt);
      accumulator -= fixedDt;
      steps += 1;
    }

    return { steps, alpha: accumulator / fixedDt };
  };
}
