// The readouts, drawn as pixels.
//
// This used to be DOM, which was the right call while it was the only text on
// screen. Once the city became a grid of cells the panel was the one thing left
// rendering smooth antialiased type, and a subpixel S over a pixel skyline
// reads as a browser control that wandered into the game.
//
// So it is one canvas now, drawn with the hand made bitmap font. One canvas
// rather than one per row, because twenty five elements each with their own
// context is a lot of machinery for something that is a list.
//
// Every number still comes from metrics(), which is pure, so the panel cannot
// quietly disagree with the simulation.

import { metrics } from '../physics/metrics.js';
import { drawText, drawTextRight, textWidth, GLYPH } from '../render/pixel/font.js';

const DEGREES = 180 / Math.PI;

const SCALE = 2; // screen pixels per font cell
const PAD = 9;
const ROW = GLYPH.height * SCALE + 4; // a line of text plus its leading
const GROUP_GAP = 7;
const WIDTH = 250;

const INK = '#e8eeff';
const DIM = '#8792b5';
const ACCENT = '#4de2ff';
const PANEL = 'rgba(9, 14, 30, 0.72)';
const EDGE = '#2c3a63';

// Labels are short because a five by seven cell is wide. ACCELERATION at this
// size is a hundred and forty pixels of one word, which crowds out the number
// it is there to describe.
const ROWS = [
  { group: 'Motion' },
  { key: 'speed', label: 'Speed', unit: 'm/s', digits: 1 },
  { key: 'vx', label: 'Horiz', unit: 'm/s', digits: 1 },
  { key: 'vy', label: 'Vert', unit: 'm/s', digits: 1 },
  { key: 'height', label: 'Height', unit: 'm', digits: 1 },
  { key: 'distance', label: 'Dist', unit: 'm', digits: 0 },
  { key: 'acceleration', label: 'Accel', unit: 'm/s²', digits: 1 },

  { group: 'Forces' },
  { key: 'tension', label: 'Tension', unit: 'kN', digits: 2, scale: 0.001 },
  { key: 'load', label: 'Load', unit: 'g', digits: 2 },
  { key: 'drag', label: 'Drag', unit: 'N', digits: 0 },
  { key: 'weight', label: 'Weight', unit: 'N', digits: 0 },
  { key: 'applied', label: 'Assist', unit: 'N', digits: 0 },
  { key: 'net', label: 'Net', unit: 'kN', digits: 2, scale: 0.001 },

  { group: 'Energy' },
  { key: 'kinetic', label: 'Kinetic', unit: 'kJ', digits: 1, scale: 0.001 },
  { key: 'potential', label: 'Potent', unit: 'kJ', digits: 1, scale: 0.001 },
  { key: 'total', label: 'Total', unit: 'kJ', digits: 1, scale: 0.001 },
  { key: 'power', label: 'Power', unit: 'kW', digits: 1, scale: 0.001 },
  { key: 'dragPower', label: 'Drag pwr', unit: 'kW', digits: 1, scale: 0.001 },

  { group: 'Pendulum' },
  { key: 'webLength', label: 'Web', unit: 'm', digits: 1, free: true },
  { key: 'angle', label: 'Angle', unit: '°', digits: 0, scale: DEGREES },
  { key: 'omega', label: 'Rate', unit: 'rad/s', digits: 2 },
  { key: 'centripetal', label: 'Centrip', unit: 'm/s²', digits: 1 },
  { key: 'period', label: 'Period', unit: 's', digits: 1 },

  { group: 'System' },
  { key: 'mode', label: 'Mode', unit: '', text: true },
  { key: 'time', label: 'Sim time', unit: 's', digits: 0 },
  { key: 'fps', label: 'Fps', unit: '', digits: 0 },
];

const HEADER = GLYPH.height * SCALE + 12;

export function createHud(root) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hudCanvas';
  const ctx = canvas.getContext('2d');

  // A real button over the header, so the panel is still operable by keyboard
  // and announced properly. The header itself is painted on the canvas.
  const toggle = document.createElement('button');
  toggle.className = 'hudHit';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'true');

  root.replaceChildren(canvas, toggle);

  let collapsed = false;
  let smoothedFps = 60;
  let dpr = 1;

  function size() {
    const rows = collapsed ? 0 : ROWS.length;
    const groups = collapsed ? 0 : ROWS.filter((r) => r.group).length;
    const height = HEADER + (collapsed ? PAD : rows * ROW + groups * GROUP_GAP + PAD);

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(WIDTH * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    toggle.style.height = `${HEADER}px`;
  }

  function setCollapsed(next) {
    collapsed = next;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Show the readouts' : 'Hide the readouts');
    size();
  }

  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(false);

  return {
    toggle: () => setCollapsed(!collapsed),

    update(world, frameTime, mode) {
      if (frameTime > 0) smoothedFps += (1 / frameTime - smoothedFps) * 0.08;

      const height = canvas.height / dpr;
      frame(ctx, height);
      drawText(ctx, 'Physics', PAD, PAD + 1, SCALE, ACCENT);
      drawTextRight(ctx, collapsed ? '+' : '-', WIDTH - PAD, PAD + 1, SCALE, ACCENT);

      if (collapsed) return;

      const m = metrics(world);
      const values = { ...m, mode, time: world.time, fps: Math.round(smoothedFps) };
      let y = HEADER;

      for (const row of ROWS) {
        if (row.group) {
          y += GROUP_GAP;
          drawText(ctx, row.group, PAD, y, SCALE, ACCENT);
          y += ROW;
          continue;
        }

        drawText(ctx, row.label, PAD, y, SCALE, DIM);

        const unitEnd = WIDTH - PAD;
        if (row.unit) drawTextRight(ctx, row.unit, unitEnd, y, SCALE, DIM);
        // A clear cell of air between the number and its unit, or 10.1 and M/S run
        // together into one word.
        const numberEnd = unitEnd - (row.unit ? textWidth(row.unit, SCALE) + 7 * SCALE : 0);
        drawTextRight(ctx, format(row, values, world), numberEnd, y, SCALE, INK);

        y += ROW;
      }
    },
  };
}

// The panel itself. Square corners and a two pixel border rather than a rounded
// one with a hairline, because a rounded rectangle is the one shape a pixel
// grid cannot make.
function frame(ctx, height) {
  ctx.clearRect(0, 0, WIDTH, height);

  ctx.fillStyle = PANEL;
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.fillStyle = EDGE;
  ctx.fillRect(0, 0, WIDTH, 2);
  ctx.fillRect(0, height - 2, WIDTH, 2);
  ctx.fillRect(0, 0, 2, height);
  ctx.fillRect(WIDTH - 2, 0, 2, height);

  // A rule under the header, so the title reads as a title bar.
  ctx.fillRect(2, HEADER - 4, WIDTH - 4, 1);
}

function format(row, values, world) {
  if (row.text) return String(values[row.key] ?? '');
  if (row.free && !world.web.attached) return 'free';

  const raw = (values[row.key] ?? 0) * (row.scale ?? 1);
  if (!Number.isFinite(raw)) return 'none';

  return raw.toFixed(row.digits);
}
