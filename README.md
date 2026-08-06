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

Add `?seed=123` to the URL for a different city. The same seed always gives the
same skyline.

## Controls

| Input | Action |
| --- | --- |
| Hold click | Shoot a web at the nearest anchor to the cursor |
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

Buildings are scenery. He swings past them rather than into them, and the only
thing they contribute to the physics is their rooftops, which are the only
places a web will stick.

Physics runs at a fixed 240 Hz on an accumulator, so the result does not depend
on your display refresh rate, and the renderer interpolates between the last
two states. Everything under `src/physics` is pure and knows nothing about
pixels, which is what makes it testable.

## The city

The city is endless and never stored, only derived. It is cut into 260 metre
chunks, and a chunk is a pure function of the seed, the layer and the chunk
index, so you can swing east for ten minutes, come back, and every window is
where you left it. Chunks are cached only to save regenerating what is on
screen, and the cache can be dropped at any time without changing anything.

Three layers scroll at different rates for depth. Only the nearest one carries
anchors. The far layers are pale and the near one is nearly black, because
distance eats contrast, and the haze painted between them is doing most of the
work.

## Tests

```
npm test
```

Covers free fall against the closed form solution, rope length under load,
slack webs doing nothing, tension at rest equalling one body weight, energy
conservation without drag, energy loss with drag, reeling adding energy,
determinism, aim always picking the best reachable anchor, and the city
generating the same way no matter which direction you arrive from.

## Status

Phase 2 of 7. Physics core and the city. The character art, the control panel,
the instrument readouts and the autopilot come next. See [SPEC.md](SPEC.md).
