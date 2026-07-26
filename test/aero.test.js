import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAirfoilPanels, computeFeatures } from "../src/geometry.js";
import {
  ALPHA_SWEEP,
  evaluatePolar,
  computeFitness,
  computeReferences,
  estimateAlphaCrit,
} from "../src/aero.js";

const DEG = Math.PI / 180;
function sym() {
  const up = [
    { x: 0, y: 0 },
    { x: 0.3, y: 0.06 },
    { x: 0.7, y: 0.06 },
    { x: 1, y: 0 },
  ];
  const lo = [
    { x: 0, y: 0 },
    { x: 0.3, y: -0.06 },
    { x: 0.7, y: -0.06 },
    { x: 1, y: 0 },
  ];
  return { panels: buildAirfoilPanels(up, lo, 40), feats: computeFeatures(up, lo) };
}

test("evaluatePolar returns one entry per sweep angle", () => {
  const { panels, feats } = sym();
  const p = evaluatePolar(panels, feats);
  assert.equal(p.length, ALPHA_SWEEP.length);
  for (const e of p) {
    assert.ok(typeof e.cl === "number" && Number.isFinite(e.cl) || e.ok === false);
  }
});

test("alphaCrit is within [4deg,20deg]", () => {
  const a = estimateAlphaCrit({
    camber: 0.02,
    thickness: 0.12,
    teAngle: 0.2,
    minCurvature: 0.05,
  });
  assert.ok(a >= 4 * DEG - 1e-9 && a <= 20 * DEG + 1e-9);
});

test("higher camber lowers alphaCrit", () => {
  const thin = estimateAlphaCrit({
    camber: 0.0,
    thickness: 0.12,
    teAngle: 0.2,
    minCurvature: 0.05,
  });
  const cambered = estimateAlphaCrit({
    camber: 0.06,
    thickness: 0.12,
    teAngle: 0.2,
    minCurvature: 0.05,
  });
  assert.ok(cambered < thin, "more camber => stalls sooner");
});

test("computeFitness: finite and a low stall target is not more punishing", () => {
  const { panels, feats } = sym();
  const polar = evaluatePolar(panels, feats);
  const refs = { LD_REF: 50, CL_REF: 0.5 };
  const f1 = computeFitness(
    polar,
    feats,
    { cruiseAlpha: 4 * DEG, wLift: 0.5, wDrag: 0.5, stallTarget: 16 * DEG },
    refs,
  );
  assert.ok(Number.isFinite(f1));
  const f2 = computeFitness(
    polar,
    feats,
    { cruiseAlpha: 4 * DEG, wLift: 0.5, wDrag: 0.5, stallTarget: 4 * DEG },
    refs,
  );
  assert.ok(f2 >= f1, `low stall target should not be more punishing, f2=${f2} f1=${f1}`);
});

test("computeReferences returns finite positive refs", () => {
  const { panels } = sym();
  const r = computeReferences(panels, 4 * DEG);
  assert.ok(r.LD_REF > 0 && r.CL_REF > 0 && Number.isFinite(r.LD_REF));
});