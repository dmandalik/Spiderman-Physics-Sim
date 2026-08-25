// A bitmap font, drawn by hand on the same grid as the city.
//
// The readouts were the last thing on screen still made of smooth antialiased
// type, sitting over a city built entirely out of whole cells. Any real font at
// eleven pixels is a grey smear of subpixels, which is exactly the texture this
// project spends its whole time avoiding.
//
// Five by seven, uppercase only, which is the classic arcade cell: wide enough
// for a legible S and G, narrow enough that twelve characters fit a panel. Every
// glyph is written out rather than generated, for the same reason the arches
// are: a letterform is a set of decisions, not a curve you can sample.

export const GLYPH = { width: 5, height: 7, gap: 1 };

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],

  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '°': ['.##..', '#..#.', '.##..', '.....', '.....', '.....', '.....'],
  '×': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '²': ['.##..', '#..#.', '..#..', '.#...', '####.', '.....', '.....'],
  '(': ['..#..', '.#...', '#....', '#....', '#....', '.#...', '..#..'],
  ')': ['..#..', '...#.', '....#', '....#', '....#', '...#.', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
};

const MISSING = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'];

// Lowercase folds to uppercase rather than being drawn twice. At five by seven
// a lowercase alphabet is mostly indistinguishable from small capitals anyway.
export const glyph = (character) => G[character] || G[character.toUpperCase()] || MISSING;

// Width of a run of text in cells, gaps between characters included but no
// trailing gap.
export function textCells(text) {
  if (!text.length) return 0;
  return text.length * (GLYPH.width + GLYPH.gap) - GLYPH.gap;
}

export const textWidth = (text, scale = 1) => textCells(text) * scale;
export const lineHeight = (scale = 1) => GLYPH.height * scale;

// One canvas per colour, holding every glyph in a row.
//
// Drawing text a cell at a time would be about fifteen fillRects per character,
// which for a panel of twenty five live numbers is thousands of calls a frame.
// An atlas turns each character into one drawImage instead.
const atlases = new Map();
const ORDER = Object.keys(G);
const INDEX = new Map(ORDER.map((key, i) => [key, i]));

function atlas(colour) {
  const found = atlases.get(colour);
  if (found) return found;

  const canvas = document.createElement('canvas');
  canvas.width = ORDER.length * GLYPH.width;
  canvas.height = GLYPH.height;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;

  ORDER.forEach((key, i) => {
    G[key].forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === '#') ctx.fillRect(i * GLYPH.width + x, y, 1, 1);
      });
    });
  });

  atlases.set(colour, canvas);
  return canvas;
}

// Draws text with its top left at x, y. Positions are rounded so a glyph never
// lands on half a pixel, which is the one thing that would undo all of this.
export function drawText(ctx, text, x, y, scale, colour) {
  const sheet = atlas(colour);
  const step = (GLYPH.width + GLYPH.gap) * scale;

  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  let at = Math.round(x);
  const top = Math.round(y);

  for (const character of text) {
    const key = INDEX.has(character) ? character : character.toUpperCase();
    const index = INDEX.get(key);

    if (index !== undefined && character !== ' ') {
      ctx.drawImage(
        sheet,
        index * GLYPH.width, 0, GLYPH.width, GLYPH.height,
        at, top, GLYPH.width * scale, GLYPH.height * scale,
      );
    }
    at += step;
  }

  ctx.imageSmoothingEnabled = smoothing;
  return at - GLYPH.gap * scale;
}

// Text with a hard drop shadow one cell down and right.
//
// For anything painted straight onto the city rather than onto a panel. The
// title and the key hints sit over whatever building happens to be behind them,
// and dim type on a pale facade is invisible. A blur would be the usual answer
// and is the one thing not available here, so it is a second copy of the text
// offset by a whole cell, which is how this was always done.
export function drawTextShadow(ctx, text, x, y, scale, colour, shadow = 'rgba(10, 8, 20, 0.75)') {
  drawText(ctx, text, x + scale, y + scale, scale, shadow);
  return drawText(ctx, text, x, y, scale, colour);
}

// Same, but ending at x rather than starting there. Numbers in a column have to
// line up on their right hand edge or the panel reads as a jumble.
export function drawTextRight(ctx, text, right, y, scale, colour) {
  return drawText(ctx, text, right - textWidth(text, scale), y, scale, colour);
}

// A canvas holding one run of text and nothing else, sized to fit it.
//
// For the labels around the edges of the interface, which never change. Drawing
// those into their own little canvas once is far less machinery than keeping a
// second full panel painted every frame.
export function textCanvas(text, scale, colour, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
  const canvas = document.createElement('canvas');
  const width = textWidth(text, scale);
  const height = lineHeight(scale);

  canvas.width = Math.max(Math.round(width * dpr), 1);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawText(ctx, text, 0, 0, scale, colour);

  return canvas;
}
