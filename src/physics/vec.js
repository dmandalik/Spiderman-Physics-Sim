// Minimal 2D vector helpers. Vectors are plain { x, y } objects and every
// function returns a new one, so nothing here mutates its arguments.

export const vec = (x = 0, y = 0) => ({ x, y });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });

export const dot = (a, b) => a.x * b.x + a.y * b.y;

export const length = (a) => Math.hypot(a.x, a.y);

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Unit vector. Returns zero for a zero length input so callers never divide
// by zero when the hero happens to sit exactly on an anchor.
export function normalize(a) {
  const len = Math.hypot(a.x, a.y);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

// Component of a that points along the unit vector u.
export const project = (a, u) => scale(u, dot(a, u));

export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
