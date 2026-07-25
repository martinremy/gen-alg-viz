// Aero: profile-drag proxy, shape-driven stall model, polar evaluation across
// a fixed angle-of-attack sweep, composite fitness, and fixed reference
// constants. DOM-free.
//
// The inviscid panel method cannot bound lift as camber grows, so the fitness
// is evaluated across a small polar (not a single point) and stall is keyed to
// a shape-derived critical angle (more camber / less thickness => stalls
// sooner). This couples the stall penalty to the shape the GA is evolving.

import { analyzeAirfoil } from "./panel.js";

export const ALPHA_SWEEP = [0, 4, 8, 12, 16].map((d) => (d * Math.PI) / 180);
const W_STALL = 3.0; // strong fixed weight on the stall shortfall
const W_SHAPE = 0.5; // mild fixed weight on shape regularity
const FIT_FLOOR = -1.0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Profile-drag proxy: Cd0 grows with thickness, clamped to a positive floor.
export function Cd0(thickness) {
  return Math.max(0.002, 0.006 + 0.02 * (thickness - 0.12));
}

// Shape-derived critical angle of attack (radians), clamped to [4deg, 20deg].
// Base ~15deg; more camber stalls sooner, thinner sections stall sooner.
export function estimateAlphaCrit(features) {
  const base = 0.26; // ~15deg
  const camberPenalty = 2.0 * (features.camber || 0);
  const thinPenalty = 1.5 * Math.max(0, 0.12 - (features.thickness || 0));
  return clamp(base - camberPenalty - thinPenalty, (4 * Math.PI) / 180, (20 * Math.PI) / 180);
}

// Mild penalty for non-physical / degenerate shapes that could exploit the
// inviscid model: excessive camber, near-zero thickness, sharp TE, kinks.
function shapeRegularityPenalty(features) {
  const camberExcess = Math.max(0, Math.abs(features.camber || 0) - 0.06);
  const thin = Math.max(0, 0.06 - (features.thickness || 0));
  const tePenalty = Math.max(0, 0.15 - (features.teAngle || 0));
  const kink = Math.max(0, 0.02 - (features.minCurvature || 0));
  return camberExcess * 6 + thin * 10 + tePenalty * 1.0 + kink * 10;
}

// Evaluate the panel method across the fixed alpha-sweep for one airfoil.
// Returns one entry per sweep angle: { alpha, cl, cd, stalled, ok }.
export function evaluatePolar(panels, features) {
  const alphaCrit = estimateAlphaCrit(features);
  const out = [];
  for (const alpha of ALPHA_SWEEP) {
    const r = analyzeAirfoil(panels, alpha);
    if (!r) {
      out.push({ alpha, cl: 0, cd: 1.0, stalled: true, ok: false });
      continue;
    }
    let cl = r.cl;
    const cd0 = Cd0(features.thickness || 0.12);
    let cd = cd0 + 0.05 * cl * cl;
    const stalled = alpha >= alphaCrit - 1e-9;
    if (stalled) {
      // Clamp lift to the linear value at the critical angle and add a drag
      // spike past it (cheap stand-in for flow separation).
      const clCrit = 2 * Math.PI * alphaCrit;
      cl = Math.min(cl, clCrit);
      cd += 0.08 * Math.max(0, alpha - alphaCrit);
    }
    out.push({ alpha, cl, cd, stalled, ok: true });
  }
  return out;
}

// Linear interpolation of cl / cd at an arbitrary alpha within the sweep.
// Exported so the UI can read Cl/Cd/L-D at the (continuous) cruise alpha even
// when it falls between sweep points.
export function polarPoint(polar, alpha) {
  if (alpha <= polar[0].alpha) return { cl: polar[0].cl, cd: polar[0].cd };
  if (alpha >= polar[polar.length - 1].alpha) {
    const last = polar[polar.length - 1];
    return { cl: last.cl, cd: last.cd };
  }
  for (let i = 0; i < polar.length - 1; i += 1) {
    const a = polar[i];
    const b = polar[i + 1];
    if (alpha >= a.alpha && alpha <= b.alpha) {
      const t = (alpha - a.alpha) / (b.alpha - a.alpha || 1e-12);
      return { cl: a.cl + (b.cl - a.cl) * t, cd: a.cd + (b.cd - a.cd) * t };
    }
  }
  return { cl: 0, cd: 1 };
}

// Composite fitness from a polar. Fixed-reference normalization keeps the
// fitness scale stable as the user moves the cruise-alpha slider.
export function computeFitness(polar, features, opts, refs) {
  const { cruiseAlpha, wLift, wDrag, stallTarget } = opts;
  const { cl, cd } = polarPoint(polar, cruiseAlpha);
  const ld = cd > 1e-6 ? cl / cd : 0;
  const ldNorm = clamp(ld / (refs.LD_REF || 1), 0, 1);
  const clNorm = clamp(cl / (refs.CL_REF || 1), 0, 1);
  const alphaCrit = estimateAlphaCrit(features);
  const stallPenalty = Math.max(0, stallTarget - alphaCrit); // radians of shortfall
  const shapePenalty = shapeRegularityPenalty(features);
  let f = wDrag * ldNorm + wLift * clNorm - W_STALL * stallPenalty - W_SHAPE * shapePenalty;
  if (!Number.isFinite(f)) f = FIT_FLOOR;
  return Math.max(FIT_FLOOR, f);
}

// Fixed reference constants, computed once at startup at a fixed reference
// alpha. They do NOT track the user's cruise-alpha slider.
export function computeReferences(refPanels, refAlpha) {
  const r = analyzeAirfoil(refPanels, refAlpha);
  let cl = r ? r.cl : 0.3;
  if (!Number.isFinite(cl) || cl <= 0) cl = 0.3;
  const cd = Cd0(0.12) + 0.05 * cl * cl;
  const LD_REF = Math.max(1, cl / cd);
  const CL_REF = Math.max(0.1, cl);
  return { LD_REF, CL_REF };
}