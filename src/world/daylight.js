// Three times of day, described once.
//
// Everything that changes between them lives here rather than being scattered
// through the sky, the city, the street and the facade builder. That matters
// because they have to agree: a warm sky over cold buildings, or lit windows in
// broad daylight, reads as a bug rather than as a time of day.
//
// Two of these settings are baked into sprites and the rest are not. Sky, haze
// and the wash are read every frame and cost nothing to change. The facade
// tones and how many windows are lit are drawn into the pixel grid, so changing
// the time throws the sprites away and lets them rebuild under the usual frame
// budget. That is why switching shows flat blocks for a moment.

export const TIMES = [
  {
    name: 'day',
    // Sky, top to bottom. Three stops, same as the gradient has always had.
    sky: ['#4f8fd0', '#8fc0e4', '#dce6e2'],
    stars: 0, // nothing is visible through a blue sky
    // The sun, and how big and how warm its halo is.
    disc: '#fff6d8',
    halo: 'rgba(255, 244, 200, 0.5)',
    crescent: false,
    haze: '#c3d6e8', // air between you and a far building, in daylight
    // A wash over every fixed palette, so props and the street sit in the same
    // light as the buildings without every colour being written out three times.
    wash: '#eaf2ff',
    washAmount: 0.12,
    // The two ends of the light every facade tone is mixed between.
    shadow: '#2c3a52',
    sunlight: '#fffdf4',
    glass: '#8fb6d8', // a window with sky in it
    litGlass: '#ffe6a8', // a window with a lamp behind it
    sheen: '#cfe4f4', // the band of reflected sun across a curtain wall
    // How many windows are lit. Almost none at noon.
    lit: 0.06,
    lampGlow: 0.15, // street lights are off, but the lantern still reads
  },
  {
    name: 'evening',
    sky: ['#1f3d78', '#8f83ab', '#f2c286'],
    stars: 0.35,
    disc: '#fff4dd',
    halo: 'rgba(255, 216, 150, 0.34)',
    crescent: true,
    haze: '#b79ab0',
    wash: '#ffb877',
    washAmount: 0.1,
    shadow: '#2a1430',
    sunlight: '#ffe3b4',
    glass: '#55688a',
    litGlass: '#f0ac4e',
    sheen: '#8fa6c8',
    lit: 0.42,
    lampGlow: 0.85,
  },
  {
    name: 'night',
    sky: ['#05081c', '#131a3c', '#2e2a4c'],
    stars: 1,
    disc: '#f4f2e4',
    halo: 'rgba(200, 214, 255, 0.28)',
    crescent: true,
    haze: '#1d2244',
    wash: '#131a3a',
    washAmount: 0.52,
    shadow: '#080a1c',
    // Moonlight, not sunlight. Cool, and much weaker, so highlights barely lift
    // off the wall and the lit windows do all the work.
    sunlight: '#8ea4cc',
    glass: '#1d2444',
    litGlass: '#ffce6a',
    sheen: '#38456e',
    lit: 0.72,
    lampGlow: 1,
  },
];

const byName = new Map(TIMES.map((t) => [t.name, t]));

// Deliberate module state. Time of day is genuinely global to the renderer, and
// threading it through the sky, three city layers, the street, every prop and
// the facade builder would be a parameter on twenty functions that only ever
// carries one value.
let current = byName.get('evening');

export const timeOfDay = () => current;

export function setTimeOfDay(name) {
  const found = byName.get(name);
  if (found) current = found;
  return current;
}

export function nextTimeOfDay() {
  const index = TIMES.indexOf(current);
  current = TIMES[(index + 1) % TIMES.length];
  return current;
}

// Puts a fixed colour under the current light. Used for everything with a
// palette of its own, so leaves and ironwork go dark at night without needing
// three versions of every colour written out by hand.
export function underLight(hex, time = current) {
  return mix(hex, time.wash, time.washAmount);
}

// Mixes two hex colours. This lives here rather than in a palette module of its
// own because everything that needs it needs the time of day too, and a second
// file holding two colour constants was one indirection with nothing in it.
export function mix(hex, towards, amount) {
  const a = parse(hex);
  const b = parse(towards);
  const t = Math.min(Math.max(amount, 0), 1);

  return rgb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

// Mixes just far enough to land on a target fraction of the original's
// luminance, rather than a fixed fraction of the way there.
//
// This is the difference between a window channel that reads and one that
// vanishes. Mixing seventeen percent toward the shadow takes twenty points of
// luminance off a pale grey tower and only seven off a dark rust one, because
// the rust already sits near the shadow. Perception is closer to a ratio than
// to a difference, so asking for a ratio gives the same apparent contrast on
// every colour in the city.
export function toRatio(hex, towards, ratio) {
  const from = luminance(hex);
  const to = luminance(towards);
  if (Math.abs(from - to) < 1e-6) return hex;

  const amount = (from - from * ratio) / (from - to);
  return mix(hex, towards, Math.min(Math.max(amount, 0), 1));
}

export function luminance(hex) {
  const [r, g, b] = parse(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Drains the colour out of something without changing how light it is.
//
// Mixing toward grey is not the same as mixing toward white or toward black,
// and for a skyline it is the only one of the three that does the right thing:
// a distant tower is still a rust tower, it is just a quieter one. Mixing
// toward a fixed grey would lighten the dark colours and darken the light ones
// until every building at the back was the same tone, which is a wall.
export function desaturate(hex, amount) {
  const grey = luminance(hex);
  return mix(hex, rgb(grey, grey, grey), amount);
}

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(r, g, b) {
  const byte = (v) => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
