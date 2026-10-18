import { MAX_FPS, MAX_SWEEP_INTENSITY, MIN_FPS, SWEEP_COLOR, canSweep, sweepBands, sweepFrameCount, sweepProblems } from './edge-sweep';

describe('sweepProblems', () => {
  const ok = { anchor: 16, destination: 96, fps: 10 };

  it('accepts a whole-number anchor below a whole-number destination and an fps in range', () => {
    expect(sweepProblems(ok)).toEqual({});
    expect(canSweep(ok)).toBe(true);
    expect(canSweep({ anchor: 0, destination: 1, fps: MIN_FPS })).toBe(true);
    expect(canSweep({ anchor: 0, destination: MAX_SWEEP_INTENSITY, fps: MAX_FPS })).toBe(true);
    expect(canSweep({ ...ok, fps: 2.5 })).toBe(true);
  });

  it('rejects an anchor that is blank, fractional, negative or too large', () => {
    for (const anchor of [NaN, 1.5, -1, MAX_SWEEP_INTENSITY + 1, Infinity]) {
      expect(Object.keys(sweepProblems({ ...ok, anchor }))).toContain('anchor');
    }
  });

  it('rejects a destination that is blank, fractional, out of range, or not above the anchor', () => {
    for (const destination of [NaN, 1.5, -1, MAX_SWEEP_INTENSITY + 1, Infinity]) {
      expect(Object.keys(sweepProblems({ ...ok, destination }))).toContain('destination');
    }
    expect(sweepProblems({ ...ok, destination: 16 }).destination).toContain('greater than the anchor');
    expect(sweepProblems({ ...ok, destination: 5 }).destination).toContain('greater than the anchor');
  });

  it('does not blame the destination for being below an anchor that is itself invalid', () => {
    const p = sweepProblems({ anchor: NaN, destination: 50, fps: 10 });
    expect(Object.keys(p)).toEqual(['anchor']);
  });

  it('rejects an fps that is blank, below the minimum or above the maximum', () => {
    for (const fps of [NaN, 0, MIN_FPS - 0.5, MAX_FPS + 1, Infinity, -5]) {
      expect(Object.keys(sweepProblems({ ...ok, fps }))).toEqual(['fps']);
    }
  });

  it('reports every bad input at once', () => {
    expect(Object.keys(sweepProblems({ anchor: NaN, destination: NaN, fps: NaN })).sort()).toEqual(['anchor', 'destination', 'fps']);
  });
});

describe('sweepBands', () => {
  it('is one band from the anchor up to the current upper end', () => {
    expect(sweepBands(16, 40)).toEqual([{ min: 16, max: 40, color: SWEEP_COLOR }]);
  });

  it('is an empty range on the first frame, when the upper end equals the anchor', () => {
    const [b] = sweepBands(16, 16);
    expect(b.max).toBe(b.min);
  });
});

describe('sweepFrameCount', () => {
  it('counts the empty first frame and one frame per strength up to the destination', () => {
    expect(sweepFrameCount(16, 20)).toBe(5);
    expect(sweepFrameCount(0, 1)).toBe(2);
  });
});
