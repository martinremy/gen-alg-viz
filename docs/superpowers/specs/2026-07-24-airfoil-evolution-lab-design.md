# Airfoil Evolution Lab — Design

A single-page HTML + JavaScript app that visualizes a genetic algorithm evolving
2D airfoil (wing cross-section) shapes. A live aerodynamics fitness function
drives the evolution; the user can reshape the objective at runtime and watch
the population re-optimize.

## 1. Concept & Layout

Single page, no build step, no dependencies. Screen split top/bottom:

- **Top (~55%): Wind tunnel.** One airfoil under live test. Animated streamlines
  flow around it; the airfoil surface is colored by pressure coefficient (Cp);
  a Cp-distribution plot and a **Cl-vs-α polar plot** (with the stall point
  marked) are shown; live readouts display Cl, Cd, L/D, camber %, thickness %,
  and the derived stall angle `alpha_crit`. The tested airfoil is the current
  best individual by default, or any candidate the user selects from the zoo.
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

## 3. Fitness Function (live, user-tunable, polar-based)

**Why a polar, not a single point.** A single-angle evaluation has two failure
modes that would sabotage this tool as a teaching device: (a) the inviscid
panel method lets Cl grow without bound as camber increases, so the GA would
converge on degenerate thin, high-camber shapes that *teach the wrong physics*;
and (b) a stall model keyed on angle of attack is inert when the user fixes α
at cruise. Evaluating each candidate across a small **α-sweep (a polar)** fixes
both and produces one of the most teachable visualizations in aerodynamics.

### Evaluation procedure

For each candidate, evaluate the panel method at a fixed sweep of angles of
attack (default **0°, 4°, 8°, 12°, 16°**), producing a Cl/Cd/α-stall point at
each. From the sweep we derive:

- **Cl** and **Cp distribution** at each α (from pressure integration around
  the panels).
- **Cd** at each α, estimated empirically as `Cd = Cd0(thickness) + k * Cl^2`,
  where Cd0 grows with thickness and k is a constant. This is a profile-drag
  proxy, not a viscous solve.
- **Stall model (shape-driven, not α-driven).** Estimate a critical suction
  peak: if the peak suction Cp on the upper surface crosses a threshold derived
  from the airfoil's thickness and camber, that α-point is marked **stalled** —
  Cl is clamped and a drag spike is added. This couples the stall penalty to the
  *shape* the GA is evolving, closing the degenerate-camber loophole. The exact
  α at which stall triggers becomes a derived per-individual metric, `alpha_crit`.
- **`alpha_crit`** — the lowest α in the sweep at which the stall condition
  fires (or the last sweep point if it never stalls). Surfaced as a readout.

### Composite fitness

**Fitness** aggregates the polar points:

`fitness = w1 * (L/D at cruise α, normalized) + w2 * (Cl at cruise α, normalized) - w3 * (stall penalty) - w4 * (shape-penalty)`

- `w1` (drag/efficiency weight) and `w2` (lift weight) are **user sliders**.
- `w3` is a fixed strong weight; the stall penalty grows with how far below the
  target stall margin the candidate's `alpha_crit` falls.
- `w4` is a fixed mild weight for a **shape regularity penalty** that discourages
  degenerate or non-physical shapes (excessive camber, near-zero thickness,
  wavy surfaces) from exploiting the inviscid model — defense in depth alongside
  the suction-peak stall trigger.
- The **stall margin** slider sets a *target* `alpha_crit` the design must meet;
  candidates whose `alpha_crit` is below target are penalized, those above are
  rewarded. This lets the user demand a more or less stall-tolerant design.

### Fitness normalization (concrete)

"Normalized" is defined explicitly so GA dynamics stay readable:

- **L/D normalized** = `clamp( (L/D) / LD_REF, 0, 1 )`, where `LD_REF` is a fixed
  physical reference: the L/D of a representative NACA-like airfoil at a fixed
  reference α, computed once at startup. It does **not** track the user's cruise-α
  slider, so the fitness scale stays stable when the user moves the slider.
  Values above `LD_REF` clamp to 1.
- **Cl normalized** = `clamp( Cl / CL_REF, 0, 1 )`, with `CL_REF` likewise a
  fixed reference lift coefficient at the same fixed reference α.
- This fixed-reference scheme keeps the fitness scale stable across generations
  and across user-slider changes, so the population's improving fitness is always
  visible as motion toward 1.0.

### Panel-solver hardening

Early-generation random shapes can produce singular panel systems or NaN
results. The solver and genome pipeline must handle this gracefully:

- **Genome repair** enforces a minimum trailing-edge angle and minimum local
  curvature radius before evaluation, so shapes that would make the panel system
  ill-conditioned are nudged back toward validity.
- **Floor fitness:** if the panel solve fails (singular matrix, NaN, non-finite
  result) for a candidate at a given α, that α-point contributes a floor (worst-
  case) Cl/Cd, and the candidate's overall fitness gets a failure penalty. The
  app never crashes or shows NaN; a failed individual simply ranks low.

This realizes option D: the user reshapes the objective at runtime (cruise α,
lift weight, drag weight, stall margin) and watches the population re-optimize
around the new target — now across a true polar rather than a single point.

### Per-individual feature metrics (teaching causality)

So users can connect *shape → physics*, every individual surfaces these derived
features (shown on hover in the zoo, and live in the wind tunnel):

- **Camber %** (max camber as % of chord) and its chordwise position.
- **Thickness %** (max thickness as % of chord) and its chordwise position.
- **`alpha_crit`** (derived stall angle from the suction-peak model).
- **L/D** and **Cl** at the current cruise α.

These make the evolution legible: "high-camber individuals climb in lift but
lose stall margin" is something a user can *see*.

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
  flow reads as continuous motion. The field shown corresponds to the cruise α.
- The airfoil surface is drawn with a gradient mapped to local Cp: blue for
  suction (low pressure), red for pressure (high pressure).
- An angle-of-attack indicator shows the freestream direction.
- Lift and drag force arrows emanate from the airfoil's aerodynamic center,
  scaled to magnitude.
- A small **Cp plot** shows upper (solid) and lower (dashed) surface Cp vs
  chord position (at the cruise α).
- A **polar plot** shows the candidate's Cl vs α curve across the sweep, with
  the stall point (`alpha_crit`) marked and the cruise α indicated. This is the
  headline teaching graphic: it makes the lift-curve slope, the stall cliff,
  and the trade-off between high-lift and stall-margin visible at a glance.
- Live readouts show camber %, thickness %, `alpha_crit`, Cl, Cd, and L/D at
  cruise α (see §3, per-individual feature metrics).

### Population zoo (bottom)

- Each cell shows the candidate silhouette plus a handful of precomputed
  (static) streamlines computed once per generation — no per-frame flow
  simulation for the zoo.
- Cell border thickness/glow encodes fitness rank; the best individual is
  flagged.
- Hover: tooltip with that candidate's camber %, thickness %, `alpha_crit`,
  Cl, Cd, L/D, and overall fitness (see §3, per-individual feature metrics).
- Click: promote that candidate to the wind tunnel for live testing.

## 6. Controls

### Flight objective sliders

- **Cruise angle of attack** (α) — the point in the fixed sweep at which
  lift and L/D are scored; the sweep itself (0°, 4°, 8°, 12°, 16°) is fixed.
- **Lift weight** (w2).
- **Drag/efficiency weight** (w1).
- **Stall margin** (target `alpha_crit` the design must meet).

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