# Airfoil Evolution Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page, zero-dependency HTML+JS app that visualizes a genetic algorithm evolving 2D airfoil cross-sections, using a live panel-method aerodynamics fitness function evaluated across an angle-of-attack polar.

**Architecture:** ES modules under `src/` split by responsibility: numerical core (linalg → geometry → panel → aero), the GA (genome → ga), and rendering (viz/tunnel, viz/zoo) plus controls and a bootstrap loop. Pure-logic modules are unit-tested with Node's built-in test runner (`node --test`); rendering is verified manually in a browser via a static server. A constant-strength source panel method plus a single Kutta-condition circulation vortex computes Cl, Cp distribution, and a queryable velocity field for streamlines.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, `node --test` (built-in), a static file server (`python3 -m http.server`). No external libraries, no build step.

## Global Constraints

- **No external dependencies, no build step.** Everything ships as static files plus a browser.
- **ES modules everywhere.** A `package.json` with `{"type":"module"}` enables ESM for both Node tests and the browser (`<script type="module">`).
- **Run the app via a static server** (`python3 -m http.server 8000`, then open `http://localhost:8000`). ES modules won't load over `file://`. Document this in the README.
- **Pure-logic modules MUST NOT touch the DOM** (`document`, `window`, `canvas`, etc.) so they remain Node-testable.
- **The app must never crash on bad shapes.** Every panel solve is wrapped so a singular matrix or NaN yields a floor (worst-case) result, not an exception or NaN display.
- **Fitness scale is fixed.** `LD_REF` and `CL_REF` are computed once at startup at a fixed reference α and do NOT track the user's cruise-α slider.
- **Fixed α-sweep:** `[0°, 4°, 8°, 12°, 16°]` (in radians internally).
- **GA parameters (defaults):** population 14, elite count 2, tournament size 3, default mutation rate 0.08.
- **Stall model is shape-driven, not α-driven** (keyed on peak suction Cp derived from thickness/camber).
- **Commit frequently** — one logical unit per commit; tests green before committing.

---

## File Structure

```
index.html                     # layout, canvas elements, controls DOM, <script type="module" src="src/main.js">
package.json                   # {"type":"module"} + test script
README.md                      # how to run (static server), what it does
src/linalg.js                  # Gaussian elimination, small vector/matrix helpers
src/geometry.js                # Bezier sampling, airfoil panel construction, feature extraction
src/panel.js                   # source-panel + Kutta circulation solver -> Cl, Cp, velocity field
src/aero.js                    # drag model, suction-peak stall model, polar evaluation, composite fitness, references
src/genome.js                  # genome representation, init, repair, crossover, mutation, features
src/ga.js                      # population init, tournament selection, elitism, one-generation evolve
src/viz/tunnel.js              # wind tunnel rendering (streamlines, pressure coloring, Cp plot, polar plot, force arrows, readouts)
src/viz/zoo.js                 # population zoo rendering (silhouettes + static streamlines, fitness framing)
src/controls.js                # wires DOM sliders/buttons to app state
src/main.js                    # bootstrap, RAF loop, generation cadence, control change handling
test/linalg.test.js            # node --test
test/geometry.test.js          # node --test
test/panel.test.js             # node --test
test/aero.test.js              # node --test
test/genome.test.js            # node --test
test/ga.test.js                # node --test
```

---

## Task 1: Scaffold (layout, module wiring, test harness, README)

**Files:**
- Create: `index.html`
- Create: `package.json`
- Create: `README.md`
- Create: `src/main.js` (smoke-only version: draws a placeholder rect, logs "airfoil-lab boot")
- Create: `test/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the static layout shell (`#tunnelCanvas`, `#zooCanvas`, controls DOM with the slider/button IDs listed below) that later tasks wire into. A working `node --test` harness.

**Required DOM IDs in `index.html` (exact — later tasks depend on these):**
- Canvases: `#tunnelCanvas`, `#zooCanvas`
- Stats: `#statGeneration`, `#statAvgFitness`, `#statBestFitness`
- Tunnel readouts: `#rCl`, `#rCd`, `#rLD`, `#rCamber`, `#rThickness`, `#rAlphaCrit`
- Objective sliders: `#slAlpha` (cruise α, 0–16°), `#slLift` (w2, 0–1), `#slDrag` (w1, 0–1), `#slStall` (target α_crit, 4–20°)
- Evolution controls: `#btnPlayPause`, `#btnStep`, `#slMutation` (0–0.4), `#slSpeed` (0.2–8 gen/sec), `#btnReset`
- Toggle: `#chkSkeleton`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "airfoil-evolution-lab",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write `index.html`** — full layout with all the DOM IDs above, a dark theme, top stats bar, top canvas (wind tunnel, ~55% height), bottom canvas (zoo, ~45% height), and a controls panel. Include `<script type="module" src="src/main.js"></script>`.

- [ ] **Step 3: Write `src/main.js`** — minimal smoke version: grab `#tunnelCanvas`, fill it with a placeholder rect and the text "airfoil-lab boot", and `console.log("airfoil-lab boot")`. No imports yet.

- [ ] **Step 4: Write `test/smoke.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("smoke: arithmetic works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 1 test passing (and any later tests that exist).

- [ ] **Step 6: Manual browser smoke**

Run: `python3 -m http.server 8000` and open `http://localhost:8000`.
Expected: dark page renders; top canvas shows the placeholder rect and text; console logs "airfoil-lab boot".

