// Poses, one grid each, drawn upright with the head at the top. The painter
// rotates the whole grid so the body lines up with the web, so each of these
// only ever needs drawing once, facing one way.
//
// `neutral` is not hand drawn. It is a pixel exact trace of the reference art,
// produced by tools/trace-sprite.js, which decodes the image, works out how
// many screen pixels one art pixel became, and samples the centre of every
// cell. Copying pixel art by eye does not work, so it was not copied by eye.
//
// Grids do not all have to be the same size. Each one carries its own
// dimensions, where the centre of mass sits inside it, and which cell is the
// web wrist.

// Sampled straight out of the reference rather than chosen.
export const COLOURS = {
  a: '#020000', // outline
  b: '#d2332f', // suit red
  c: '#b91c18', // red in shadow
  d: '#1465c0', // suit blue
  e: '#0a48a3', // blue in shadow
  f: '#22247c', // deepest blue
  g: '#fdfcff', // eye white
  h: '#adadad', // eye shading
};

// Traced from the reference, 21 wide by 42 tall, not one pixel off.
const perch = [
  '.......aaaaa.........',
  '......aacbbcaa.......',
  '.....acbbbbbbca......',
  '.....accccbbbbca.....',
  '....accacccbbbba.....',
  '....accaaacbbbbba....',
  '....accaghabbbbba....',
  '....accagghabbbba....',
  '....accahhhgaabca....',
  '....aacaahggabbaa....',
  '.....acccaaabbba.....',
  '.....accccbbbbba.....',
  '......aaccbbbbca.....',
  '.......accbbbba......',
  '.......acccbba.......',
  '.....aaacccaaa.......',
  '...aabbcccbbbcaa.....',
  '..abbbbbbbbababca....',
  '..abbbbbbbbbabbca....',
  '..abeeddbbbbabbaa....',
  '.abbdadddbbababaa....',
  '.acddaafddbbbbaea....',
  '.acdaaaafddbbbaeah...',
  'abdda...addbbbaffa...',
  'abfa....affbbbafca...',
  'abbac..cffffbbbaccc..',
  'abbcca.aedddeefaccaa.',
  'abbbbcadddddddeeacbba',
  'acbbbaadddddeeeeacbaa',
  '.aabcaadedaaaeeeacca.',
  '...aa.aeedaaefeeaaa..',
  '.....aefda.affeea....',
  '.....adea..aaeea.....',
  '.....adda..aaeea.....',
  '....abdda..aeeea.....',
  '....acba...acca......',
  '....acca...acca......',
  '....aba....acca......',
  '...aaba....acca......',
  '...acba....accbaa....',
  '..aabca....accbbba...',
  '..aaaa......aaaaa....',
];

const neutral = [
  '.................aaaaa..........',
  '...............aacbbcaa.........',
  '..............acbbbbbbca........',
  '....aaa......acbbbbcccca........',
  '...abbba.....abbbbcccacca.......',
  '...abbbba...abbbbbcaaacca.......',
  '...abbba....abbbbbahgacca.......',
  '....aabba...abbbbahggacca.......',
  '.....abbba..acbaaghhhacca.......',
  '......abba..aabbagghaacaa.......',
  '......abbba..abbbaaaccca........',
  '.......abba..abbbbbcccca........',
  '.......abbba.acbbbbccaa.........',
  '........abbba.abbbbcca..........',
  '........abbbba.abbccca..........',
  '........abbbba.aaacccaaa........',
  '.........abbbbacbbbcccbbaa......',
  '.........abbbbbababbbbbbbba.....',
  '..........abbbbbabbbbbbbbba.....',
  '...........abbbbabbbbddeeba.....',
  '...........abbbbbabbdddadbba....',
  '............abbbbbbddfaaddca....',
  '.............aabbbddfaaaadca....',
  '..............abbbddaeeeaddba...',
  '..............abbbffaeeeeafba...',
  '.............abbbffffceecabba...',
  '.............afeedddeaeaccbba...',
  '............aeedddddddacbbbba...',
  '.....a.....aaeeeedddddaabbbca...',
  '....abaa.aaceaaaaaadedaacbaa....',
  '.....abaaaccceaaeaadeea.aa......',
  '.....abbccccaa..aa.aaa..........',
  '......acccaa....ada.............',
  '......aacaa....aaefa............',
  '........a.....adddea............',
  '.............aabdaa.............',
  '.............accba..............',
  '............aaccaa..............',
  '..........aabbaa................',
  '..........acca..................',
  '..........aaaa..................',
  '...........aa...................',
  '............a...................',
  '................................',
];

