import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAirfoilPanels } from "../src/geometry.js";
import { analyzeAirfoil } from "../src/panel.js";

const DEG = Math.PI / 180;

function symShape() {
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
  return buildAirfoilPanels(up, lo, 40);
}
function camberedShape() {
  const up = [
    { x: 0, y: 0.02 },
    { x: 0.3, y: 0.09 },
    { x: 0.7, y: 0.06 },
    { x: 1, y: 0.0 },
  ];
  const lo = [
    { x: 0, y: 0.02 },
    { x: 0.3, y: -0.01 },
    { x: 0.7, y: -0.02 },
    { x: 1, y: 0.0 },
  ];
  return buildAirfoilPanels(up, lo, 40);
}

test("symmetric airfoil at 0deg has ~0 lift", () => {
  const r = analyzeAirfoil(symShape(), 0);
  assert.ok(r, "should not fail for a valid symmetric shape");
  assert.ok(Math.abs(r.cl) < 0.02, `expected |Cl|<0.02, got ${r.cl}`);
});

test("symmetric airfoil at 5deg produces positive lift near 2*pi*alpha", () => {
  const r = analyzeAirfoil(symShape(), 5 * DEG);
  assert.ok(r);
  assert.ok(r.cl > 0, `expected Cl>0, got ${r.cl}`);
  const expected = (2 * Math.PI * 5 * DEG);
  assert.ok(
    Math.abs(r.cl - expected) / expected < 0.4,
    `Cl=${r.cl} expected~${expected}`,
  );
});

test("cambered airfoil at 0deg produces positive lift", () => {
  const r = analyzeAirfoil(camberedShape(), 0);
  assert.ok(r);
  assert.ok(r.cl > 0.01, `camber should produce positive lift at 0deg, got ${r.cl}`);
});

test("degenerate (all-identical points) returns null, does not throw", () => {
  // All-identical points -> zero-length panels, singular influence matrix.
  const degenerate = {
    points: Array.from({ length: 20 }, () => ({ x: 0.5, y: 0 })),
    midpoints: Array.from({ length: 19 }, () => ({ x: 0.5, y: 0 })),
    normals: Array.from({ length: 19 }, () => ({ x: 0, y: 1 })),
    tangents: Array.from({ length: 19 }, () => ({ x: 1, y: 0 })),
  };
  let result;
  assert.doesNotThrow(() => {
    result = analyzeAirfoil(degenerate, 5 * DEG);
  });
  assert.equal(result, null);
});

test("velocityField.at returns finite vectors near the body", () => {
  const r = analyzeAirfoil(symShape(), 5 * DEG);
  assert.ok(r);
  const v = r.velocityField.at(0.5, 0.3);
  assert.ok(Number.isFinite(v.u) && Number.isFinite(v.v));
});