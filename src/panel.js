// 2D inviscid panel method: constant-strength source panels + a single
// circulation point vortex at the quarter chord, with a Kutta condition.
//
// Method (Hess-style source + single vortex):
//   - N panels, each with constant source strength sigma_j.
//   - A single point vortex of strength Gamma at the quarter chord (0.25, 0).
//   - Boundary condition (N eqns): total normal velocity = 0 at each midpoint
//     (freestream + all sources + the vortex are tangent to the surface).
//   - Kutta condition (1 eqn): the tangential velocities on the two panels
//     meeting at the trailing edge (the rightmost vertex) sum to zero, i.e.
//     the flow leaves the TE smoothly with no loading.
//   - Solve the (N+1)x(N+1) system. Singular/non-finite => return null.
//
// All angles in radians, Vinf = 1. DOM-free.
//
// Kutta form used: Vt[upperTEpanel] + Vt[lowerTEpanel] = 0, where the two TE
// panels are the ones adjacent to the rightmost (max-x) vertex.

import { solveLinear } from "./linalg.js";

const VINF = 1.0;
const TWO_PI = 2 * Math.PI;

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

// Velocity at point P induced by a unit-strength constant source panel
// [start, end]. Local-frame formula:
//   u_xi = (1/2pi) * ln(r1/r2),  u_eta = (1/2pi) * (theta2 - theta1)
// where r1,r2 are distances to the panel endpoints and theta1,theta2 the
// angles from P to those endpoints in the panel-local frame.
function unitSourceVelAt(P, start, end) {
  const ex = end.x - start.x;
  const ey = end.y - start.y;
  const L = Math.hypot(ex, ey) || 1e-12;
  const etx = ex / L;
  const ety = ey / L;
  // Local normal (sign arbitrary; only used to decompose, then re-project).
  const enx = -ety;
  const eny = etx;
  const rx = P.x - start.x;
  const ry = P.y - start.y;
  const xi = rx * etx + ry * ety; // along panel
  const eta = rx * enx + ry * eny; // perpendicular
  const r1 = Math.max(Math.hypot(xi, eta), 1e-12);
  const r2 = Math.max(Math.hypot(xi - L, eta), 1e-12);
  const th1 = Math.atan2(eta, xi);
  const th2 = Math.atan2(eta, xi - L);
  const uXi = (Math.log(r1 / r2)) / TWO_PI;
  const uEta = (th2 - th1) / TWO_PI;
  return { x: uXi * etx + uEta * enx, y: uXi * ety + uEta * eny };
}

// Velocity at P induced by a unit-strength point vortex at center c.
function unitVortexVelAt(P, cx, cy) {
  const dx = P.x - cx;
  const dy = P.y - cy;
  const r2 = Math.max(dx * dx + dy * dy, 1e-12);
  const f = 1 / (TWO_PI * r2);
  return { x: -dy * f, y: dx * f };
}