- [ ] **Step 7: Write `README.md`** — what the app is, how to run (static server), how to run tests (`npm test`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold airfoil evolution lab layout and test harness"
```

---

## Task 2: Linear algebra solver (`src/linalg.js`)

**Files:**
- Create: `src/linalg.js`
- Create: `test/linalg.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `solveLinear(A, b)` → `number[] | null` — solves `A x = b` via Gaussian elimination with partial pivoting. Returns `null` if the matrix is singular or the solve fails (any non-finite pivot). `A` is an array of `n` rows (each an array of `n` numbers); `b` is an array of `n` numbers.
  - `zeros(n)`, `cloneMatrix(A)` — helpers (only add what you use).

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { solveLinear } from "../src/linalg.js";

test("solveLinear: identity", () => {
  const x = solveLinear([[1,0],[0,1]], [3,5]);
  assert.deepEqual(x, [3,5]);
});

test("solveLinear: 2x2", () => {
  const x = solveLinear([[2,1],[1,3]], [3,8]);
  // 2a+b=3, a+3b=8 -> a=0.2, b=2.6
  assert.ok(x);
  assert.ok(Math.abs(x[0]-0.2)<1e-9);
  assert.ok(Math.abs(x[1]-2.6)<1e-9);
});

test("solveLinear: singular returns null", () => {
  const x = solveLinear([[1,2],[2,4]], [3,6]);
  assert.equal(x, null);
});

test("solveLinear: needs pivoting", () => {
  // zero leading pivot, must pivot
  const x = solveLinear([[0,2],[3,1]], [4,5]);
  // 2b=4 -> b=2; 3a+b=5 -> a=1
  assert.ok(x);
  assert.ok(Math.abs(x[0]-1)<1e-9);
  assert.ok(Math.abs(x[1]-2)<1e-9);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (`solveLinear` not defined / import fails).

- [ ] **Step 3: Implement `src/linalg.js`**

```js
// Gaussian elimination with partial pivoting.
// Returns null for singular matrices or any non-finite pivot.
export function solveLinear(A, b) {
  const n = b.length;
  // work on a copy
  const M = A.map((row, i) => [...row, b[i]]); // augmented
  for (let col = 0; col < n; col += 1) {
    // pivot: find max abs in column
    let piv = col;
    let best = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(M[r][col]);
      if (v > best) { best = v; piv = r; }
    }
    if (!Number.isFinite(best) || best < 1e-12) return null;
    if (piv !== col) { const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp; }
    const pivVal = M[col][col];
    for (let r = col + 1; r < n; r += 1) {
      const f = M[r][col] / pivVal;
      if (f !== 0) {
        for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
      }
    }
  }
  // back-substitute
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j += 1) s -= M[i][j] * x[j];
    const d = M[i][i];
    if (Math.abs(d) < 1e-12) return null;
    x[i] = s / d;
    if (!Number.isFinite(x[i])) return null;
  }
  return x;
}

export function zeros(n) { return new Array(n).fill(0); }
export function cloneMatrix(A) { return A.map(row => [...row]); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: linalg tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/linalg.js test/linalg.test.js
git commit -m "feat: add Gaussian elimination solver"
```

---

## Task 3: Geometry — Bezier sampling, panels, features (`src/geometry.js`)

**Files:**
- Create: `src/geometry.js`
- Create: `test/geometry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (export names are exact — later tasks use them):
  - `sampleBezier(controlPoints, n)` → `Array<{x,y}>` — `n` points sampled along a Bezier curve defined by `controlPoints` (array of `{x,y}`), via De Casteljau. Points go from the first to the last control point.
  - `buildAirfoilPanels(upperCP, lowerCP, nPerSurface)` → `{ points, midpoints, normals, tangents, isClosed }`
    - `points`: ordered array of `{x,y}` tracing the closed contour — upper surface from LE (x=0) to TE (x=1), then lower surface from TE back to LE.
    - `midpoints`, `normals`, `tangents`: per-panel arrays (length = panel count = `2*nPerSurface`), normals are unit outward normals.
  - `computeFeatures(upperCP, lowerCP)` → `{ camber, camberPos, thickness, thicknessPos, teAngle, minCurvature }`
    - `camber`: max vertical distance between the camber line (mean of upper/lower at each x) and the chord, as a fraction of chord (can be negative if lower is above upper — repaired later).
    - `thickness`: max upper-to-lower vertical distance as a fraction of chord.
    - `camberPos`, `thicknessPos`: chordwise position (0–1) of those maxima.
    - `teAngle`: interior angle (radians) at the trailing edge between upper and lower surface tangents.
    - `minCurvature`: minimum signed curvature radius along the sampled contour (a rough measure of shape smoothness; used by repair/aero).

**Notes for the implementer:**
- Chord is normalized to x∈[0,1]. LE = (0,0), TE = (1,0) after the genome shares them (the genome guarantees this; geometry just consumes control points).
- Sample upper and lower surfaces separately via `sampleBezier`, then concatenate upper (forward) + lower (reversed) to form the closed polygon. Compute per-panel midpoints as averages of consecutive vertices; tangents from vertex differences (normalize); normals as perpendicular to tangents, oriented outward (use polygon signed area to flip if needed).
- For `computeFeatures`, sample both surfaces at a common set of x stations (e.g. 50 stations) to compute camber/thickness; estimate `teAngle` from the tangent directions of the last panel of each surface; estimate `minCurvature` from discrete curvature of the sampled contour.

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleBezier, buildAirfoilPanels, computeFeatures } from "../src/geometry.js";

test("sampleBezier: endpoints match control points", () => {
  const cps = [{x:0,y:0},{x:0.5,y:0.2},{x:1,y:0}];
  const pts = sampleBezier(cps, 21);
  assert.equal(pts.length, 21);
  assert.ok(Math.abs(pts[0].x - 0) < 1e-9 && Math.abs(pts[0].y - 0) < 1e-9);
  assert.ok(Math.abs(pts[20].x - 1) < 1e-9 && Math.abs(pts[20].y - 0) < 1e-9);
});

test("buildAirfoilPanels: closed contour, outward normals, count", () => {
  const up = [{x:0,y:0},{x:0.3,y:0.08},{x:0.7,y:0.06},{x:1,y:0}];
  const lo = [{x:0,y:0},{x:0.3,y:-0.04},{x:0.7,y:-0.03},{x:1,y:0}];
  const r = buildAirfoilPanels(up, lo, 20);
  assert.equal(r.points.length, 40);
  assert.equal(r.normals.length, 40);
  // normals are unit length
  for (const n of r.normals) assert.ok(Math.abs(Math.hypot(n.x,n.y)-1) < 1e-9);
  // upper-surface normals point generally up (positive y) near mid-chord
  const mid = r.normals[10];
  assert.ok(mid.y > 0, "upper normal should point up");
});

test("computeFeatures: symmetric NACA-ish shape has zero camber", () => {
  const up = [{x:0,y:0},{x:0.3,y:0.06},{x:0.7,y:0.06},{x:1,y:0}];
  const lo = [{x:0,y:0},{x:0.3,y:-0.06},{x:0.7,y:-0.06},{x:1,y:0}];
  const f = computeFeatures(up, lo);
  assert.ok(Math.abs(f.camber) < 1e-6, `camber should be ~0, got ${f.camber}`);
  assert.ok(f.thickness > 0.1 && f.thickness < 0.13, `thickness ~0.12, got ${f.thickness}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/geometry.js`** per the interfaces and notes above. Use De Casteljau for Bezier sampling. Keep it DOM-free.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: geometry tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry.js test/geometry.test.js
git commit -m "feat: add Bezier sampling, panel construction, feature extraction"
```

---

## Task 4: Panel-method solver (`src/panel.js`) — RISKIEST TASK

> **Controller note:** Dispatch this task on the **most capable available model**. It is the numerically hardest and other tasks depend on its outputs being physically sane. The reviewer for this task should also use a capable model.

**Files:**
- Create: `src/panel.js`
- Create: `test/panel.test.js`

**Method (constant-strength source panels + single Kutta circulation vortex):**
- Discretize the airfoil into `N` panels (from `buildAirfoilPanels`). Each panel `j` has a constant source strength `σ_j` and midpoint `M_j`, unit normal `n_j`, length `L_j`.
- Unknowns: `σ_1..σ_N` plus a single uniform circulation `Γ` (placed as a point vortex at the quarter-chord, or modeled as a uniform vortex sheet — pick the point-vortex-at-quarter-chord formulation for simplicity and robustness).
- Boundary condition (N equations): at each collocation point `M_i`, the total normal velocity (freestream + all source panels + the circulation vortex) is zero (flow tangent to the surface):
  - `Σ_j A_ij σ_j + B_i Γ = -V∞·n_i`, where `A_ij` is the normal-velocity influence of a unit source on panel `j` at point `i`, and `B_i` is the normal-velocity influence of the unit point vortex at point `i`.
- Kutta condition (1 equation): the trailing-edge tangential velocities from the upper and lower surfaces are equal in magnitude/opposite sense — equivalently, enforce finite/zero loading at the TE. A robust discrete form: require that the source-induced + circulation tangential velocity just above the TE equals minus that just below (or set `Γ` so the upper- and lower-surface TE tangential velocities match). Use whichever discrete Kutta form you can verify against the tests below; document your choice in a code comment.
- Solve the `(N+1)×(N+1)` system with `solveLinear` from `src/linalg.js`. If `solveLinear` returns `null` (singular) or any non-finite value appears, the whole `analyzeAirfoil` call returns `null` (failure) — never throw.
- From the solution: surface tangential velocity `Vt_i` at each midpoint = freestream tangential + source contributions + circulation contribution; `Cp_i = 1 - (Vt_i / V∞)^2`; `Cl` = integrate `Cp` around the body (pressure normal force × lever) projected onto the lift direction, or equivalently `Cl = -∮ Cp n_y ds` for 2D (lift perpendicular to freestream) — use the standard pressure-integration form.
- Velocity field for streamlines: `velocityAt(x, y)` = freestream + Σ source-panel induced velocities + circulation vortex induced velocity. Provide a callable that takes `(x,y)` and returns `{u,v}`.

**Interfaces:**
- Consumes: `solveLinear` from `./linalg.js`.
- Produces:
  - `analyzeAirfoil(panels, alpha, Vinf=1.0)` → `null | { cl, cp, tangentialV, velocityField, xMid, yMid }`
    - `panels`: the `{ points, midpoints, normals, tangents }` object from `buildAirfoilPanels`.
    - `alpha`: angle of attack in **radians**.
    - `cl`: lift coefficient (number). Positive for positive-α lift on a typical airfoil.
    - `cp`: array of `Cp` at each panel midpoint.
    - `tangentialV`: array of tangential velocity at each midpoint (for diagnostics).
    - `velocityField`: object with `at(x, y)` → `{u, v}`.
    - `xMid, yMid`: arrays of midpoint coordinates (for plotting Cp).
    - Returns `null` on singular/NaN.

**Test physics (these MUST hold — if they don't, the formulation is wrong):**
- A symmetric airfoil at α=0 → `|Cl| < 0.01` (no lift).
- A symmetric airfoil at α>0 (e.g. 5°) → `Cl > 0` and roughly `Cl ≈ 2π·α` within ~30% (thin-airfoil theory is the sanity check; panel methods are approximate, so allow generous tolerance).
- A cambered airfoil at α=0 → `Cl > 0` (camber produces lift).
- A degenerate shape (e.g. all points collinear → zero thickness) → returns `null` (graceful failure), does not throw.

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAirfoilPanels } from "../src/geometry.js";
import { analyzeAirfoil } from "../src/panel.js";

const DEG = Math.PI / 180;

function symShape() {
  const up = [{x:0,y:0},{x:0.3,y:0.06},{x:0.7,y:0.06},{x:1,y:0}];
  const lo = [{x:0,y:0},{x:0.3,y:-0.06},{x:0.7,y:-0.06},{x:1,y:0}];
  return buildAirfoilPanels(up, lo, 40);
}
function camberedShape() {
  const up = [{x:0,y:0.02},{x:0.3,y:0.09},{x:0.7,y:0.06},{x:1,y:0.0}];
  const lo = [{x:0,y:0.02},{x:0.3,y:-0.01},{x:0.7,y:-0.02},{x:1,y:0.0}];
  return buildAirfoilPanels(up, lo, 40);
}

test("symmetric airfoil at 0deg has ~0 lift", () => {
  const r = analyzeAirfoil(symShape(), 0);
  assert.ok(r, "should not fail for a valid symmetric shape");
  assert.ok(Math.abs(r.cl) < 0.02, `expected |Cl|<0.02, got ${r.cl}`);
});

test("symmetric airfoil at 5deg produces positive lift near 2*pi*alpha", () => {
  const r = analyzeAirfoil(symShape(), 5*DEG);
  assert.ok(r);
  assert.ok(r.cl > 0, `expected Cl>0, got ${r.cl}`);
  const expected = 2*Math.PI*5*DEG;
  // generous tolerance; panel method with few panels is approximate
  assert.ok(Math.abs(r.cl - expected)/expected < 0.4, `Cl=${r.cl} expected~${expected}`);
});

test("cambered airfoil at 0deg produces positive lift", () => {
  const r = analyzeAirfoil(camberedShape(), 0);
  assert.ok(r);
  assert.ok(r.cl > 0.01, `camber should produce positive lift at 0deg, got ${r.cl}`);
});

test("degenerate (collinear) shape returns null, does not throw", () => {
  const flat = {
    points: Array.from({length: 20}, (_,i)=>({x:i/19, y:0})),
    midpoints: Array.from({length: 19}, (_,i)=>({x:(i+0.5)/19, y:0})),
    normals: Array.from({length: 19}, ()=>({x:0, y:1})),
    tangents: Array.from({length: 19}, ()=>({x:1, y:0})),
  };
  let result;
  assert.doesNotThrow(() => { result = analyzeAirfoil(flat, 5*DEG); });
  assert.equal(result, null);
});

test("velocityField.at returns finite vectors near the body", () => {
  const r = analyzeAirfoil(symShape(), 5*DEG);
  assert.ok(r);
  const v = r.velocityField.at(0.5, 0.3);
  assert.ok(Number.isFinite(v.u) && Number.isFinite(v.v));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/panel.js`** per the method above. Use `solveLinear` for the `(N+1)×(N+1)` system. Guard every numerical path so failures return `null`. Add a header comment documenting the exact Kutta-condition form you used.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: panel tests PASS. If the lift tests fail, the formulation is wrong — re-examine the Kutta condition and the sign of `Γ`, do NOT relax the tolerances.

- [ ] **Step 5: Commit**

```bash
git add src/panel.js test/panel.test.js
git commit -m "feat: add source-panel + Kutta circulation solver"
```

---

## Task 5: Aero — drag, stall, polar, fitness, references (`src/aero.js`)

**Files:**
- Create: `src/aero.js`
- Create: `test/aero.test.js`

**Interfaces:**
- Consumes: `analyzeAirfoil` from `./panel.js`; `buildAirfoilPanels`, `computeFeatures` from `./geometry.js`.
- Produces:
  - `ALPHA_SWEEP = [0, 4, 8, 12, 16].map(d => d*Math.PI/180)` (exported constant).
  - `evaluatePolar(panels, features)` → `Array<{ alpha, cl, cd, stalled, ok }>` over `ALPHA_SWEEP`. For each α: call `analyzeAirfoil`; if it returns `null`, use floor values `{ cl: 0, cd: 1.0, stalled: true, ok: false }`. Otherwise compute `cd` and `stalled`:
    - `Cd0(thickness) = 0.006 + 0.02 * (thickness - 0.12)` (linear, clamped ≥ 0.002).
    - `cd = Cd0 + 0.05 * cl^2` (profile-drag proxy). If stalled, add a drag spike: `cd += 0.08 * (alpha - alphaCrit) * sign` (see stall model).
    - **Suction-peak stall model:** `alphaCrit = estimateAlphaCrit(features)`. At a given α, compute the peak suction Cp on the upper surface (most negative Cp). Stall fires when `peakSuctionCp < suctionThreshold(features)` (more negative than threshold). When it fires at α, mark `stalled=true`, clamp `cl` to the last non-stalled value (or the linear extrapolation at `alphaCrit`), and add the drag spike.
    - `estimateAlphaCrit(features)` → radians. A heuristic from thickness and camber, e.g. `alphaCrit = (0.18 - 1.5*camber) / thickness * 0.6 + 0.10` (radians), clamped to `[4°, 20°]`. This is a tunable heuristic; the tests below pin its *behavior*, not exact numbers.
  - `computeFitness(polar, features, opts, refs)` → number, where `opts = { cruiseAlpha, wLift, wDrag, stallTarget }` and `refs = { LD_REF, CL_REF }`:
    - Find the polar entry at `cruiseAlpha` (or nearest lower). Let `cl`, `cd` there; `ld = cl / cd`.
    - `ldNorm = clamp(ld / refs.LD_REF, 0, 1)`.
    - `clNorm = clamp(cl / refs.CL_REF, 0, 1)`.
    - `stallPenalty = max(0, stallTarget - alphaCrit) * 3.0` (radians → dimensionless).
    - `shapePenalty = shapeRegularityPenalty(features)` (mild: penalize `minCurvature` radius too small, `teAngle` too small, camber excessive).
    - `fitness = wDrag*ldNorm + wLift*clNorm - 3.0*stallPenalty - 0.5*shapePenalty`, then floor at a small negative value and return.
  - `computeReferences(refPanels, refAlpha)` → `{ LD_REF, CL_REF }` — evaluate `analyzeAirfoil(refPanels, refAlpha)`, take `cl` and `cd = Cd0(0.12)+0.05*cl^2`, `LD_REF = max(1, cl/cd)`, `CL_REF = max(0.1, cl)`. Computed once at startup; fixed thereafter.

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAirfoilPanels, computeFeatures } from "../src/geometry.js";
import { ALPHA_SWEEP, evaluatePolar, computeFitness, computeReferences, estimateAlphaCrit } from "../src/aero.js";

const DEG = Math.PI/180;
function sym() {
  const up = [{x:0,y:0},{x:0.3,y:0.06},{x:0.7,y:0.06},{x:1,y:0}];
  const lo = [{x:0,y:0},{x:0.3,y:-0.06},{x:0.7,y:-0.06},{x:1,y:0}];
  return { panels: buildAirfoilPanels(up, lo, 40), feats: computeFeatures(up, lo) };
}

test("evaluatePolar returns one entry per sweep angle", () => {
  const { panels, feats } = sym();
  const p = evaluatePolar(panels, feats);
  assert.equal(p.length, ALPHA_SWEEP.length);
  for (const e of p) assert.ok(typeof e.cl === "number" && Number.isFinite(e.cl) || e.ok===false);
});

test("alphaCrit is within [4deg,20deg]", () => {
  const a = estimateAlphaCrit({ camber:0.02, thickness:0.12, teAngle:0.2, minCurvature:0.05 });
  assert.ok(a >= 4*DEG - 1e-9 && a <= 20*DEG + 1e-9);
});

test("higher camber lowers alphaCrit", () => {
  const thin = estimateAlphaCrit({ camber:0.0, thickness:0.12, teAngle:0.2, minCurvature:0.05 });
  const cambered = estimateAlphaCrit({ camber:0.06, thickness:0.12, teAngle:0.2, minCurvature:0.05 });
  assert.ok(cambered < thin, "more camber => stalls sooner");
});

test("computeFitness: fitness is finite and penalizes stall shortfall", () => {
  const { panels, feats } = sym();
  const polar = evaluatePolar(panels, feats);
  const refs = { LD_REF: 50, CL_REF: 0.5 };
  const f1 = computeFitness(polar, feats, { cruiseAlpha: 4*DEG, wLift:0.5, wDrag:0.5, stallTarget: 16*DEG }, refs);
  assert.ok(Number.isFinite(f1));
  const f2 = computeFitness(polar, feats, { cruiseAlpha: 4*DEG, wLift:0.5, wDrag:0.5, stallTarget: 4*DEG }, refs);
  // demanding a low stall target should not penalize this symmetric shape more than a high target
  assert.ok(f2 >= f1, `low stall target should not be more punishing, f2=${f2} f1=${f1}`);
});

test("computeReferences returns finite positive refs", () => {
  const { panels } = sym();
  const r = computeReferences(panels, 4*DEG);
  assert.ok(r.LD_REF > 0 && r.CL_REF > 0 && Number.isFinite(r.LD_REF));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/aero.js`** per interfaces above. Keep DOM-free. Floor all fitnesses so NaN never escapes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: aero tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/aero.js test/aero.test.js
git commit -m "feat: add drag/stall polar evaluation and composite fitness"
```

---

## Task 6: Genome — representation, init, repair, operators (`src/genome.js`)

**Files:**
- Create: `src/genome.js`
- Create: `test/genome.test.js`

**Interfaces:**
- Consumes: `buildAirfoilPanels`, `computeFeatures` from `./geometry.js`.
- Produces:
  - `randomGenome(rng)` → `{ upper: [{x,y}×6], lower: [{x,y}×6] }`. LE = `(0,0)` and TE = `(1,0)` are shared (same object/value at `upper[0]/lower[0]` and `upper[5]/lower[5]`). Upper control points have `y ≥ 0`, lower have `y ≤ 0`. Interior x-coordinates are spread in `[0,1]`. `rng` is a function `rng()` → `[0,1)` (use `Math.random` if not provided).
  - `genomeToPanels(genome, nPerSurface=40)` → `buildAirfoilPanels(genome.upper, genome.lower, nPerSurface)`.
  - `genomeFeatures(genome)` → `computeFeatures(genome.upper, genome.lower)`.
  - `repairGenome(genome)` → a NEW repaired genome (do not mutate input): enforce (a) monotonically increasing x along each surface, (b) `upper.y ≥ -epsilon` and `lower.y ≤ epsilon` (non-negative thickness — if a lower point is above an upper point at the same station, swap or push apart), (c) minimum trailing-edge angle (nudge the TE-adjacent control points so the TE interior angle ≥ ~0.15 rad), (d) minimum local curvature radius (nudge points that create sharp kinks). Keep LE=(0,0) and TE=(1,0) fixed.
  - `crossover(a, b, rng)` → child genome: take upper from `a`, lower from `b` (with occasional per-point blending ~20% chance); reconcile shared LE/TE by averaging.
  - `mutate(genome, rate, rng)` → a NEW genome: for each control-point coordinate independently with probability `rate`, add Gaussian perturbation (scale ~0.05 for y, ~0.03 for x); then call `repairGenome` on the result and return it.

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomGenome, repairGenome, crossover, mutate, genomeToPanels, genomeFeatures } from "../src/genome.js";

const rng = () => Math.random();

test("randomGenome: 6+6 points, shared LE/TE, valid signs", () => {
  const g = randomGenome(rng);
  assert.equal(g.upper.length, 6);
  assert.equal(g.lower.length, 6);
  assert.deepEqual(g.upper[0], g.lower[0]);   // LE shared
  assert.deepEqual(g.upper[5], g.lower[5]);  // TE shared
  assert.equal(g.upper[0].x, 0); assert.equal(g.upper[0].y, 0);
  assert.equal(g.upper[5].x, 1); assert.equal(g.upper[5].y, 0);
  for (const p of g.upper) assert.ok(p.y >= -1e-9);
  for (const p of g.lower) assert.ok(p.y <= 1e-9);
});

test("repairGenome: monotonic x and non-negative thickness", () => {
  const bad = {
    upper: [{x:0,y:0},{x:0.7,y:0.05},{x:0.3,y:0.07},{x:0.9,y:0.04},{x:0.6,y:0.02},{x:1,y:0}],
    lower: [{x:0,y:0},{x:0.5,y:-0.05},{x:0.4,y:0.02},{x:0.8,y:-0.03},{x:0.6,y:-0.04},{x:1,y:0}],
  };
  const r = repairGenome(bad);
  for (let i=1;i<6;i++) assert.ok(r.upper[i].x > r.upper[i-1].x, `upper x not monotonic at ${i}`);
  for (let i=1;i<6;i++) assert.ok(r.lower[i].x > r.lower[i-1].x, `lower x not monotonic at ${i}`);
  // non-negative thickness: at any interior point, upper.y >= lower.y after sampling
  for (let i=0;i<6;i++) assert.ok(r.upper[i].y >= r.lower[i].y - 1e-9);
});

test("repairGenome does not mutate input", () => {
  const g = randomGenome(rng);
  const snapshot = JSON.parse(JSON.stringify(g));
  repairGenome(g);
  assert.deepEqual(g, snapshot);
});

test("crossover produces a valid, repaired child", () => {
  const a = randomGenome(rng), b = randomGenome(rng);
  const c = crossover(a, b, rng);
  assert.equal(c.upper.length, 6);
  assert.deepEqual(c.upper[0], c.lower[0]);
  assert.deepEqual(c.upper[5], c.lower[5]);
  for (let i=1;i<6;i++) assert.ok(c.upper[i].x > c.upper[i-1].x);
});

test("mutate with rate 0 returns equivalent genome (only repaired)", () => {
  const g = repairGenome(randomGenome(rng));
  const m = mutate(g, 0, rng);
  assert.deepEqual(m.upper, g.upper);
});

test("mutate with rate 1 changes the genome", () => {
  const g = repairGenome(randomGenome(rng));
  const m = mutate(g, 1, rng);
  assert.notDeepEqual(m.upper, g.upper);
});

test("genomeToPanels + genomeFeatures produce finite features", () => {
  const g = repairGenome(randomGenome(rng));
  const panels = genomeToPanels(g, 40);
  assert.ok(panels.points.length === 80);
  const f = genomeFeatures(g);
  assert.ok(Number.isFinite(f.thickness) && Number.isFinite(f.camber));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/genome.js`** per interfaces. Provide a seeded RNG helper if convenient but `randomGenome(rng)` must accept the passed-in `rng`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: genome tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/genome.js test/genome.test.js
git commit -m "feat: add Bezier genome representation, repair, and operators"
```

---

## Task 7: GA — population, selection, evolution (`src/ga.js`)

**Files:**
- Create: `src/ga.js`
- Create: `test/ga.test.js`

**Interfaces:**
- Consumes: `randomGenome`, `crossover`, `mutate`, `genomeFeatures`, `genomeToPanels` from `./genome.js`; `evaluatePolar`, `computeFitness` from `./aero.js`.
- Produces:
  - `initPopulation(size, rng)` → array of `size` repaired random genomes.
  - `evaluatePopulation(population, opts, refs)` → `{ fitnesses: number[], metrics: Array<{ features, polar, fitness }> }`. For each genome: `features = genomeFeatures`, `panels = genomeToPanels`, `polar = evaluatePolar(panels, features)`, `fitness = computeFitness(polar, features, opts, refs)`. Floor any non-finite fitness to a worst-case constant.
  - `evolve(population, fitnesses, params, rng)` → new population array of same length: carry top `params.eliteCount` genomes unchanged; fill the rest by tournament selection (`params.tournamentSize`) + `crossover` + `mutate(rate=params.mutationRate)`.
  - `tournamentSelect(fitnesses, k, rng)` → index of the best of `k` random indices.

- [ ] **Step 1: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { initPopulation, evaluatePopulation, evolve, tournamentSelect } from "../src/ga.js";

const rng = () => Math.random();
const opts = { cruiseAlpha: 4*Math.PI/180, wLift:0.5, wDrag:0.5, stallTarget: 12*Math.PI/180 };
const refs = { LD_REF: 50, CL_REF: 0.5 };
const params = { eliteCount:2, tournamentSize:3, mutationRate:0.08 };

test("initPopulation has correct size of repaired genomes", () => {
  const pop = initPopulation(14, rng);
  assert.equal(pop.length, 14);
});

test("evaluatePopulation returns finite fitnesses and metrics", () => {
  const pop = initPopulation(8, rng);
  const { fitnesses, metrics } = evaluatePopulation(pop, opts, refs);
  assert.equal(fitnesses.length, 8);
  assert.equal(metrics.length, 8);
  for (const f of fitnesses) assert.ok(Number.isFinite(f));
});

test("evolve preserves population size and elites", () => {
  const pop = initPopulation(14, rng);
  const { fitnesses } = evaluatePopulation(pop, opts, refs);
  const next = evolve(pop, fitnesses, params, rng);
  assert.equal(next.length, 14);
  // top 2 elites should be unchanged objects
  const order = fitnesses.map((f,i)=>[f,i]).sort((a,b)=>b[0]-a[0]);
  const e0 = pop[order[0][1]];
  const e1 = pop[order[1][1]];
  assert.ok(next.includes(e0) && next.includes(e1), "elites should carry over by reference");
});

test("tournamentSelect returns a valid index and favors higher fitness", () => {
  const fitnesses = [0.1, 0.9, 0.2, 0.8, 0.3];
  let pickedHigh = false;
  for (let i=0;i<50;i++) {
    const idx = tournamentSelect(fitnesses, 3, rng);
    assert.ok(idx >= 0 && idx < fitnesses.length);
    if (idx === 1 || idx === 3) pickedHigh = true;
  }
  assert.ok(pickedHigh, "tournament should frequently pick high-fitness indices");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/ga.js`** per interfaces. Keep DOM-free and deterministic given `rng`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ga tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ga.js test/ga.test.js
git commit -m "feat: add GA population, evaluation, and evolution"
```

---

## Task 8: Wind tunnel rendering (`src/viz/tunnel.js`)

**Files:**
- Create: `src/viz/tunnel.js`
- Modify: `src/main.js` (integrate tunnel rendering into the loop — but the full main.js wiring is Task 10; here just ensure the module is importable and draw a static frame).

**Interfaces:**
- Consumes: `analyzeAirfoil` from `../panel.js`, `velocityField` from a polar entry, `genomeToPanels`, `genomeFeatures`.
- Produces:
  - `class TunnelRenderer`
    - constructor takes the `#tunnelCanvas` element + a 2D context.
    - `setAirfoil(genome, cruiseAlpha)` — samples panels, runs `analyzeAirfoil` at `cruiseAlpha`, stores `{ panels, cp, cl, polar, velocityField, features }`, (re)seeds streamline particles.
    - `update(dt)` — advect particles through `velocityField.at(x,y)`; respawn upstream when they exit or after a lifetime.
    - `render(showSkeleton)` — draw: background, streamlines (particles), airfoil surface colored by Cp (blue→suction, red→pressure), optional control-point skeleton, an α indicator, lift/drag force arrows from the aerodynamic center, the Cp plot (upper solid / lower dashed vs chord), and the Cl-vs-α polar plot with the stall point (`alphaCrit`) and cruise α marked. Use the canvas dimensions; do NOT read DOM text elements here (the controller/main updates the readout spans).
  - `export { TunnelRenderer }`.

**Notes:**
- Map airfoil chord [0,1] to canvas coordinates with padding; scale y by an aspect that keeps thickness visible (e.g. vertical exaggeration ×8–12 since airfoils are thin).
- Particle count: a few hundred. Particles outside the body and within the tunnel region only (skip advecting inside the polygon — simple bounding check is fine).
- This task is verified **manually** (no unit test). The acceptance check is: open the page, see streamlines flowing around an airfoil, surface pressure-colored, Cp and polar plots present, readouts updating.

- [ ] **Step 1: Implement `src/viz/tunnel.js`** per the interface. Use Canvas 2D. Keep drawing code in focused private methods (`drawStreamlines`, `drawAirfoil`, `drawCpPlot`, `drawPolarPlot`, `drawForceArrows`).

- [ ] **Step 2: Smoke-wire into `src/main.js`** — temporarily import `TunnelRenderer`, create one with `#tunnelCanvas`, call `setAirfoil` on a repaired random genome, and run a `requestAnimationFrame` loop calling `update`/`render`. (This is a temporary harness for verification; Task 10 replaces it.)

- [ ] **Step 3: Manual verification**

Run: `python3 -m http.server 8000`, open the page.
Expected: streamlines flow around an airfoil shape, surface is pressure-colored, Cp and polar plots render, no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/viz/tunnel.js src/main.js
git commit -m "feat: add wind tunnel renderer (streamlines, pressure, Cp, polar plots)"
```

---

## Task 9: Population zoo rendering (`src/viz/zoo.js`)

**Files:**
- Create: `src/viz/zoo.js`

**Interfaces:**
- Consumes: `genomeToPanels`, `analyzeAirfoil` from `../panel.js` (for each candidate's static streamlines).
- Produces:
  - `class ZooRenderer`
    - constructor takes `#zooCanvas` + 2D context.
    - `render(population, metrics, selectedIndex)` — lay out up to 14 cells in a grid; for each cell draw the airfoil silhouette + a handful of precomputed static streamlines (computed once from `analyzeAirfoil` at a fixed display α — reuse the cruise α or a fixed 4°); frame/glow by fitness rank (best = brightest); highlight `selectedIndex`; mark the best individual.
    - Maintain a cache keyed by genome identity (e.g. a version counter on genomes) so streamlines are recomputed only when the population changes between generations, not every frame.
  - `export { ZooRenderer }`.

- [ ] **Step 1: Implement `src/viz/zoo.js`** per the interface. Focused private methods (`drawCell`, `drawStaticStreamlines`, `drawSilhouette`).

- [ ] **Step 2: Smoke-wire into `src/main.js`** — temporarily import `ZooRenderer`, render a small fake population (e.g. 6 repaired random genomes with random fitnesses 0–1) to verify layout and streamlines.

- [ ] **Step 3: Manual verification**

Run: `python3 -m http.server 8000`.
Expected: bottom canvas shows a grid of small airfoils each with static streamlines, framed by fitness, one highlighted.

- [ ] **Step 4: Commit**

```bash
git add src/viz/zoo.js src/main.js
git commit -m "feat: add population zoo renderer"
```

---

## Task 10: Controls + main loop integration (`src/controls.js`, `src/main.js`)

**Files:**
- Create: `src/controls.js`
- Modify: `src/main.js` (replace smoke harness with the real bootstrap)

**Interfaces:**
- Consumes: `initPopulation`, `evaluatePopulation`, `evolve` from `./ga.js`; `computeReferences` from `./aero.js`; `randomGenome`, `repairGenome` from `./genome.js`; `TunnelRenderer` from `./viz/tunnel.js`; `ZooRenderer` from `./viz/zoo.js`.
- Produces the live app: holds app state (`population`, `metrics`, `opts`, `params`, `refs`, `generation`, `selectedIndex`), wires all DOM IDs from Task 1, runs the RAF loop (tunnel animate every frame; generation evolve at `params.speed` cadence decoupled from render), and updates the stats/readouts.
- `controls.js` exports `setupControls(state, onChange)` that reads current slider/button values into `state` and calls `onChange(kind)` when an objective slider changes (so fitness references/objective can update and the population re-evaluates) vs. when evolution params change (mutation/speed).

**Behavior:**
- On load: build `refs` via `computeReferences` on a fixed reference airfoil (a reasonable NACA-like genome) at a fixed reference α (e.g. 4°). Init population, evaluate, render.
- RAF loop: `TunnelRenderer.update(dt)` + `render(skeletonToggle)` every frame; zoo rendered each frame (cheap, cached) but its data refreshes each generation. Maintain a generation timer: when `1/speed` seconds elapse and not paused, run one `evolve` + `evaluatePopulation`, increment generation, update zoo cache, update stats. If paused, only render (tunnel still animates with current airfoil).
- Objective slider change: re-evaluate the current population with the new `opts` (don't lose the population), update fitnesses/zoo/stats.
- Zoo cell click: set `selectedIndex`; `TunnelRenderer.setAirfoil` to that genome.
- `#btnStep`: run exactly one generation while paused. `#btnReset`: re-randomize population, generation=0. `#btnPlayPause`: toggle. `#chkSkeleton`: toggle skeleton in tunnel render.

- [ ] **Step 1: Implement `src/controls.js`** per interface.

- [ ] **Step 2: Rewrite `src/main.js`** as the full bootstrap per behavior above. Keep it focused: state object + wiring + loop. Heavy logic stays in the modules.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all unit tests still PASS (logic untouched).

- [ ] **Step 4: Manual end-to-end verification**

Run: `python3 -m http.server 8000`.
Expected:
- Page loads, evolution runs automatically (generation counter increases).
- Wind tunnel shows the current best with live streamlines, pressure coloring, Cp plot, polar plot, readouts (Cl/Cd/L/D/camber/thickness/alphaCrit).
- Zoo shows ~14 candidates with static streamlines, fitness framing, best flagged.
- Moving the cruise-α / lift / drag / stall sliders re-evaluates and the zoo shifts.
- Play/pause, step, reset, mutation, speed all work.
- Clicking a zoo candidate promotes it to the tunnel.
- Skeleton toggle shows/hides control points.
- No console errors; no NaN shown anywhere even after many generations.

- [ ] **Step 5: Commit**

```bash
git add src/controls.js src/main.js
git commit -m "feat: wire controls and main loop; full app integration"
```

---

## Task 11: Polish + visual verification pass

**Files:**
- Modify: various as needed (`index.html` styles, `src/viz/*`, `src/main.js`)

**Goal:** Make it actually "really cool" and robust. This is a judgment pass, not new features.

- [ ] **Step 1: Visual polish** — verify the dark theme reads well, streamlines look like flow (not random dots), pressure colormap is intuitive, plots have axes/labels, zoo cells are legible, the layout is responsive down to a laptop width. Adjust CSS and drawing constants as needed.

- [ ] **Step 2: Robustness soak** — let it run 200+ generations with default params; confirm no NaN appears, no crash, fitness trends upward over early generations. Then crank mutation to 0.4 and the stall target to 20°; confirm still stable.

- [ ] **Step 3: Teaching check** — manually confirm the causality is visible: a high-camber individual shows higher Cl but a lower `alphaCrit` and an earlier stall cliff on the polar. Adjust stall/penalty constants if the lesson isn't legible.

- [ ] **Step 4: Run tests one final time**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "polish: visual and robustness pass"
```

---

## Self-Review (controller runs after writing)

- **Spec coverage:** §1 layout → Tasks 1,8,9,10. §2 genome → Task 6. §3 fitness (polar, stall, hardening, normalization, feature metrics) → Tasks 4,5,6,7. §4 GA mechanics → Task 7. §5 viz → Tasks 8,9. §6 controls → Task 10. §7 tech → Task 1 + module split. §8 YAGNI → respected (no extras). ✓
- **Placeholder scan:** Tasks contain concrete code or exact interfaces; viz tasks use manual verification by design (not placeholders). ✓
- **Type/name consistency:** `analyzeAirfoil`, `evaluatePolar`, `computeFitness`, `computeReferences`, `genomeToPanels`, `genomeFeatures`, `initPopulation`, `evaluatePopulation`, `evolve`, `TunnelRenderer`, `ZooRenderer` names are consistent across tasks. ✓
- **Risk note:** Task 4 (panel method) is the riskiest; dispatch on the most capable model and review on a capable model. If its physics tests can't pass after a reasonable review loop, escalate to the human rather than relaxing tolerances.