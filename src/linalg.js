// Gaussian elimination with partial pivoting.
// Returns null for singular matrices or any non-finite pivot/solution value.
// DOM-free so it stays Node-testable.
export function solveLinear(A, b) {
  const n = b.length;
  // Augmented matrix (work copy).
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    // Partial pivot: largest absolute value in this column at or below `col`.
    let piv = col;
    let best = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(M[r][col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (!Number.isFinite(best) || best < 1e-12) return null;
    if (piv !== col) {
      const tmp = M[col];
      M[col] = M[piv];
      M[piv] = tmp;
    }
    const pivVal = M[col][col];
    for (let r = col + 1; r < n; r += 1) {
      const f = M[r][col] / pivVal;
      if (f !== 0) {
        for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
      }
    }
  }
  // Back-substitution.
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j += 1) s -= M[i][j] * x[j];
    const d = M[i][i];
    if (Math.abs(d) < 1e-12) return null;
    x[i] = s / d;
    if (!Number.isFinite(x[i])) return null;
  }
  return x;
}

export function zeros(n) {
  return new Array(n).fill(0);
}

export function cloneMatrix(A) {
  return A.map((row) => [...row]);
}