// Built from the traced sprite rather than drawn fresh, so the head, torso,
// palette and proportions stay exactly the reference. Only the right arm
// changes: punched up toward the anchor, with the index and pinky out and the
// middle two folded, which is the one gesture everyone recognises.
const webbing = [
  '.....................acaa....',
  '....................acaaa.aaa',
  '....................accccacaa',
  '...................aacccacaca',
  '..................aacaccaaaca',
  '...........aaaaaaaaaccccaacaa',
  '.........aaaaaaaaaccacccaacaa',
  '........aaaaacccccaecaacbbaa.',
  '.......aaacccccccccbaaabbaaa.',
  '......aaabbccbbccccacaaccca..',
  '.....aaabbbbcbbbbbabccaccaa..',
  '.....aacbbcccccccccbbbcabaa..',
  '....aaacccccccbaaaaaaaaacaa..',
  '....aaccbccbbbbaaggggaacaaa..',
  '....aaccccbbbbaaggggggabaaa..',
  '....aabccccccccaagggggacaa...',
  '....aaccccccccccagggggaaca...',
  '....accbcccccbbbaagggaaaca...',
  '.....aabbbcccbbbcaaaaaccaa...',
  '.....aacccbbccbbccbbccabaa...',
  '......aacccccccbbcbbbabcaa...',
  '.......aacbbccccacbbbabaa....',
  '........aacccccaccccbaaca....',
  '.........aaaabacbbacaaca.....',
  '..........acaccaaaaaaaa......',
  '..........aaccccaaaaaa.......',
  '.........acacaeaacccaca......',
  '.........aabceeeaccaaaa......',
  '........aaaceeaeeccaaaa......',
  '........aacceaeeecccaaa......',
  '........aacceaaeecccaaa......',
  '.......acaccaaaceacccaa......',
  '.......aaabbaaacbcbccaa......',
  '.......accccceeecbbbaa.......',
  '..aaaaaaaaccaaeeeaccaa.......',
  '.acacccaeeeaaeeeeeeeaa.......',
  'acacccaeeeeeeeeeaaeaaa.......',
  'acccccceeeeeeeaaaeeaa........',
  'caccccceeeeeacaaeeeaa........',
  'accccaaceccaaaceeeaa.........',
  'cacaaaaaaaaaaaaeeeaa.........',
  'aaaa.......aaaaaaaa..........',
  '..........acaccaaaa..........',
  '..........acaaaaaa...........',
  '..........acbbaaa............',
  '..........acabaa.............',
  '...........acca..............',
];

