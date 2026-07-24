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