// Genome: a Bezier airfoil represented as upper/lower control-point sets of 6
// points each, sharing the leading edge (0,0) and trailing edge (1,0). Provides
// random init, repair to physical validity, crossover, mutation, and feature
// access. DOM-free.

import { buildAirfoilPanels, computeFeatures } from "./geometry.js";

const N = 6;
const MIN_X_GAP = 0.04;
const MIN_Y = 0.006; // min |y| for interior points (avoid zero-thickness)

function clone(g) {
  return {
    upper: g.upper.map((p) => ({ x: p.x, y: p.y })),
    lower: g.lower.map((p) => ({ x: p.x, y: p.y })),
  };
}

function gaussian(rng) {
  // Box-Muller.
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A random genome with shared LE/TE on the x-axis and interior points above
// (upper) / below (lower) the chord, x spread across the chord.
export function randomGenome(rng = Math.random) {
  const upper = [];
  const lower = [];
  upper.push({ x: 0, y: 0 });
  lower.push({ x: 0, y: 0 });
  // Interior x stations: roughly evenly spaced with jitter, then sorted.
  const xs = [0.18, 0.38, 0.58, 0.78].map((x) => x + (rng() - 0.5) * 0.06);
  xs.sort((a, b) => a - b);
  for (let i = 0; i < 4; i += 1) {
    upper.push({ x: xs[i], y: 0.03 + rng() * 0.06 });
    lower.push({ x: xs[i], y: -(0.02 + rng() * 0.05) });
  }
  upper.push({ x: 1, y: 0 });
  lower.push({ x: 1, y: 0 });
  return { upper, lower };
}

export function genomeToPanels(genome, nPerSurface = 40) {
  return buildAirfoilPanels(genome.upper, genome.lower, nPerSurface);
}

export function genomeFeatures(genome) {
  return computeFeatures(genome.upper, genome.lower);
}

// Repair a genome into a NEW object (input untouched) enforcing:
//   - LE=(0,0), TE=(1,0) fixed and shared
//   - monotonically increasing x along each surface, with min spacing
//   - non-negative thickness (upper y >= 0 >= lower y)
//   - a finite trailing-edge angle (don't let the TE collapse to a cusp)
//   - light curvature smoothing to remove kinks
// Idempotent: repair(repair(g)) ~ repair(g).
export function repairGenome(genome) {
  const g = clone(genome);

  // Fix LE/TE.
  g.upper[0] = { x: 0, y: 0 };
  g.lower[0] = { x: 0, y: 0 };
  g.upper[N - 1] = { x: 1, y: 0 };
  g.lower[N - 1] = { x: 1, y: 0 };

  // Enforce sign of y (thickness).
  for (let i = 1; i < N - 1; i += 1) {
    g.upper[i].y = Math.max(MIN_Y, g.upper[i].y);
    g.lower[i].y = Math.min(-MIN_Y, g.lower[i].y);
  }

  // Monotonic x with min spacing on interior points.
  fixMonotonic(g.upper);
  fixMonotonic(g.lower);

  // Trailing-edge angle: ensure the TE-adjacent points aren't both near zero
  // (which makes a cusp). Give them enough vertical separation.
  const teGap = Math.abs(g.upper[N - 2].y - g.lower[N - 2].y);
  if (teGap < 0.03) {
    g.upper[N - 2].y = Math.max(MIN_Y, g.upper[N - 2].y) + 0.01;
    g.lower[N - 2].y = Math.min(-MIN_Y, g.lower[N - 2].y) - 0.01;
  }

  // Light curvature smoothing of interior upper/lower control points: nudge
  // each toward the average of its neighbors to remove sharp kinks.
  smoothKinks(g.upper);
  smoothKinks(g.lower);

  // Re-fix LE/TE (smoothing may have nudged endpoints) and re-clamp y.
  g.upper[0] = { x: 0, y: 0 };
  g.lower[0] = { x: 0, y: 0 };
  g.upper[N - 1] = { x: 1, y: 0 };
  g.lower[N - 1] = { x: 1, y: 0 };
  for (let i = 1; i < N - 1; i += 1) {
    g.upper[i].y = Math.max(MIN_Y, g.upper[i].y);
    g.lower[i].y = Math.min(-MIN_Y, g.lower[i].y);
  }

  return g;
}

function fixMonotonic(arr) {
  // Sort interior (exclude endpoints) by x, enforce min gap, clamp to [0,1].
  const interior = arr.slice(1, N - 1);
  interior.sort((a, b) => a.x - b.x);
  let prev = MIN_X_GAP;
  for (const p of interior) {
    let x = Math.max(prev, Math.min(0.98, p.x));
    if (x < prev + MIN_X_GAP) x = prev + MIN_X_GAP;
    p.x = Math.min(x, 0.98);
    prev = p.x;
  }
  // Write back.
  for (let i = 0; i < interior.length; i += 1) arr[1 + i] = interior[i];
}

function smoothKinks(arr) {
  // Clamp a control point's deviation from the midpoint of its neighbors to
  // the threshold (rather than blending partway). This makes repair idempotent:
  // after one pass the deviation is exactly THRESH, so a second pass does nothing.
  const THRESH = 0.03;
  const ys = arr.map((p) => p.y);
  for (let i = 1; i < N - 1; i += 1) {
    const avg = (ys[i - 1] + ys[i + 1]) / 2;
    const dev = arr[i].y - avg;
    if (Math.abs(dev) > THRESH) {
      arr[i].y = avg + Math.sign(dev) * THRESH;
    }
  }
}

// Crossover: upper from a, lower from b, with ~20% per-point blending. The
// shared LE/TE are reconciled (here they are both (0,0)/(1,0)). Result repaired.
export function crossover(a, b, rng = Math.random) {
  const upper = a.upper.map((p) => ({ x: p.x, y: p.y }));
  const lower = b.lower.map((p) => ({ x: p.x, y: p.y }));
  // Occasional per-point blend (20%) on interior points.
  for (let i = 1; i < N - 1; i += 1) {
    if (rng() < 0.2) {
      upper[i].y = (a.upper[i].y + b.upper[i].y) / 2;
      lower[i].y = (a.lower[i].y + b.lower[i].y) / 2;
    }
  }
  return repairGenome({ upper, lower });
}

// Mutate: Gaussian perturbation of each control-point coordinate with prob
// `rate`, then repair. Input is untouched.
export function mutate(genome, rate, rng = Math.random) {
  const g = clone(genome);
  for (let i = 1; i < N - 1; i += 1) {
    if (rng() < rate) g.upper[i].x += gaussian(rng) * 0.03;
    if (rng() < rate) g.upper[i].y += gaussian(rng) * 0.05;
    if (rng() < rate) g.lower[i].x += gaussian(rng) * 0.03;
    if (rng() < rate) g.lower[i].y += gaussian(rng) * 0.05;
  }
  return repairGenome(g);
}