// Traced from the generated pose references. Each one is resampled to a grid
// by tools/trace-sprite.js and mapped onto the palette above, so every pose
// shares one set of colours no matter what the generator handed back.
const bottomSwing = [
  '...........abababa...',
  '...........abbabaa...',
  '...........aabaaaa...',
  '...........aabaaaa...',
  '........aaaabbbaa....',
  '......aaabababbaa....',
  '...aaaaaaaaacabaa....',
  '..aaaabbbbbcbbaaa....',
  '.aaabbbbbbbbcbbaba...',
  'aaabbbbbbbbcbccbaba..',
  'aabbcbbbbbbbbcbbbaa..',
  'bbbbbbbbbbaaaaaccbaa.',
  'abbbbbbbbbaaggaaccaa.',
  'abbbbbbbbbaggggaaaaaa',
  'bbbbbbbbbbaggggggabaa',
  'bbbbbbbbbbaagggggabaa',
  'abbbbbbbbbbaggggaabaa',
  'babbbbbbbbbaaaaaaccaa',
  'aabbbbbbbbbbbaaabccba',
  'abbbbbbbbbbbbbbbcacaa',
  '.aabbbbbbbbcbbcbccaa.',
  '..ababbbbbcbbcbbbaaa.',
  '...afabbcbcbcbbaaaa..',
  '....aaaababbbaafaa...',
  '.....aaabaaaaaafa....',
  '.....aabbcbbbcaaa....',
  '....aaacaaabbaaaa....',
  '....aabbfffaaaabaa...',
  '....aabcfaabbbaaaaaa.',
  '....abcaaabbbbaaaaaaa',
  '....aabcccccbbafeefaa',
  '....abbbbcbbafeeefeea',
  '.....aaabbaaffeeeeffa',
  '......aabaeffffaaeeaa',
  '......aaffeeeffafffaa',
  '......aafeffeaaabaaaa',
  '.......aaafaffaccbaaa',
  '........aaaaaabbbaaba',
  '.........aaaaaccbaaa.',
  '............aaacaaaa.',
  '.............aabaaaa.',
  '.............aabbaa..',
  '..............abaa...',
];

const upSwing = [
  '............aaaaca....',
  '...........aaacaca....',
  '...........aaaaaaaa...',
  '...........acaaaaaa...',
  '.....aaaaaaaaabaaa....',
  '....acaaaaacacbaaa....',
  '...acaaaaacbbaacaa....',
  '..aaaccacaaabcaaaa....',
  '.aacbbbabbcacaacaa....',
  'aabbbbaabbccabbbbaa...',
  'aabbbbcabbbaacbbbca...',
  'ccbbbbcccbaaaaaabbaa..',
  'ccbbbbbcbbaggggaaaaa..',
  'acbbbbbcabaggggggaaaa.',
  'acbbbbbbabaggggggaaaa.',
  'acbbbbbbabaaggggaacaa.',
  'ccbbbbbbabcaaaaaaccaa.',
  'aabbbbbcacffaaaccbbaa.',
  '.aabbbbbccffabbbacaa..',
  '..aacbbbcbafacbbccaa..',
  '..acabbbacffabbccaa...',
  '...aaaaaabafacbaaa....',
  '.....aaaacffaaaaa.....',
  '......aaaaffabaaaa....',
  '......aaaaffabbcaa....',
  '.......aafaaabbaaa....',
  '.......aaffffcbcaa....',
  '.......aaffffcccaa....',
  '.......aafffffbbaaaaa.',
  '........afffffcbcaaaaa',
  '.......acffffacaafffaa',
  '.......acaccbcffffffff',
  '........aacfffffffffff',
  '........aaaffffffaffff',
  '........acffffffaaffff',
  '.........aaffffaacaaaa',
  '..........afffffabbcaa',
  '.........aafffffbbbaa.',
  '.......aaaaffffabbbca.',
  '......aaccaffffaabaaa.',
  '.....aaccccaffaacaaca.',
  '.....aaccccaaaa.aaaa..',
  '.....accccaaaa....a...',
  '.....aaccaaa..........',
  '.....aaaaa............',
];

