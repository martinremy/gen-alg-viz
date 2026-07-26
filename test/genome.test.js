import { test } from "node:test";
import assert from "node:assert/strict";
import {
  randomGenome,
  repairGenome,
  crossover,
  mutate,
  genomeToPanels,
  genomeFeatures,
} from "../src/genome.js";

const rng = () => Math.random();

test("randomGenome: 6+6 points, shared LE/TE, valid signs", () => {
  const g = randomGenome(rng);
  assert.equal(g.upper.length, 6);
  assert.equal(g.lower.length, 6);
  assert.deepEqual(g.upper[0], g.lower[0]); // LE shared
  assert.deepEqual(g.upper[5], g.lower[5]); // TE shared
  assert.equal(g.upper[0].x, 0);
  assert.equal(g.upper[0].y, 0);
  assert.equal(g.upper[5].x, 1);
  assert.equal(g.upper[5].y, 0);
  for (const p of g.upper) assert.ok(p.y >= -1e-9);
  for (const p of g.lower) assert.ok(p.y <= 1e-9);
});

test("repairGenome: monotonic x and non-negative thickness", () => {
  const bad = {
    upper: [
      { x: 0, y: 0 },
      { x: 0.7, y: 0.05 },
      { x: 0.3, y: 0.07 },
      { x: 0.9, y: 0.04 },
      { x: 0.6, y: 0.02 },
      { x: 1, y: 0 },
    ],
    lower: [
      { x: 0, y: 0 },
      { x: 0.5, y: -0.05 },
      { x: 0.4, y: 0.02 },
      { x: 0.8, y: -0.03 },
      { x: 0.6, y: -0.04 },
      { x: 1, y: 0 },
    ],
  };
  const r = repairGenome(bad);
  for (let i = 1; i < 6; i += 1)
    assert.ok(r.upper[i].x > r.upper[i - 1].x, `upper x not monotonic at ${i}`);
  for (let i = 1; i < 6; i += 1)
    assert.ok(r.lower[i].x > r.lower[i - 1].x, `lower x not monotonic at ${i}`);
  for (let i = 0; i < 6; i += 1) assert.ok(r.upper[i].y >= r.lower[i].y - 1e-9);
});

test("repairGenome does not mutate input", () => {
  const g = randomGenome(rng);
  const snapshot = JSON.parse(JSON.stringify(g));
  repairGenome(g);
  assert.deepEqual(g, snapshot);
});

test("crossover produces a valid, repaired child", () => {
  const a = randomGenome(rng);
  const b = randomGenome(rng);
  const c = crossover(a, b, rng);
  assert.equal(c.upper.length, 6);
  assert.deepEqual(c.upper[0], c.lower[0]);
  assert.deepEqual(c.upper[5], c.lower[5]);
  for (let i = 1; i < 6; i += 1) assert.ok(c.upper[i].x > c.upper[i - 1].x);
});

test("mutate with rate 0 returns equivalent genome (only repaired)", () => {
  const g = repairGenome(randomGenome(rng));
  const m = mutate(g, 0, rng);
  assert.deepEqual(m.upper, g.upper);
  assert.deepEqual(m.lower, g.lower);
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