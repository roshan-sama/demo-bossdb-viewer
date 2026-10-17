import { DEFAULT_EDGE_CONFIG, EDGE_PALETTE, detectEdges, edgeLevel, edgesToRgba, gradientMagnitude, toGrey } from './edges';

/** A w*h RGBA image whose grey value is given per pixel. */
function grey(w: number, h: number, f: (x: number, y: number) => number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      out.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return out;
}

describe('edges', () => {
  it('converts RGBA to luma', () => {
    const g = toGrey(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(g[0]).toBeCloseTo(255, 3);
    expect(g[1]).toBe(0);
  });

  it('finds no edges in a flat image', () => {
    const levels = detectEdges(grey(6, 6, () => 120), 6, 6);
    expect(Array.from(levels).every((l) => l === 0)).toBe(true);
  });

  it('reads a full black-to-white step as magnitude 255 next to the step and 0 away from it', () => {
    const w = 8;
    const mag = gradientMagnitude(toGrey(grey(w, 5, (x) => (x < 4 ? 0 : 255)), w, 5), w, 5);
    expect(mag[2 * w + 3]).toBeCloseTo(255, 3);
    expect(mag[2 * w + 4]).toBeCloseTo(255, 3);
    expect(mag[2 * w + 1]).toBe(0);
    expect(mag[2 * w + 6]).toBe(0);
  });

  it('gives a stronger step a higher level than a weaker one', () => {
    const level = (step: number) => detectEdges(grey(8, 5, (x) => (x < 4 ? 100 : 100 + step)), 8, 5)[2 * 8 + 4];
    expect(level(5)).toBe(0);
    expect(level(30)).toBe(1);
    expect(level(70)).toBe(2);
    expect(level(200)).toBe(3);
  });

  it('detects horizontal edges as well as vertical ones', () => {
    const levels = detectEdges(grey(5, 8, (_, y) => (y < 4 ? 0 : 255)), 5, 8);
    expect(levels[3 * 5 + 2]).toBe(3);
    expect(levels[0]).toBe(0);
  });

  it('treats the border as clamped, so a uniform edge row does not light up', () => {
    const levels = detectEdges(grey(4, 4, () => 200), 4, 4);
    expect(Array.from(levels)).toEqual(new Array(16).fill(0));
  });

  it('supports a band-pass: magnitudes outside every band give level 0', () => {
    const bands = [{ min: 40, max: 60 }, { min: 60, max: 80 }, { min: 80, max: 90 }] as const;
    expect(edgeLevel(30, bands)).toBe(0);
    expect(edgeLevel(40, bands)).toBe(1);
    expect(edgeLevel(60, bands)).toBe(2);
    expect(edgeLevel(85, bands)).toBe(3);
    expect(edgeLevel(200, bands)).toBe(0);
    expect(edgeLevel(1e9, DEFAULT_EDGE_CONFIG.bands)).toBe(3);
  });

  it('paints level 0 transparent and levels 1-3 in dark to bright purple', () => {
    const px = Array.from(edgesToRgba(new Uint8Array([0, 1, 2, 3])));
    expect(px).toEqual([0, 0, 0, 0, ...EDGE_PALETTE[0], 255, ...EDGE_PALETTE[1], 255, ...EDGE_PALETTE[2], 255]);
    const luma = EDGE_PALETTE.map(([r, g, b]) => r + g + b);
    expect(luma[0]).toBeLessThan(luma[1]);
    expect(luma[1]).toBeLessThan(luma[2]);
  });
});
