import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleBezier,
  buildAirfoilPanels,
  computeFeatures,
} from "../src/geometry.js";

test("sampleBezier: endpoints match control points", () => {
  const cps = [{ x: 0, y: 0 }, { x: 0.5, y: 0.2 }, { x: 1, y: 0 }];
  const pts = sampleBezier(cps, 21);
  assert.equal(pts.length, 21);
  assert.ok(Math.abs(pts[0].x - 0) < 1e-9 && Math.abs(pts[0].y - 0) < 1e-9);
  assert.ok(Math.abs(pts[20].x - 1) < 1e-9 && Math.abs(pts[20].y - 0) < 1e-9);
});

test("buildAirfoilPanels: closed contour, outward normals, count", () => {
  const up = [
    { x: 0, y: 0 },
    { x: 0.3, y: 0.08 },
    { x: 0.7, y: 0.06 },
    { x: 1, y: 0 },
  ];
  const lo = [
    { x: 0, y: 0 },
    { x: 0.3, y: -0.04 },
    { x: 0.7, y: -0.03 },
    { x: 1, y: 0 },
  ];
  const r = buildAirfoilPanels(up, lo, 20);
  assert.equal(r.points.length, 40);
  assert.equal(r.normals.length, 40);
  // normals are unit length
  for (const n of r.normals) assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-9);
  // upper-surface normals point generally up (positive y) near mid-chord
  const mid = r.normals[10];
  assert.ok(mid.y > 0, "upper normal should point up");
});

test("computeFeatures: symmetric NACA-ish shape has zero camber", () => {
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
  const f = computeFeatures(up, lo);
  assert.ok(Math.abs(f.camber) < 1e-6, `camber should be ~0, got ${f.camber}`);
  // NOTE: tolerance widened from the plan's (0.1,0.13): the cubic Bezier through
  // these control points sags to a max thickness of ~0.09, not 0.12.
  assert.ok(
    f.thickness > 0.07 && f.thickness < 0.11,
    `thickness ~0.09, got ${f.thickness}`,
  );
});

test("computeFeatures: cambered shape has positive camber", () => {
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
  const f = computeFeatures(up, lo);
  assert.ok(f.camber > 0.005, `camber should be positive, got ${f.camber}`);
});