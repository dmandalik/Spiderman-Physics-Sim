// The time of day button.
//
// The icon is a pixel grid drawn with the same machinery as everything else in
// the city, not an emoji or an SVG. That is the whole point: a smooth glyph
// next to a pixel skyline reads as a browser control that wandered into the
// game, and the one thing this button has to do is look like it belongs.

import { spritePixels } from '../render/pixel/sprite.js';
import { TIMES, nextTimeOfDay, timeOfDay } from '../world/daylight.js';

// Eleven by eleven, hand drawn, one letter per cell.
//
//   . nothing   o outline   b body   g glow   h horizon
const ICONS = {
  day: [
    '...o.....o.',
    '....o...o..',
    '.....ooo...',
    '..o.obbbo.o',
    '...oobbboo.',
    'ooo.bbbbb.o',
    '...oobbboo.',
    '..o.obbbo.o',
    '.....ooo...',
    '....o...o..',
    '...o.....o.',
  ],
  evening: [
    '...........',
    '.....o.....',
    '...ooooo...',
    '..obbbbbo..',
    '.obbbbbbbo.',
    '.obbbbbbbo.',
    'hhhhhhhhhhh',
    '...........',
    '..hh...hh..',
    '...........',
    '.hh..hh..hh',
  ],
  night: [
    '....ooo....',
    '..oobbbo...',
    '.obbbbo....',
    '.obbbo.....',
    'obbbo....g.',
    'obbbo......',
    'obbbo...g..',
    '.obbbo.....',
    '.obbbbo..g.',
    '..oobbbo...',
    '....ooo....',
  ],
};

// Two palettes per icon so a sun is not the same yellow as a moon.
const PALETTES = {
  day: { o: '#8a5a1c', b: '#ffd24a', g: '#fff0b8', h: '#8a5a1c' },
  evening: { o: '#7a3a24', b: '#ff9b45', g: '#ffd9a0', h: '#c2703c' },
  night: { o: '#1c2450', b: '#e8ecff', g: '#ffe9a8', h: '#1c2450' },
};

const SCALE = 3; // screen pixels per cell, so the icon is 33 across

export function createTimeButton(root, onChange) {
  const button = document.createElement('button');
  button.className = 'timeToggle';
  button.type = 'button';

  const canvas = document.createElement('canvas');
  canvas.width = 11 * SCALE;
  canvas.height = 11 * SCALE;

  const label = document.createElement('span');
  label.className = 'timeLabel';

  button.append(canvas, label);
  root.append(button);

  const ctx = canvas.getContext('2d');

  // Every icon rasterised once up front. Three eleven by eleven grids is
  // nothing, and doing it here means clicking never waits on anything.
  const rasters = {};
  for (const time of TIMES) {
    const { width, height, data } = spritePixels(ICONS[time.name], PALETTES[time.name]);
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    off.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
    rasters[time.name] = off;
  }

  function paint() {
    const time = timeOfDay();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Nearest neighbour, or an eleven pixel icon blown up three times turns to
    // mush and stops matching the rest of the screen.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rasters[time.name], 0, 0, canvas.width, canvas.height);

    label.textContent = time.name;
    button.title = `Time of day, currently ${time.name}. Click to change.`;
    button.setAttribute('aria-label', button.title);
  }

  button.addEventListener('click', () => {
    nextTimeOfDay();
    paint();
    onChange();
  });

  paint();
  return { paint };
}
