// Geometry: Bezier sampling, airfoil panel construction, and feature extraction.
// DOM-free so it stays Node-testable. Chord normalized to x in [0,1].

// De Casteljau evaluation of a Bezier curve defined by control points at t.
function decasteljau(cps, t) {
  let pts = cps.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  for (let k = 1; k < n; k += 1) {
    for (let i = 0; i < n - k; i += 1) {
      pts[i] = {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
  }
  return { x: pts[0].x, y: pts[0].y };
}

// Sample n points (including endpoints) along the Bezier curve.
export function sampleBezier(controlPoints, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    out.push(decasteljau(controlPoints, t));
  }
  return out;
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a, s) {
  return { x: a.x * s, y: a.y * s };
}
function norm(v) {
  const m = Math.hypot(v.x, v.y) || 1e-12;
  return { x: v.x / m, y: v.y / m };
}

// Build a closed airfoil contour from upper/lower Bezier control points.
// Returns ordered vertices, per-panel midpoints, outward unit normals,
// and unit tangents. nPerSurface panels per surface -> 2*nPerSurface panels.
export function buildAirfoilPanels(upperCP, lowerCP, nPerSurface) {
  const nu = nPerSurface + 1; // vertices per surface (panels+1)
  const upperPts = sampleBezier(upperCP, nu); // LE -> TE
  const lowerPts = sampleBezier(lowerCP, nu); // LE -> TE

  // Ordered closed contour: upper LE->TE, then lower interior TE->LE.
  // Share LE and TE so there are no duplicate vertices: 2*nPerSurface vertices.
  const points = [];
  for (let i = 0; i < nu; i += 1) points.push(upperPts[i]); // includes LE and TE
  // Lower: from TE back toward LE, excluding TE (already last upper) and LE
  // (closes back to first upper point).
  for (let i = nu - 2; i >= 1; i -= 1) points.push(lowerPts[i]);

  const N = points.length; // 2 * nPerSurface
  // Centroid for outward-normal orientation.
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= N;
  cy /= N;

  const midpoints = [];
  const normals = [];
  const tangents = [];
  for (let i = 0; i < N; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % N];
    const mid = scale(add(a, b), 0.5);
    const tan = norm(sub(b, a));
    // Candidate outward normal: rotate tangent +90 deg => (-tan.y, tan.x).
    let nrm = { x: -tan.y, y: tan.x };
    // Ensure it points away from the centroid.
    const toMid = sub(mid, { x: cx, y: cy });
    if (nrm.x * toMid.x + nrm.y * toMid.y < 0) {
      nrm = { x: -nrm.x, y: -nrm.y };
    }
    midpoints.push(mid);
    tangents.push(tan);
    normals.push(nrm);
  }

  return { points, midpoints, normals, tangents, isClosed: true };
}

// Sample y on a Bezier surface at a given x station via inverse lookup
// (binary search on t by x-coordinate, assuming x is monotonic along surface).
function yAtX(cps, sampled, x) {
  // sampled already includes endpoints; find segment bracketing x.
  let lo = 0;
  let hi = sampled.length - 1;
  if (x <= sampled[0].x) return sampled[0].y;
  if (x >= sampled[hi].x) return sampled[hi].y;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (sampled[m].x <= x) lo = m;
    else hi = m;
  }
  const a = sampled[lo];
  const b = sampled[hi];
  const t = (x - a.x) / (b.x - a.x || 1e-12);
  return a.y + (b.y - a.y) * t;
}

// Extract geometric features from upper/lower control points.
export function computeFeatures(upperCP, lowerCP) {
  const stations = 60;
  const upperPts = sampleBezier(upperCP, stations + 1);
  const lowerPts = sampleBezier(lowerCP, stations + 1);

  // Build a common x grid in [0,1].
  let camber = 0;
  let camberPos = 0;
  let thickness = 0;
  let thicknessPos = 0;
  for (let i = 0; i <= stations; i += 1) {
    const x = i / stations;
    const uy = yAtX(upperCP, upperPts, x);
    const ly = yAtX(lowerCP, lowerPts, x);
    const c = (uy + ly) / 2; // camber line
    if (Math.abs(c) > Math.abs(camber)) {
      camber = c;
      camberPos = x;
    }
    const th = uy - ly;
    if (th > thickness) {
      thickness = th;
      thicknessPos = x;
    }
  }

  // Trailing-edge interior angle between the upper and lower surface tangents
  // as they meet at the TE.
  const nUp = upperPts.length;
  const upTE = sub(upperPts[nUp - 1], upperPts[nUp - 2]); // toward TE
  const loTE = sub(lowerPts[nUp - 1], lowerPts[nUp - 2]); // toward TE
  const dot =
    (upTE.x * loTE.x + upTE.y * loTE.y) /
    (Math.hypot(upTE.x, upTE.y) * Math.hypot(loTE.x, loTE.y) || 1e-12);
  const teAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Minimum curvature radius along the closed contour (discrete).
  const panels = buildAirfoilPanels(upperCP, lowerCP, 40);
  const pts = panels.points;
  const N = pts.length;
  let minCurvature = Infinity;
  for (let i = 0; i < N; i += 1) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const v1 = sub(p1, p0);
    const v2 = sub(p2, p1);
    const v3 = sub(p2, p0);
    const cross = v1.x * v2.y - v1.y * v2.x;
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    const len3 = Math.hypot(v3.x, v3.y);
    const denom = Math.abs(len1) * Math.abs(len2) * Math.abs(len3);
    if (denom > 1e-12) {
      const radius = denom / (2 * Math.abs(cross) + 1e-12);
      if (radius < minCurvature) minCurvature = radius;
    }
  }
  if (!Number.isFinite(minCurvature)) minCurvature = 0;

  return { camber, camberPos, thickness, thicknessPos, teAngle, minCurvature };
}