# Airfoil Evolution Lab — Design

A single-page HTML + JavaScript app that visualizes a genetic algorithm evolving
2D airfoil (wing cross-section) shapes. A live aerodynamics fitness function
drives the evolution; the user can reshape the objective at runtime and watch
the population re-optimize.

## 1. Concept & Layout

Single page, no build step, no dependencies. Screen split top/bottom:

- **Top (~55%): Wind tunnel.** One airfoil under live test. Animated streamlines
  flow around it; the airfoil surface is colored by pressure coefficient (Cp); a
  Cp-distribution plot is shown; live readouts display Cl, Cd, L/D, and a stall
  flag. The tested airfoil is the current best individual by default, or any
  candidate the user selects from the zoo.
- **Bottom (~45%): Population zoo.** ~14 candidate airfoils in a grid. Each
  cell renders the candidate's silhouette plus a handful of its own streamlines,
  framed/glowing by fitness rank. Updates once per generation. Hover shows that
  candidate's stats; click promotes it to the wind tunnel.
- **Top bar:** title + live stats (generation, average fitness, best fitness).
- **Control panel (side or bottom):** sliders (see §6).

## 2. Genome — Bezier Airfoil

Each individual's genome is a set of Bezier control points:

- Upper surface: 6 control points. Lower surface: 6 control points.
- Leading-edge and trailing-edge control points are shared between the two
  surfaces, yielding **~10–12 free genes** (control-point positions, normalized
  to chord [0,1]).
- **Constraints:** control-point x-coordinates must be monotonically increasing
  along each surface (no folding); lower surface must stay below the upper
  surface (non-negative thickness). Invalid genes are repaired/clamped before
  evaluation.
- The Bezier curves are sampled into ~80–120 panel points for the panel solver.
- **Visualization of the skeleton** (control points + hull) is available as an
  optional toggle in the wind tunnel.

### Genetic operators on the genome

- **Crossover:** per-surface blend — the child takes the upper surface from one
  parent and the lower from the other, with occasional control-point-level
  blending. Leading/trailing-edge shared points are reconciled (averaged) so the
  child is a single closed shape.
- **Mutation:** Gaussian perturbation of individual control-point positions,
  with clamping back into the validity constraints. Mutation rate is
  user-adjustable (default ~8% of genes perturbed).

## 3. Fitness Function (live, user-tunable)

For each candidate, run the **2D inviscid panel method** at the current angle of
attack, then compute a composite fitness:

- **Cl** from pressure integration around the panels.
- **Cp distribution** across the surface (used for coloring and the Cp plot).
- **Cd** estimated empirically as `Cd = Cd0(thickness) + k * Cl^2`, where Cd0
  grows with thickness and k is a constant. This is a profile-drag proxy, not a
  viscous solve.
- **Stall model:** estimate a critical angle `alpha_crit` from thickness and
  camber heuristics. If the operating angle of attack exceeds `alpha_crit`,
  clamp Cl and add a drag spike — a cheap stand-in for flow separation.
- **Fitness** = `w1 * (L/D normalized) + w2 * (Cl normalized) - w3 * (stall penalty)`:
  - `w1` (drag/efficiency weight) and `w2` (lift weight) are user sliders.
  - `w3` is a fixed strong weight so stalling candidates are strongly
    penalized.
  - A **stall margin** slider shifts `alpha_crit` up or down, letting the user
    demand a more or less stall-tolerant design.

This realizes option D: the user reshapes the objective at runtime (α, lift
weight, drag weight, stall margin) and watches the population re-optimize
around the new target.

## 4. GA Mechanics

- **Population size:** 14.
- **Elitism:** top 2 individuals carry over to the next generation unchanged.
- **Selection:** tournament selection, tournament size 3 (more stable than
  roulette for small populations).
- **Crossover:** as in §2.
- **Mutation:** as in §2, rate user-adjustable.
- **Cadence:** one generation is evaluated per "tick." The wind tunnel animates
  continuously (independent of generations); the zoo refreshes between
  generations. A speed slider controls generations per second.

## 5. Visualization Details

### Wind tunnel (top)

- A few hundred particles are advected through the panel-method velocity field
  to render animated streamlines. Particles cycle (re-spawn upstream) so the
  flow reads as continuous motion.
- The airfoil surface is drawn with a gradient mapped to local Cp: blue for
  suction (low pressure), red for pressure (high pressure).
- An angle-of-attack indicator shows the freestream direction.
- Lift and drag force arrows emanate from the airfoil's aerodynamic center,
  scaled to magnitude.
- A small **Cp plot** shows upper (solid) and lower (dashed) surface Cp vs
  chord position.

### Population zoo (bottom)

- Each cell shows the candidate silhouette plus a handful of precomputed
  (static) streamlines computed once per generation — no per-frame flow
  simulation for the zoo.
- Cell border thickness/glow encodes fitness rank; the best individual is
  flagged.
- Hover: tooltip with that candidate's Cl, Cd, L/D, fitness.
- Click: promote that candidate to the wind tunnel for live testing.

## 6. Controls

### Flight objective sliders

- **Angle of attack** (α).
- **Lift weight** (w2).
- **Drag/efficiency weight** (w1).
- **Stall margin** (shifts `alpha_crit`).

### Evolution controls

- **Play / pause** evolution.
- **Step one generation** (when paused).
- **Mutation rate** slider.
- **Speed** (generations per second) slider.
- **Reset population** (re-randomize).

### Interaction

- Click a zoo candidate → test it live in the wind tunnel.
- Optional toggle to show the Bezier control-point skeleton in the wind tunnel.

## 7. Tech

- Single `index.html` + `app.js`, no build step, no external dependencies.
- Canvas 2D for all rendering.
- A small linear-algebra helper implements Gaussian elimination to solve the
  panel-method linear system (dense, ~80–120 unknowns).
- Main loop via `requestAnimationFrame`; a fixed generation cadence decoupled
  from the render loop.
- Responsive: canvas resizes to its container; layout reflows for narrower
  screens.

## 8. Out of Scope (YAGNI)

- No 3D, no wing-span or wing-tip effects — strictly 2D cross-sections.
- No viscous boundary-layer modeling; drag and stall are empirical proxies.
- No saving/loading populations to disk.
- No multiple airfoils tested simultaneously in the wind tunnel.
- No external libraries.