export function analyzeAirfoil(panels, alpha, Vinf = VINF) {
  const pts = panels.points;
  const mids = panels.midpoints;
  const nrms = panels.normals;
  const tans = panels.tangents;
  const N = pts.length;
  if (N < 3 || mids.length !== N || nrms.length !== N || tans.length !== N) {
    return null;
  }

  // Freestream vector.
  const ux = Math.cos(alpha) * Vinf;
  const uy = Math.sin(alpha) * Vinf;

  // Panel endpoints.
  const starts = new Array(N);
  const ends = new Array(N);
  const lengths = new Array(N);
  for (let i = 0; i < N; i += 1) {
    starts[i] = pts[i];
    ends[i] = pts[(i + 1) % N];
    lengths[i] = Math.hypot(ends[i].x - starts[i].x, ends[i].y - starts[i].y);
  }

  // Vortex center: length-weighted centroid of the panel midpoints. This
  // keeps the bound vortex safely inside the body (away from the surface)
  // even for thin or near-flat lower surfaces, where a fixed quarter-chord
  // point at (0.25, 0) could sit arbitrarily close to the skin and spike.
  let cx = 0;
  let cy = 0;
  let totL = 0;
  for (let i = 0; i < N; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % N];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    cx += ((a.x + b.x) / 2) * L;
    cy += ((a.y + b.y) / 2) * L;
    totL += L;
  }
  cx /= totL || 1;
  cy /= totL || 1;

  // Find the trailing-edge vertex: rightmost (max x). The two panels meeting
  // there are the upper TE panel (k-1) and lower TE panel (k).
  let te = 0;
  let maxX = pts[0].x;
  for (let i = 1; i < N; i += 1) {
    if (pts[i].x > maxX) {
      maxX = pts[i].x;
      te = i;
    }
  }
  const upperTE = (te - 1 + N) % N;
  const lowerTE = te;

  // Precompute vortex influences at each midpoint (per unit Gamma).
  const vNrm = new Array(N);
  const vTan = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const v = unitVortexVelAt(mids[i], cx, cy);
    vNrm[i] = dot(v, nrms[i]);
    vTan[i] = dot(v, tans[i]);
  }

  // Freestream normal/tangential at each midpoint.
  const fsNrm = new Array(N);
  const fsTan = new Array(N);
  for (let i = 0; i < N; i += 1) {
    fsNrm[i] = ux * nrms[i].x + uy * nrms[i].y;
    fsTan[i] = ux * tans[i].x + uy * tans[i].y;
  }

  // Build (N+1) x (N+1) system.
  // Unknowns: sigma_0..sigma_{N-1}, Gamma (index N).
  // Rows 0..N-1: boundary (normal) equations.
  // Row N: Kutta equation (tangential at the two TE panels).
  const size = N + 1;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);

  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      if (i === j) {
        // Self-influence: outward normal velocity +1/2 per unit source;
        // tangential self-velocity at midpoint is 0.
        A[i][j] = 0.5;
      } else {
        const v = unitSourceVelAt(mids[i], starts[j], ends[j]);
        A[i][j] = dot(v, nrms[i]);
      }
    }
    A[i][N] = vNrm[i]; // vortex normal influence
    b[i] = -fsNrm[i];
  }

  // Kutta row: Vt[upperTE] + Vt[lowerTE] = 0.
  const kRow = N;
  for (let j = 0; j < N; j += 1) {
    let tUp = 0;
    let tLo = 0;
    if (j !== upperTE) {
      const vUp = unitSourceVelAt(mids[upperTE], starts[j], ends[j]);
      tUp = dot(vUp, tans[upperTE]);
    }
    if (j !== lowerTE) {
      const vLo = unitSourceVelAt(mids[lowerTE], starts[j], ends[j]);
      tLo = dot(vLo, tans[lowerTE]);
    }
    A[kRow][j] = tUp + tLo;
  }
  A[kRow][N] = vTan[upperTE] + vTan[lowerTE];
  b[kRow] = -(fsTan[upperTE] + fsTan[lowerTE]);

  const sol = solveLinear(A, b);
  if (!sol) return null;
  for (const val of sol) {
    if (!Number.isFinite(val)) return null;
  }

  const sigma = sol.slice(0, N);
  const gamma = sol[N];

  // Tangential velocity, Cp at each midpoint.
  const tangentialV = new Array(N);
  const cp = new Array(N);
  for (let i = 0; i < N; i += 1) {
    let vt = fsTan[i] + vTan[i] * gamma;
    for (let j = 0; j < N; j += 1) {
      if (i === j) continue; // self tangential contribution is 0
      const v = unitSourceVelAt(mids[i], starts[j], ends[j]);
      vt += dot(v, tans[i]) * sigma[j];
    }
    tangentialV[i] = vt;
    const ratio = vt / Vinf;
    cp[i] = 1 - ratio * ratio;
    if (!Number.isFinite(cp[i])) cp[i] = 0;
  }

  // Lift coefficient by pressure integration. Lift direction perpendicular to
  // freestream: (-sin a, cos a). Cl = -sum Cp * (n . liftDir) * ds.
  const ldx = -Math.sin(alpha);
  const ldy = Math.cos(alpha);
  let cl = 0;
  for (let i = 0; i < N; i += 1) {
    cl -= cp[i] * (nrms[i].x * ldx + nrms[i].y * ldy) * lengths[i];
  }
  if (!Number.isFinite(cl)) return null;

  const xMid = mids.map((m) => m.x);
  const yMid = mids.map((m) => m.y);

  const velocityField = {
    at(x, y) {
      let vx = ux;
      let vy = uy;
      const vv = unitVortexVelAt({ x, y }, cx, cy);
      vx += vv.x * gamma;
      vy += vv.y * gamma;
      for (let j = 0; j < N; j += 1) {
        const v = unitSourceVelAt({ x, y }, starts[j], ends[j]);
        vx += v.x * sigma[j];
        vy += v.y * sigma[j];
      }
      return { u: vx, v: vy };
    },
  };

  return { cl, cp, tangentialV, velocityField, xMid, yMid };
}