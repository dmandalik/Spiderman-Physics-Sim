// A drawing surface made of cells.
//
// Every sprite in the city is built by writing letters into one of these and
// handing back the rows. Keeping the mechanics in one place means a facade and
// a fire hydrant are made the same way, which is the only reason a hydrant ends
// up looking like it belongs to the same drawing as a skyscraper.

// The one reserved key. Nothing is painted where a cell holds this, which is
// what lets a tree be a tree shape rather than a green rectangle.
export const CLEAR = '.';

export function createGrid(cols, rows, fillKey = CLEAR) {
  // Rows of one letter strings. The obvious optimisation is a flat typed array
  // of character codes, and it was tried: on a real tower workload it came out
  // 1.7 times slower, because engines handle arrays of interned one letter
  // strings very well and rebuilding the rows with fromCharCode at the end
  // costs more than the writes ever save. Left plain on purpose.
  const cells = Array.from({ length: rows }, () => new Array(cols).fill(fillKey));

  const inside = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;

  const api = {
    cols,
    rows,

    at(x, y) {
      return inside(x, y) ? cells[y][x] : CLEAR;
    },

    set(x, y, key) {
      if (inside(x, y)) cells[y][x] = key;
      return api;
    },

    fill(x, y, w, h, key) {
      const left = Math.max(x, 0);
      const right = Math.min(x + w, cols);
      if (right <= left) return api;

      for (let j = Math.max(y, 0); j < Math.min(y + h, rows); j += 1) {
        const row = cells[j];
        for (let i = left; i < right; i += 1) row[i] = key;
      }
      return api;
    },

    // A filled disc, rasterised rather than approximated. Circles are where
    // hand written profiles stop being worth it: the stepping a real
    // rasterisation gives you lands in the right places by construction, which
    // is exactly what a hand drawn approximation keeps getting wrong.
    disc(cx, cy, radius, key) {
      const r2 = radius * radius;
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) api.set(x, y, key);
        }
      }
      return api;
    },

    // Everything that is not clear, wrapped in a keyline. Corners included, so
    // a diagonal edge never leaks the background through it.
    //
    // Read from a snapshot, because writing the keyline into the same grid you
    // are testing would grow the outline outward one cell per column.
    outline(key) {
      const solid = cells.map((row) => row.map((cell) => cell !== CLEAR));
      const filled = (x, y) => (inside(x, y) ? solid[y][x] : false);

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          if (filled(x, y)) continue;
          const touches = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)
            || filled(x - 1, y - 1) || filled(x + 1, y - 1) || filled(x - 1, y + 1) || filled(x + 1, y + 1);
          if (touches) cells[y][x] = key;
        }
      }
      return api;
    },

    done() {
      return cells.map((row) => row.join(''));
    },
  };

  return api;
}

// Metres per art pixel, shared by everything drawn on this grid.
//
// That single number is what makes the whole city one drawing: a nine metre
// shop and a nine metre tree are the same number of cells, so their detail is
// the same coarseness whether you are looking at brickwork or leaves.
//
// It is also the number that decides whether any of this reads as pixel art,
// and it was measured rather than chosen. The reference sheet's tall tower is
// thirty five metres wide and eighty six art pixels across, which is 0.4 metres
// a pixel. At the 0.2 it used to be, the same tower came out a hundred and
// seventy five cells wide: twice the reference's resolution, so an art pixel
// landed on one or two screen pixels and the grid disappeared. Twice as coarse
// is not a loss of detail, it is the entire look.
export const CELL = 0.4; // metres

// Cells for a length in metres, never less than one, so a fire hydrant does not
// round away to nothing.
//
// The ratio is trimmed before rounding because binary floating point does not
// divide these numbers cleanly: 1.4 / 0.4 comes out as 3.4999999999999996, which
// rounds down and made a post box exactly as tall as a litter bin. Every length
// in the city is a metre figure with one decimal place, so six is far more
// precision than any of them carry and none of them can lose anything real.
export const cells = (metres) => Math.max(Math.round(Number((metres / CELL).toFixed(6))), 1);