const downSwing = [
  '.............................................afa',
  '............................................aacc',
  '...........................................aaccc',
  '..........................................aaccaa',
  '...........................aaaaa.........aaccaaa',
  '.........................aabaaccaa......aaccacaa',
  '........................aaaaaaaaaaa....aaaccacaa',
  '.......................aaaccbccbcafa..aaccccaaa.',
  '......................aaccccbccccccaaaaacbcaaa..',
  '.....................aaacccaacccccbcaaacccaa....',
  '....................affccccaabbaacccacbccaa.....',
  '....................aabbcccaabbbbaaaccbcaa......',
  '....................afccccccabbbbbaccccaa.......',
  '....................afccccccabbbbaccffaa........',
  '....................abccccccaabbacaffaba........',
  '....................abcccccccaaaafffaafa........',
  '....................aaacccccaaafffaacaaa........',
  '....................abacccccccffffccccaa........',
  '..................aaaabacaacafffaccccca.........',
  '..............aaaaabcacaaaccfffaccccaaa.........',
  '............aabaaaaacccaffcffacbbbaaaa..........',
  '...........abaaafffffaaffaffaacaacaa............',
  '..........abaccfffffaafffaaaaaabaaa.............',
  '.........aaacccaaaaaafffaccbccca................',
  '.........aacccaaabaaffffabcccaa.................',
  '.........aaccaaabaacfffabcccaa..................',
  '..........aaaaabaaacafabbccaca..................',
  '...........aaabafffccacbbbaaa...................',
  '............abafffffcbcbcaaa....................',
  '...........afaffffffccbbafa.....................',
  '..........aaafffffffcccaaa......................',
  '.........aaaffffffffaaaa........................',
  '.......aaaffffffaaafaaa.........................',
  '.....aacaffffffafffffa..........................',
  '....abaafffffaafffaaa...........................',
  '...aaacfffffaffffaaa............................',
  '..ababbcffaafffaaa..............................',
  '.aaacbbbaaafffaaa...............................',
  'aaabcbccaaffaaa.................................',
  'fabcbbaaccaaaa..................................',
  'cbbbbaccacaa....................................',
  'cbbbaccafa......................................',
  'abcacccca.......................................',
  'caaacaaa........................................',
];

const freeFlight = [
  '.............aaccaaaaaa........',
  '............accaacaaaaaa.......',
  '...........acaccccccccaaa......',
  '..........aaacccccccccccaa.....',
  '.........aaacccccccccccccaa....',
  '........acccccccccccccccccca...',
  '........aaccccccccaacaccccca...',
  '........acccccccccaaaaaaaccaa..',
  '........aaccccccccaaggggaaaaa..',
  '........aaccccccccaaggggggacca.',
  '........aacccccccccagggggaaaca.',
  '........aacccccccccaaggggacaaa.',
  '....aaaaaaccccccccccaaaaaacaaa.',
  '.aaacaccaaaccccccccccaaaccccaa.',
  'aaaaccccccaacccccccccccccccaa..',
  'accccccfaacacccccccccccccccaa..',
  'accccaafeffcaaccccccccccccaa...',
  'accccaaafeeaccacccccccccaaaa...',
  'acaaaaaaaafffcccaaaacaaaaaa....',
  'aaaaaa..aaafffccccaacaaa.......',
  '.aaaa...aaaaffccccaaaaaa.......',
  '........aafeefcccccacaaaaa.....',
  '........aafeefccccafaccaaaaa...',
  '.......aaafeffccccfafffcccaaaa.',
  '...aaa.aaccfaacccccaaafacccaaaa',
  '..aacaaaaaccaccccaaaaafacccccca',
  'aaaaccacffaccccccaa...aacaacaaa',
  'cacccccaaefffcccaafa...aaaccaa.',
  'cccccccfaeeefffaffaca...aaacaa.',
  'acccacffffeeafffeffaca.....aa..',
  '.aaacffffeeeaffffeeefa.........',
  '....acaffefaecaaafefaa.........',
  '.....aaafaaaaaaaeeefaa.........',
  '.......aaaaaaacaeeffca.........',
  '..........acacccafaaa..........',
  '..........aaccccaaaa...........',
  '..........aaccaaaa.............',
  '..........acccaa...............',
  '...........aaaa................',
];

// ---------------------------------------------------------------- the keyline

