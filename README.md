# Spider Swing

A Spider-Man swinging simulator where the physics is real. Every control
changes a constant in the solver, not an animation curve.

Built with plain JavaScript and Canvas 2D. No dependencies, no build step.

## Run it

```
npm run serve
```

Then open http://localhost:8000. Any static server works, but the page uses ES
modules so opening the file directly will not work.

## Controls

| Input | Action |
| --- | --- |
| Hold click | Shoot a web at the cursor |
| Space | Toggle the web |
| W and S | Reel the web in and out |
| R | Reset |

## What is actually being simulated

Spider-Man is a point mass under gravity and quadratic air drag. The web is a
constraint between him and an anchor.

- **Rigid mode** solves the web as a position constraint. After each step, if
  he is further from the anchor than the web is long, he gets projected back
  onto the circle and the radial part of his velocity is removed. A rope pulls
  and never pushes, so nothing happens while it is slack.
- **Elastic mode** solves the web as a damped spring in tension only, which
  stretches and snaps back the way real webbing would.
- **Reeling** shortens the web under load, which does work on the system and
  adds energy, the same way pumping a playground swing does.

Physics runs at a fixed 240 Hz on an accumulator, so the result does not depend
on your display refresh rate, and the renderer interpolates between the last
two states. Everything under `src/physics` is pure and knows nothing about
pixels, which is what makes it testable.

## Tests

```
npm test
```

Covers free fall against the closed form solution, rope length under load,
slack webs doing nothing, tension at rest equalling one body weight, energy
conservation without drag, energy loss with drag, reeling adding energy, and
determinism.

## Status

Phase 1 of 7. Physics core and a placeholder renderer. The city, the character
art, the control panel, the instrument readouts and the autopilot come next.
See [SPEC.md](SPEC.md).
