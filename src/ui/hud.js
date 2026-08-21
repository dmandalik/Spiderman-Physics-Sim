// Writes the readouts into the DOM overlay.
//
// Kept out of the canvas so the text stays crisp and selectable, and so the
// renderer has one job. Every number comes from metrics(), which is pure, so
// the panel cannot quietly disagree with the simulation.

import { metrics } from '../physics/metrics.js';

const DEGREES = 180 / Math.PI;

export function createHud(root) {
  const fields = {};
  for (const el of root.querySelectorAll('[data-field]')) {
    fields[el.dataset.field] = el;
  }

  const toggle = root.querySelector('#hudToggle');
  let smoothedFps = 60;

  if (toggle) {
    toggle.addEventListener('click', () => setCollapsed(root, toggle, !isCollapsed(root)));
  }

  return {
    toggle: () => setCollapsed(root, toggle, !isCollapsed(root)),

    update(world, frameTime, mode) {
      if (frameTime > 0) smoothedFps += (1 / frameTime - smoothedFps) * 0.08;
      if (isCollapsed(root)) return;

      const m = metrics(world);

      set(fields.speed, m.speed.toFixed(1));
      set(fields.vx, m.vx.toFixed(1));
      set(fields.vy, m.vy.toFixed(1));
      set(fields.height, m.height.toFixed(1));
      set(fields.distance, m.distance.toFixed(0));
      set(fields.accel, m.acceleration.toFixed(1));

      set(fields.tension, (m.tension / 1000).toFixed(2));
      // Tension over body weight, so 3.0 means he feels three times his own
      // weight through the arm holding the web.
      set(fields.gforce, m.load.toFixed(2));
      set(fields.drag, m.drag.toFixed(0));
      set(fields.weight, m.weight.toFixed(0));
      set(fields.applied, m.applied.toFixed(0));
      set(fields.net, (m.net / 1000).toFixed(2));

      set(fields.kinetic, (m.kinetic / 1000).toFixed(1));
      set(fields.potential, (m.potential / 1000).toFixed(1));
      set(fields.energy, (m.total / 1000).toFixed(1));
      set(fields.power, (m.power / 1000).toFixed(1));
      set(fields.dragpower, (m.dragPower / 1000).toFixed(1));

      set(fields.web, world.web.attached ? m.webLength.toFixed(1) : 'free');
      set(fields.angle, world.web.attached ? (m.angle * DEGREES).toFixed(0) : '0');
      set(fields.omega, m.omega.toFixed(2));
      set(fields.centripetal, m.centripetal.toFixed(1));
      set(fields.period, m.period.toFixed(1));

      set(fields.mode, mode);
      set(fields.time, world.time.toFixed(0));
      set(fields.fps, Math.round(smoothedFps));
    },
  };
}

const isCollapsed = (root) => root.classList.contains('collapsed');

function setCollapsed(root, toggle, collapsed) {
  root.classList.toggle('collapsed', collapsed);
  if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
}

function set(el, value) {
  if (el && el.textContent !== String(value)) el.textContent = value;
}
