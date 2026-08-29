// Street level. The terrace of shopfronts he swings over, and the things
// standing on the pavement in front of it.
//
// This is the layer that sells the city as a place rather than a skyline. The
// towers behind are a shape on the horizon; the shops are the bit with doors
// and awnings and a tree outside, and it is what the eye reads when he comes
// down low.
//
// Everything here is a description rather than a picture. The pixel grid behind
// a shop or a tree is built by the renderer the first time it is on screen,
// exactly like a tower.
//
// Nothing in this file carries an anchor, and that is on purpose. Webs stick to
// rooftops of real buildings only, so a shop awning, a lamp post and a tree are
// all scenery and none of them can be aimed at. Anything grabbable would also
// have to be tall enough to swing from, and none of this is.

import { mulberry32, hashInts, range, chance } from './random.js';
import { PROP_SIZES } from '../render/pixel/props.js';
import { STOREY } from '../render/pixel/facade.js';

// Heights are metres above the ground line, so the pavement and the road are
// both negative. The hero lands on the ground line itself, at the back of the
// pavement, which is why he never clips through any of this.
export const STREET = {
  prop: -2.6, // where the props stand, a little nearer the viewer
  kerb: -5.6, // pavement gives way to road
  road: -26, // as far down as the asphalt is ever worth painting
};

const SHOP_WIDTH = [15, 27];

// Straight off the reference. Saturated, warm, and no two neighbours alike.
const FACES = [
  '#c4633c', // rust brick
  '#e2c78d', // cream render
  '#d8a13c', // mustard
  '#a83f30', // brick red
  '#41837a', // teal
  '#d97a5e', // salmon
  '#7d90ad', // blue grey
  '#6f8a4e', // olive
  '#b5544f', // dusty red
  '#e7d5b0', // pale sand
];

const AWNINGS = ['#c9403c', '#2f6f63', '#2b5a8c', '#e0e0dc', '#d8892f'];

// Weighted by how much each one does for the picture. Trees are the signature
// of the reference street and there are several in every shot of it, so they
// come up roughly half the time and everything else shares the rest.
const PROPS = [
  'plane', 'oak', 'plane', 'conifer', 'sapling',
  'lamp', 'lamp', 'signal', 'stop', 'bench', 'bin', 'postbox', 'busStop', 'car',
];

export function generateStreetChunk(seed, chunkIndex, chunkWidth, ground) {
  const rng = mulberry32(hashInts(seed, 104729, chunkIndex));
  const start = chunkIndex * chunkWidth;
  const end = start + chunkWidth;

  const shops = [];
  // A terrace, not a row of sheds. Shopfronts share party walls in the
  // reference, so they are laid end to end with no gap between them.
  //
  // The last one in a chunk is stretched to land exactly on the boundary. Doing
  // the obvious thing instead, stopping when the next shop would overhang,
  // leaves a hole the width of a shop every two hundred and sixty metres, and
  // a terrace with a missing tooth is the first thing the eye finds.
  for (let x = start; x < end; ) {
    let width = range(rng, SHOP_WIDTH[0], SHOP_WIDTH[1]);
    if (x + width + SHOP_WIDTH[0] > end) width = end - x;

    shops.push(makeShop(rng, x, width));
    x += width;
  }

  const props = [];
  for (let x = start + range(rng, 2, 10); x < end; x += range(rng, 9, 18)) {
    props.push(makeProp(rng, x, ground));
  }

  return { shops, props };
}

// How tall the terrace stands.
//
// Taller than it was, and the reason is the trees in front of it. Street
// furniture is drawn at twice life so it reads next to a hero who is drawn at
// four times, which puts a mature oak at twenty three metres. A terrace topping
// out at twenty was being overtopped by its own planting, and a street where the
// trees are taller than the buildings reads as a park with shopfronts in it.
//
// So the frontage starts above the tallest thing that can stand in front of it.
const TERRACE = { short: [26, 32], tall: [34, 46] };

// How many floors fit in a given height, from the real storey heights the
// facade builder draws with. A shop gives its ground floor over to a tall
// shopfront; a house does not.
function storeysIn(height, kind) {
  const ground = kind === 'shop' ? STOREY.shopfront : STOREY.shop;
  return Math.max(Math.round((height - ground) / STOREY.shop), 2);
}

function makeShop(rng, x, width) {
  const tall = chance(rng, 0.35);
  // A terrace is shops with a couple of houses mixed into it, which is what
  // stops a hundred metres of frontage reading as one long parade.
  const kind = chance(rng, 0.76) ? 'shop' : 'townhouse';
  const band = tall ? TERRACE.tall : TERRACE.short;
  const height = range(rng, band[0], band[1]);

  return {
    x,
    width,
    height,
    face: FACES[Math.floor(rng() * FACES.length)],
    kind,
    // Follows from the height rather than being picked alongside it. A fixed
    // two or three floors over a building twice as tall as it used to be gives
    // storeys seven metres high, and the windows come out as doors.
    floors: storeysIn(height, kind),
    texture: chance(rng, 0.45) ? 'brick' : 'render',
    // Awnings are what give the reference its stripe of colour at eye level.
    // They are drawn over the sprite rather than into it, because they hang off
    // the front of the building and the grid stops at the wall. Only shops get
    // one: a house with a canopy over the front door is a hotel.
    awning: kind === 'shop' && chance(rng, 0.55)
      ? { colour: AWNINGS[Math.floor(rng() * AWNINGS.length)], drop: range(rng, 1.1, 1.7) }
      : null,
    seed: Math.floor(rng() * 0xffffffff),
    sprite: null,
  };
}

function makeProp(rng, x, ground) {
  const kind = PROPS[Math.floor(rng() * PROPS.length)];

  return {
    kind,
    x,
    base: ground + STREET.prop,
    // Real trees are not all the same tree. A tenth either way is enough to
    // break up a row without any of them looking wrong next to a door.
    scale: PROP_SIZES[kind] ? range(rng, 0.88, 1.14) : 1,
    seed: Math.floor(rng() * 0xffffffff),
    sprite: null,
  };
}
