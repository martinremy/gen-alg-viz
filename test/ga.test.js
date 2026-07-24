import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initPopulation,
  evaluatePopulation,
  evolve,
  tournamentSelect,
} from "../src/ga.js";

const rng = () => Math.random();
const opts = {
  cruiseAlpha: 4 * Math.PI / 180,
  wLift: 0.5,
  wDrag: 0.5,
  stallTarget: 12 * Math.PI / 180,
};
const refs = { LD_REF: 50, CL_REF: 0.5 };
const params = { eliteCount: 2, tournamentSize: 3, mutationRate: 0.08 };

test("initPopulation has correct size of repaired genomes", () => {
  const pop = initPopulation(14, rng);
  assert.equal(pop.length, 14);
  for (const g of pop) {
    for (let i = 1; i < g.upper.length; i += 1)
      assert.ok(g.upper[i].x > g.upper[i - 1].x);
  }
});

test("evaluatePopulation returns finite fitnesses and metrics", () => {
  const pop = initPopulation(8, rng);
  const { fitnesses, metrics } = evaluatePopulation(pop, opts, refs);
  assert.equal(fitnesses.length, 8);
  assert.equal(metrics.length, 8);
  for (const f of fitnesses) assert.ok(Number.isFinite(f));
  for (const m of metrics) {
    assert.ok(m.features && m.polar && Number.isFinite(m.fitness));
  }
});

test("evolve preserves population size and elites", () => {
  const pop = initPopulation(14, rng);
  const { fitnesses } = evaluatePopulation(pop, opts, refs);
  const next = evolve(pop, fitnesses, params, rng);
  assert.equal(next.length, 14);
  // top 2 elites should carry over by reference
  const order = fitnesses
    .map((f, i) => [f, i])
    .sort((a, b) => b[0] - a[0]);
  const e0 = pop[order[0][1]];
  const e1 = pop[order[1][1]];
  assert.ok(next.includes(e0) && next.includes(e1), "elites should carry over by reference");
});

test("tournamentSelect returns a valid index and favors higher fitness", () => {
  const fitnesses = [0.1, 0.9, 0.2, 0.8, 0.3];
  let pickedHigh = false;
  for (let i = 0; i < 50; i += 1) {
    const idx = tournamentSelect(fitnesses, 3, rng);
    assert.ok(idx >= 0 && idx < fitnesses.length);
    if (idx === 1 || idx === 3) pickedHigh = true;
  }
  assert.ok(pickedHigh, "tournament should frequently pick high-fitness indices");
});