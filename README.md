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

## The character

Nothing about the pose is keyframed. There are no sprites and no animation
frames. Every joint is solved from the physics state each frame.

The arm holding the web is real two bone inverse kinematics. Given a shoulder
and an anchor there are only two elbow positions that let both bones reach, and
the solver picks one. If the anchor is further away than the arm is long the arm
straightens and points at it, which is the right answer rather than a failure.
The web is then drawn from the anchor to the hand, not to his centre of mass.

The body lines up with the web while he is hanging, because that is where the
pull is, and swings round to point along his velocity once he lets go, which is
what turns a fall into a dive. The legs tuck as he speeds up and trail against
the direction he is moving. The web line hangs in a curve when slack and snaps
straight under tension, and how far it hangs is exactly how much longer the web
is than the gap it spans, so the curve is reading the same number the solver is.

All four limbs go through the solver, the spine is four points that bow
sideways as he leans, and the shoulders and hips counter rotate the way real
bodies do. Every one of those values chases its target through a spring rather
than being set to it, so the body arrives with a little overshoot and settles.
That overshoot is most of the difference between a pose that was computed and
one that looks animated. The two legs are deliberately not mirror images, since
a body thrown around does not move as one lump.

The character is rendered in 3D on a transparent WebGL canvas sitting over the
painted city, with an orthographic camera locked to the same view. Orthographic
rather than perspective, because a vanishing point on the figure would disagree
with the flat parallax skyline behind it and read as a cutout pasted on. The
city, sky, web and HUD all stay on the 2D canvas underneath, so the whole
skyline still costs almost nothing to draw. If WebGL is unavailable the flat
painter takes over and the page still runs.

One honest cheat: he is drawn about four times life size. A 1.8 metre figure
against a 120 metre tower is a speck at any zoom that still frames the city.
The physics never sees that number, only the renderer does.

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
determinism, aim always picking the best reachable anchor, the city generating
the same way no matter which direction you arrive from, and the IK solver
landing the hand on its target without ever stretching a bone.

## Status

Phase 3 of 7. Physics core, the city and the character. The control panel, the
instrument readouts and the autopilot come next. See [SPEC.md](SPEC.md).
