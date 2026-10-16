import { compareArrays } from './compare';

describe('compareArrays', () => {
  it('reports identical arrays', () => {
    expect(compareArrays([1, 2, 3], [1, 2, 3])).toEqual({ count: 3, differing: 0, maxDiff: 0, meanDiff: 0 });
  });
  it('summarises differences', () => {
    expect(compareArrays([10, 20, 30, 40], [10, 22, 30, 36])).toEqual({ count: 4, differing: 2, maxDiff: 4, meanDiff: 1.5 });
  });
  it('rejects different lengths', () => {
    expect(() => compareArrays([1], [1, 2])).toThrow(/mismatch/);
  });
});
