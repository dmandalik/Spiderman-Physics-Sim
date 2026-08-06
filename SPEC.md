# Spider Swing

A physics sandbox where Spider-Man swings through a procedural city. Every
slider changes a real constant in the solver, not an animation curve.

## Goals

1. The physics is honest. A rope is a constraint, a web is a spring, drag is a
   force. Energy is conserved when it should be and lost when it should be.
2. It looks and feels good enough to hand someone a link and let them play.
3. It is small enough to finish. No build step, no dependencies, no framework.

## Stack

Vanilla JS, ES modules, Canvas 2D. Node 18+ only for running tests with
`node:test`. Deployed straight from `main` to GitHub Pages.

## Coordinates and units

Physics runs in SI units in a y-up world frame. Meters, kilograms, seconds.
The renderer flips y and scales by pixels per meter. Nothing in `src/physics`
knows what a pixel is.

Rough scales: Spider-Man is 1.8 m and 75 kg, buildings are 30 to 120 m, swing
speeds land around 20 to 40 m/s.

## Physics model

**Loop.** Fixed timestep accumulator at 240 Hz with a clamp on long frames, so
the simulation is deterministic and independent of display refresh rate.
Rendering interpolates between the last two states.

**Free flight.** Semi implicit Euler. Gravity plus quadratic air drag,
`F_drag = -k |v| v`.

**Web, rigid mode.** A position based distance constraint. After integrating,
if the distance to the anchor exceeds the rest length, the position is
projected back onto the circle and the radial component of velocity is
removed. A rope pulls and never pushes, so nothing happens while slack.

**Web, elastic mode.** A damped spring along the web line,
`F = -k (L - L0) d̂ - c (v · d̂) d̂`, active only in tension. Stiff springs
overshoot and bounce, which is closer to how real webbing would behave.

**Reeling.** Changing the rest length while under tension does work on the
system. Reeling in during the bottom of a swing pumps energy in, exactly like
standing up on a playground swing. This is real, not a cheat.

**Energy.** `KE = ½ m |v|²`, `PE = m g y`. With drag off and rigid webs, total
energy should hold flat, which doubles as a check that the integrator is not
leaking energy.

## Feature list

- Two web models, switchable live
- Reel in and out
- Sliders for gravity, mass, drag, stiffness, damping, web range, time scale
- Presets such as Earth, Moon, Zero Drag, Bungee, Slow Motion
- Procedural seeded infinite city with parallax layers
- Camera with velocity lookahead and speed based zoom
- Procedural character pose, arm IK to the anchor, body aligned to velocity
- Web line that sags when slack and straightens under tension
- Speed trails and screen shake scaled by web tension
- HUD with speed, height, g force, and a live energy strip chart
- Debug overlay drawing gravity, tension, drag, velocity, constraint circle
- Autopilot that picks anchors and release timing, with a distance score

## Phases

Each phase ends with something runnable, tests passing, and its own commits.

1. **Physics core.** Repo, canvas, fixed timestep loop, vector math, free
   flight, rigid constraint, click to shoot a web and swing. Tests for free
   fall, constraint, energy conservation, slack webs, determinism.
2. **City and camera.** Seeded procedural buildings in chunks, parallax layers,
   follow camera with lookahead and zoom, rooftop anchors. Buildings are
   scenery, not obstacles. He swings past them, and the only thing they add to
   the physics is somewhere for a web to stick.
3. **Character and web art.** Procedural pose with arm IK, velocity aligned
   body, leg tuck, sagging web line, speed trails.
4. **Control panel.** Slider UI, elastic mode, reeling, presets, time scale.
5. **Instruments.** HUD readouts, energy strip chart, force vector overlay.
6. **Autopilot and scoring.** Anchor picking heuristic, release timing,
   distance travelled, best run.
7. **Polish and ship.** Mobile touch, sound, optional scanline and bloom,
   README with a GIF, Pages deploy.

## Out of scope

3D, ragdoll physics, cloth simulation, a learned swinging agent, multiplayer.
Each one is more work than the entire rest of the project.

## Rules

- No dependencies without asking.
- Small files, one job each.
- Physics stays pure and testable. Rendering and input stay out of it.
