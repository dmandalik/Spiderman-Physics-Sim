import test from 'node:test';
import assert from 'node:assert/strict';

import { createStepper, FIXED_DT, MAX_FRAME } from '../src/loop.js';

test('a 60 Hz frame runs four 240 Hz steps', () => {
  const advance = createStepper();
  let steps = 0;

  const result = advance(1 / 60, () => (steps += 1));

  assert.equal(steps, 4);
  assert.equal(result.steps, 4);
  assert.ok(result.alpha < 1e-9);
});

test('leftover time is banked instead of thrown away', () => {
  const advance = createStepper();
  let steps = 0;

  advance(FIXED_DT * 0.6, () => (steps += 1));
  assert.equal(steps, 0);

  advance(FIXED_DT * 0.6, () => (steps += 1));
  assert.equal(steps, 1);
});

test('alpha reports how far into the next step we are', () => {
  const advance = createStepper();
  const { alpha } = advance(FIXED_DT * 1.5, () => {});
  assert.ok(Math.abs(alpha - 0.5) < 1e-9);
});

test('a long stall does not turn into a thousand steps', () => {
  const advance = createStepper();
  let steps = 0;

  advance(30, () => (steps += 1));

  // A 30 second stall is clipped to MAX_FRAME, so the step count lands on the
  // budget rather than on the stall. Allow one either way for float rounding.
  const budget = MAX_FRAME / FIXED_DT;
  assert.ok(Math.abs(steps - budget) <= 1, `ran ${steps} steps, expected about ${budget}`);
});

test('every dt handed to the tick is identical', () => {
  const advance = createStepper();
  const seen = new Set();

  advance(0.1, (dt) => seen.add(dt));

  assert.equal(seen.size, 1);
  assert.ok(seen.has(FIXED_DT));
});
