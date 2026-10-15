import { mapLimit } from './pool';

describe('mapLimit', () => {
  it('keeps results in input order and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
