export interface Comparison {
  count: number;
  /** Voxels whose values differ at all. */
  differing: number;
  maxDiff: number;
  meanDiff: number;
}

/** Compare two equally sized arrays of numbers (blosc is exact; JPEG is lossy, so expect small diffs). */
export function compareArrays(a: ArrayLike<number>, b: ArrayLike<number>): Comparison {
  if (a.length !== b.length) throw new Error(`Length mismatch: ${a.length} vs ${b.length}`);
  let differing = 0;
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d) differing++;
    if (d > max) max = d;
    sum += d;
  }
  return { count: a.length, differing, maxDiff: max, meanDiff: a.length ? sum / a.length : 0 };
}
