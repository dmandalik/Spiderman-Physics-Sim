// The title and the key hints, in the same bitmap type as everything else.
//
// Both are static, so each one is drawn into its own little canvas once and
// then left alone. Keeping them as DOM text would have left two smooth
// antialiased corners on a screen that is otherwise entirely whole cells, which
// is the sort of thing you do not consciously notice and do notice.

import { drawText, drawTextShadow, textWidth, lineHeight, GLYPH } from '../render/pixel/font.js';

const INK = '#e8eeff';
const DIM = '#b9c4e0';
const KEY = '#cfe0ff';
const KEYCAP = '#243154';

const TITLE_SCALE = 4;
const SUB_SCALE = 1;
const HINT_SCALE = 1;

export function createTitle(root, title, subtitle) {
  root.replaceChildren(
    panel([{ text: title, scale: TITLE_SCALE, colour: INK }], 0),
    panel([{ text: subtitle, scale: SUB_SCALE + 1, colour: DIM }], 6),
  );
}

// One canvas per line, so the two can have different sizes without either being
// stretched to fit the other.
function panel(runs, marginTop) {
  const scale = Math.max(...runs.map((r) => r.scale));
  // One cell of margin on the right and bottom for the shadow to land in.
  const width = Math.max(...runs.map((r) => textWidth(r.text, r.scale))) + scale;
  const height = Math.max(...runs.map((r) => lineHeight(r.scale))) + scale;
  const canvas = sized(width, height);
  const ctx = canvas.getContext('2d');

  for (const run of runs) drawTextShadow(ctx, run.text, 0, 0, run.scale, run.colour);
  canvas.style.marginTop = `${marginTop}px`;
  canvas.style.display = 'block';
  canvas.style.imageRendering = 'pixelated';

  return canvas;
}

// The footer. Keys get a drawn cap around them rather than a CSS border, so the
// corners are square cells like everything else.
export function createHints(root, hints) {
  const capPad = 3;
  const gap = 6;
  const between = 16;

  let width = 0;
  for (const hint of hints) {
    for (const key of hint.keys) width += textWidth(key, HINT_SCALE + 1) + capPad * 2 + gap;
    width += textWidth(hint.text, HINT_SCALE + 1) + between;
  }

  const height = lineHeight(HINT_SCALE + 1) + capPad * 2 + 2;
  const canvas = sized(width, height);
  const ctx = canvas.getContext('2d');
  const scale = HINT_SCALE + 1;

  let x = 0;
  for (const hint of hints) {
    for (const key of hint.keys) {
      const capWidth = textWidth(key, scale) + capPad * 2;

      ctx.fillStyle = KEYCAP;
      ctx.fillRect(x, 0, capWidth, height);
      ctx.fillStyle = 'rgba(120, 165, 255, 0.22)';
      ctx.fillRect(x, 0, capWidth, 1);
      ctx.fillRect(x, height - 1, capWidth, 1);
      ctx.fillRect(x, 0, 1, height);
      ctx.fillRect(x + capWidth - 1, 0, 1, height);

      drawText(ctx, key, x + capPad, capPad, scale, KEY);
      x += capWidth + gap;
    }

    drawTextShadow(ctx, hint.text, x, capPad, scale, DIM);
    x += textWidth(hint.text, scale) + between;
  }

  canvas.style.display = 'block';
  canvas.style.imageRendering = 'pixelated';
  root.replaceChildren(canvas);
}

function sized(width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(Math.round(width * dpr), 1);
  canvas.height = Math.max(Math.round(height * dpr), 1);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);

  return canvas;
}

export { GLYPH };
