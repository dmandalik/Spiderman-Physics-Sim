// Seeded randomness.
//
// Math.random cannot be steered, so the city could never be the same twice and
// nothing about it would be testable. mulberry32 is a small fast generator
// with a seed we control, which is what makes a chunk of city a pure function
// of its index.

export function mulberry32(seed) {
  let a = seed >>> 0;

  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mixes a few integers into one seed. This is how chunk 12 of layer 2 gets its
// own stream of numbers without ever being generated in order.
export function hashInts(...values) {
  let h = 2166136261 >>> 0;

  for (const value of values) {
    h = (h ^ (value | 0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }

  return h >>> 0;
}

export const range = (rng, min, max) => min + rng() * (max - min);

export const chance = (rng, probability) => rng() < probability;
