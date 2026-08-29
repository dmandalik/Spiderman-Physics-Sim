// The lab panel. One control per number the simulation will let you turn.
//
// Built from the TUNABLES list rather than from markup, so adding a knob is one
// line in one file and the slider, the label, the units, the clamping and the
// live readout all follow. Writing it as HTML would mean the range in the panel
// and the range the solver expects could drift apart without anything noticing.
//
// Everything writes straight into the live parameter objects. There is no apply
// button because there is no reason for one: the solver reads params every step,
// so gravity changes under him mid swing, which is most of the fun.

import { TUNABLES, PRESETS, tunableValue, setTunable, tunableActive } from '../physics/tunables.js';
import { terminalSpeed, swingPeriod } from '../physics/metrics.js';
import { textCanvas } from '../render/pixel/font.js';

// The lab keeps real inputs, because a slider has to be draggable and reachable
// by keyboard and a canvas is neither. Only the text is painted, which is the
// part that was breaking the look.
const LABEL_SCALE = 2;
const INK = '#e8eeff';
const DIM = '#8792b5';
const ACCENT = '#4de2ff';

// Swaps an element's contents for the same words in bitmap type.
//
// A canvas has no text in it, so anything that was carrying its name as text
// loses it. The label goes back on as an aria-label, or the preset buttons are
// six identically unnamed controls to anything that is not a pair of eyes.
function pixelate(el, text, colour = DIM, scale = LABEL_SCALE) {
  el.replaceChildren(textCanvas(String(text), scale, colour));
  el.setAttribute('aria-label', String(text));
}

// The rope length the panel quotes a period for. A round number, so the figure
// is comparable as you drag gravity around rather than drifting with his swing.
const SAMPLE_ROPE = 20; // metres

export function createControls(root, state, onReset) {
  const rows = [];

  root.append(header(), presetBar(state, () => refresh()), ...groups(state, rows, () => refresh()));
  root.append(derived(state, rows), resetButton(onReset));

  function refresh() {
    for (const row of rows) row.sync();
  }

  return {
    refresh,
    show(visible) {
      root.classList.toggle('hidden', !visible);
      if (visible) refresh();
    },
  };
}

// The panel's own title. Built here rather than in the markup so it is bitmap
// type like everything else, instead of being the one line of smooth text left
// on the screen.
function header() {
  const box = document.createElement('div');
  box.className = 'labHeader';

  const title = document.createElement('h1');
  pixelate(title, 'Lab', ACCENT, 3);

  const note = document.createElement('p');
  pixelate(note, 'applied now', DIM, 2);

  box.append(title, note);
  return box;
}

// Whole worlds, one click each.
function presetBar(state, changed) {
  const bar = document.createElement('div');
  bar.className = 'presets';

  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.className = 'preset';
    pixelate(button, preset.name);
    button.addEventListener('click', () => {
      for (const [key, value] of Object.entries(preset.values)) {
        const tunable = TUNABLES.find((t) => t.key === key);
        if (tunable) setTunable(state, tunable, value);
      }
      changed();
    });
    bar.append(button);
  }

  return bar;
}

function groups(state, rows, changed) {
  const out = [];
  let current = null;

  for (const tunable of TUNABLES) {
    if (tunable.group !== current) {
      current = tunable.group;
      const heading = document.createElement('h2');
      heading.className = 'group';
      pixelate(heading, current, ACCENT);
      out.push(heading);
    }

    const row = buildRow(state, tunable, changed);
    rows.push(row);
    out.push(row.el);
  }

  return out;
}

