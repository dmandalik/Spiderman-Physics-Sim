// Colour mixing, so a building only has to carry one colour.
//
// Every facade needs at least three tones: the face itself, a darker one for
// the side the sun has left, and a lighter one for the cornice catching it.
// Storing all three per building means writing out three times as many hex
// codes and getting them subtly out of step with each other. Deriving them from
// the face keeps one source of truth and makes the whole skyline relight itself
// if the sun ever moves.

// The two ends of the light in this scene. Everything shaded is mixed toward
// the shadow, everything lit toward the sun, so the city stays one painting.
export const SHADOW = '#2a1430';
export const SUNLIGHT = '#ffe3b4';

export function mix(hex, towards, amount) {
  const a = parse(hex);
  const b = parse(towards);
  const t = Math.min(Math.max(amount, 0), 1);

  return rgb(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

export const darken = (hex, amount) => mix(hex, SHADOW, amount);
export const lighten = (hex, amount) => mix(hex, SUNLIGHT, amount);

// The three tones every flat surface in this city is painted with.
export function tones(face) {
  return {
    face,
    shade: darken(face, 0.3),
    deep: darken(face, 0.52),
    trim: lighten(face, 0.42),
  };
}

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(r, g, b) {
  const byte = (v) => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
