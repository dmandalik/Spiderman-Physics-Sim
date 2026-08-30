// Draws a pose as chunky cells, rotated so the body lines up with the web.
//
// The canvas is rotated and the cells are drawn axis aligned inside it, so the
// blocks stay crisp at any angle. Rotating a bitmap instead would resample it
// and turn the edges to mush, which is the usual reason pixel art and free
// rotation do not mix.
//
// Every pose carries its own dimensions, because a traced sprite and a hand
// drawn one have no reason to be the same size.

import { worldToScreen } from '../camera.js';
import { HERO_HEIGHT, RENDER_SCALE } from '../rig.js';
import { COLOURS, POSES } from './poses.js';

const HERO_METRES = HERO_HEIGHT * RENDER_SCALE;

// One art pixel in metres.
//
// Poses cut from the same sheet already share a cell size, so they must also
// share the number of rows their scale is measured against. Dividing by each
// pose's own row count instead would make the compact ones render larger than
// the stretched ones and put the size drift straight back in. `scaleRows` is
// that shared number; poses traced from their own file fall back to their own
// height.
function cellSize(entry) {
  return HERO_METRES / (entry.scaleRows ?? entry.grid.length);
}

// One art pixel in metres for a given pose, so the web can be drawn in blocks
// the same size as the ones he is made of.
export function poseCell(poseName) {
  return cellSize(POSES[poseName] || POSES.neutral);
}

export function drawPixelHero(ctx, camera, pose, poseName) {
  const entry = POSES[poseName] || POSES.neutral;
  const at = worldToScreen(camera, pose.pos);

  // The true size of one of his art pixels on screen, and it is allowed to be
  // less than a whole one.
  //
  // This used to be floored at a pixel, and the floor was applied to the spacing
  // between blocks as well as to their size, which is the bug: the camera pulls
  // back as he speeds up, and below about five and three quarter pixels to the
  // metre he stopped shrinking altogether and held at a fixed forty nine pixels
  // while the city carried on shrinking around him. Eighteen percent too big at
  // full speed, and worst exactly when the camera is widest, which is when a
  // still of the thing gets taken.
  const cell = cellSize(entry) * camera.zoom;

  ctx.save();
  ctx.translate(at.x, at.y);
  // Screen y runs down, so the world up vector becomes this angle.
  // Poses drawn on a diagonal need that angle taken back out, or the renderer
  // rotates them a second time on top of the angle the artist already gave them.
  ctx.rotate(Math.atan2(pose.up.x, pose.up.y) + (entry.tilt ?? 0));

  // Cells overlap by a hair. Without it, rotation leaves hairline seams where
  // neighbouring edges no longer land on the same device pixel.
  //
  // The overlap is a fraction of a cell rather than a flat six tenths of a
  // pixel, because a flat one is nothing at all on a big cell and most of the
  // block on a small one. The floor is here instead of on the spacing: a block
  // never drops below a pixel, so nothing disappears at speed, but the gaps
  // between them stay honest, so the figure as a whole is the size it should be.
  const size = Math.max(cell + Math.min(0.6, cell * 0.35), 1);

  for (let row = 0; row < entry.grid.length; row += 1) {
    const line = entry.grid[row];
    for (let col = 0; col < line.length; col += 1) {
      const colour = COLOURS[line[col]];
      if (!colour) continue;

      ctx.fillStyle = colour;
      ctx.fillRect((col - entry.com.col) * cell, (row - entry.com.row) * cell, size, size);
    }
  }

  ctx.restore();
}

// Where the web should start, in world metres. The same transform as the
// drawing, run backwards, so the line meets the glove exactly rather than
// nearly.
export function wristPosition(pose, poseName) {
  const entry = POSES[poseName] || POSES.neutral;
  const cell = cellSize(entry);

  const along = (entry.com.row - entry.wrist.row) * cell;
  const across = (entry.wrist.col - entry.com.col) * cell;

  // Same tilt the drawing applies, and it has to turn the same way.
  //
  // The canvas measures its angle from screen up toward screen right, so a
  // positive rotation there swings the body clockwise. Rotating the vector the
  // usual counterclockwise way instead puts the web line out by twice the tilt,
  // which on the diving pose is most of a right angle.
  const tilt = entry.tilt ?? 0;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  const up = { x: pose.up.x * cos + pose.up.y * sin, y: -pose.up.x * sin + pose.up.y * cos };
  const right = { x: up.y, y: -up.x };

  return {
    x: pose.pos.x + up.x * along + right.x * across,
    y: pose.pos.y + up.y * along + right.y * across,
  };
}