function buildRow(state, tunable, changed) {
  const el = document.createElement('div');
  el.className = 'control';
  el.title = tunable.note || '';

  const label = document.createElement('label');
  label.className = 'label';
  pixelate(label, tunable.label);

  const readout = document.createElement('span');
  readout.className = 'value';

  const input = tunable.kind === 'switch'
    ? switchInput(state, tunable, changed)
    : tunable.kind === 'choice'
      ? choiceInput(state, tunable, changed)
      : sliderInput(state, tunable, changed);

  label.htmlFor = input.id;
  // The label's own text is a canvas now, so the input is named directly.
  input.setAttribute('aria-label', tunable.label);
  if (tunable.note) input.title = tunable.note;
  el.append(label, readout, input);

  return {
    el,
    sync() {
      const value = tunableValue(state, tunable);
      const active = tunableActive(state, tunable);

      el.classList.toggle('inactive', !active);
      if (tunable.kind === 'switch') {
        input.checked = Boolean(value);
        pixelate(readout, value ? 'on' : 'off', INK);
      } else if (tunable.kind === 'choice') {
        input.value = value;
        readout.replaceChildren();
      } else {
        input.value = String(value);
        pixelate(readout, format(value, tunable), INK);
      }
    },
  };
}

function sliderInput(state, tunable, changed) {
  const input = document.createElement('input');
  input.type = 'range';
  input.id = `t-${tunable.target}-${tunable.key}`;
  input.min = String(tunable.min);
  input.max = String(tunable.max);
  input.step = String(tunable.step);
  input.value = String(tunableValue(state, tunable));

  input.addEventListener('input', () => {
    setTunable(state, tunable, input.value);
    changed();
  });

  return input;
}

function choiceInput(state, tunable, changed) {
  const select = document.createElement('select');
  select.id = `t-${tunable.target}-${tunable.key}`;

  for (const option of tunable.options) {
    const item = document.createElement('option');
    item.value = option;
    item.textContent = option;
    select.append(item);
  }

  select.value = tunableValue(state, tunable);
  select.addEventListener('change', () => {
    setTunable(state, tunable, select.value);
    changed();
  });

  return select;
}

function switchInput(state, tunable, changed) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `t-${tunable.target}-${tunable.key}`;
  input.checked = Boolean(tunableValue(state, tunable));

  input.addEventListener('change', () => {
    setTunable(state, tunable, input.checked);
    changed();
  });

  return input;
}

// What the numbers above add up to. This is the part that teaches: drag on its
// own is an abstraction, but watching terminal speed fall as you raise it is
// the equation doing something.
function derived(state, rows) {
  const box = document.createElement('div');
  box.className = 'derived';

  const heading = document.createElement('h2');
  heading.className = 'group';
  pixelate(heading, 'That means', ACCENT);

  const terminal = line('Terminal speed', 'm/s');
  const weight = line('Weight', 'N');
  const period = line(`Period on ${SAMPLE_ROPE} m`, 's');

  box.append(heading, terminal.el, weight.el, period.el);

  // Piggy backs on the same refresh the sliders use, so it can never lag them.
  rows.push({
    el: box,
    sync() {
      const { params } = state;
      const v = terminalSpeed(params);
      terminal.set(Number.isFinite(v) ? v.toFixed(1) : 'none');
      weight.set((params.mass * params.gravity).toFixed(0));
      const t = swingPeriod(params, SAMPLE_ROPE);
      period.set(Number.isFinite(t) ? t.toFixed(2) : 'never');
    },
  });

  return box;
}

function line(name, unit) {
  const el = document.createElement('div');
  el.className = 'stat';

  const label = document.createElement('span');
  label.className = 'label';
  pixelate(label, name);

  const value = document.createElement('span');
  value.className = 'value';

  const units = document.createElement('span');
  units.className = 'unit';
  pixelate(units, unit, DIM);

  el.append(label, value, units);
  return { el, set: (text) => pixelate(value, text, INK) };
}

function resetButton(onReset) {
  const button = document.createElement('button');
  button.className = 'preset wide';
  pixelate(button, 'Back to real');
  button.addEventListener('click', onReset);
  return button;
}

function format(value, tunable) {
  if (tunable.step >= 1) return String(Math.round(value));
  if (tunable.step >= 0.1) return Number(value).toFixed(1);
  return Number(value).toFixed(2);
}
