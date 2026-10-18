import { autoWindow, windowToGrey } from './windowing';

const ramp = (n: number, from: number) => Uint16Array.from({ length: n }, (_, i) => from + i);

describe('autoWindow', () => {
  it('clips half a percent at each end of a uint16 plane', () => {
    // 1,000 distinct values: the 6th smallest is where 0.5% lie below, the 995th is where 99.5% do.
    expect(autoWindow(ramp(1000, 1000))).toEqual({ lo: 1005, hi: 1994 });
  });

  it('ignores a few hot pixels, so they cannot flatten the picture', () => {
    const data = new Uint16Array(1000);
    data.set(ramp(996, 1000));
    data.fill(65535, 996); // 0.4% of the pixels
    expect(autoWindow(data).hi).toBe(1994);
  });

  it('works on uint8 and keeps data that already spans the range close to it', () => {
    const data = Uint8Array.from({ length: 256 * 4 }, (_, i) => i % 256);
    const w = autoWindow(data);
    expect(w.lo).toBeLessThanOrEqual(5);
    expect(w.hi).toBeGreaterThanOrEqual(250);
  });

  it('falls back to the full range of a sparse image instead of a one-value window', () => {
    const data = new Uint16Array(1000);
    data[500] = 900; // 99.9% of the pixels are 0
    expect(autoWindow(data)).toEqual({ lo: 0, hi: 900 });
  });

  it('gives a flat image a one-value-wide window rather than dividing by zero', () => {
    expect(autoWindow(new Uint16Array([7, 7, 7]))).toEqual({ lo: 7, hi: 8 });
    expect(autoWindow(new BigUint64Array([7n, 7n]))).toEqual({ lo: 7, hi: 8 });
  });

  it('copes with an empty plane', () => {
    expect(autoWindow(new Uint16Array(0))).toEqual({ lo: 0, hi: 1 });
  });

  it('bins uint64 values linearly, to within a bin of the exact percentiles', () => {
    const data = BigUint64Array.from({ length: 1000 }, (_, i) => BigInt(i) * 1_000_000n);
    const w = autoWindow(data);
    expect(Math.abs(w.lo - 5_000_000)).toBeLessThan(20_000);
    expect(Math.abs(w.hi - 994_000_000)).toBeLessThan(20_000);
  });

  it('stays finite for uint64 values past 2^53', () => {
    const w = autoWindow(new BigUint64Array([0n, 2n ** 63n, 2n ** 64n - 1n]));
    expect(Number.isFinite(w.lo)).toBe(true);
    expect(Number.isFinite(w.hi)).toBe(true);
    expect(w.hi).toBeGreaterThan(w.lo);
  });
});

describe('windowToGrey', () => {
  const px = (rgba: Uint8ClampedArray) => Array.from(rgba);

  it('maps the window to black..white as opaque grey and clips outside it', () => {
    const out = windowToGrey(new Uint16Array([0, 500, 600, 1000, 5000]), { lo: 500, hi: 1000 });
    expect(px(out)).toEqual([
      0, 0, 0, 255, // below the window
      0, 0, 0, 255, // at lo
      51, 51, 51, 255, // a fifth of the way up: 255 / 5
      255, 255, 255, 255, // at hi
      255, 255, 255, 255, // above the window
    ]);
  });

  it('leaves uint8 data unchanged under the full 0-255 window', () => {
    const data = Uint8Array.from({ length: 256 }, (_, i) => i);
    const out = windowToGrey(data, { lo: 0, hi: 255 });
    expect(Array.from({ length: 256 }, (_, i) => out[i * 4])).toEqual(Array.from(data));
  });

  it('maps uint64 values the same way', () => {
    const out = windowToGrey(new BigUint64Array([0n, 25n, 100n, 400n]), { lo: 0, hi: 100 });
    expect(px(out)).toEqual([0, 0, 0, 255, 64, 64, 64, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  });

  it('makes a window from the data show a low-range 16-bit image with full contrast', () => {
    // Data that only reaches 3,000 of 65,535: a plain 16-to-8-bit shift would make it nearly black.
    const data = Uint16Array.from({ length: 1000 }, (_, i) => Math.round((i / 999) * 3000));
    const grey = windowToGrey(data, autoWindow(data));
    const values = Array.from({ length: 1000 }, (_, i) => grey[i * 4]);
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(255);
    expect(data[999] >> 8).toBeLessThan(12);
  });
});