// The outline key. Also used for line work inside the drawing, which is why
// tidying it needs a rule rather than a search and replace.
const OUTLINE = 'a';
const CLEAR = '.';
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// One keyline rule for every pose, derived rather than drawn.
//
// The two traced poses came off the reference with a clean single cell outline.
// The five swing poses were built separately and theirs runs two and three cells
// thick in places and stops altogether in others, which is what makes them read
// as a different, blobbier character: fifty odd cells of stray black on each,
// mostly piled around the head.
//
// Two passes, and the order matters. Strip every outline cell more than one away
// from any coloured cell, which takes the second and third layers off and leaves
// the line work inside the suit alone because every cell of that touches red.
// Then put exactly one cell back wherever the drawing meets air. Both passes ask
// only about coloured neighbours, and neither pass writes a coloured cell, so
// they cannot interfere with each other.
//
// Padded by one first, because several of these run right off the edge of their
// own grid and a keyline needs somewhere to go. `com` and `wrist` move with the
// padding and `scaleRows` is pinned to the grid it was measured against, so the
// figure is drawn at exactly the size and position it was before.
function keylined(entry) {
  const source = entry.grid;
  const cols = source[0].length + 2;
  const rows = source.length + 2;

  const cells = Array.from({ length: rows }, () => new Array(cols).fill(CLEAR));
  for (let y = 0; y < source.length; y += 1) {
    for (let x = 0; x < source[y].length; x += 1) cells[y + 1][x + 1] = source[y][x];
  }

  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? CLEAR : cells[y][x]);
  const coloured = (x, y) => {
    const key = at(x, y);
    return key !== CLEAR && key !== OUTLINE;
  };
  const touchesDrawing = (x, y) => AROUND.some(([dx, dy]) => coloured(x + dx, y + dy));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (cells[y][x] === OUTLINE && !touchesDrawing(x, y)) cells[y][x] = CLEAR;
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (cells[y][x] === CLEAR && touchesDrawing(x, y)) cells[y][x] = OUTLINE;
    }
  }

  return {
    ...entry,
    grid: cells.map((row) => row.join('')),
    com: { col: entry.com.col + 1, row: entry.com.row + 1 },
    wrist: { col: entry.wrist.col + 1, row: entry.wrist.row + 1 },
    // Grown by the two rows the padding added.
    //
    // The scale reference counts rows against the drawn height, so padding the
    // grid without padding this made every pose five to seven percent taller
    // than it says it is. Two rows of air added to the picture have to be two
    // rows added to what the picture is measured against.
    scaleRows: (entry.scaleRows ?? source.length) + 2,
  };
}

// `com` is where the point mass the physics simulates lands inside the drawing.
// `wrist` is where the web line ends, so it always leaves his glove.
const DRAWN = {
  webbing: { grid: webbing, com: { col: 14.5, row: 29.1 }, wrist: { col: 22.5, row: 0.5 }, scaleRows: 46 },
  downSwing: { grid: downSwing, com: { col: 24, row: 27.3 }, wrist: { col: 46, row: 0.5 }, tilt: -0.65, scaleRows: 46 },
  bottomSwing: { grid: bottomSwing, com: { col: 10.5, row: 26.7 }, wrist: { col: 14, row: 0.5 }, scaleRows: 46 },
  upSwing: { grid: upSwing, com: { col: 11, row: 27.9 }, wrist: { col: 14.5, row: 0.5 }, scaleRows: 46 },
  freeFlight: { grid: freeFlight, com: { col: 15.5, row: 24.2 }, wrist: { col: 17.5, row: 0.5 }, scaleRows: 46 },
  perch: { grid: perch, com: { col: 10, row: 17.6 }, wrist: { col: 18.5, row: 28 } },
  neutral: { grid: neutral, com: { col: 16, row: 26 }, wrist: { col: 5, row: 5 } },
};

export const POSES = Object.fromEntries(
  Object.entries(DRAWN).map(([name, entry]) => [name, keylined(entry)]),
);
