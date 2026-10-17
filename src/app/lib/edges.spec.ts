import {
  DEFAULT_BANDS,
  DEFAULT_EDGE_CONFIG,
  EdgeBand,
  KERNEL_PRESETS,
  MAX_BANDS,
  SOBEL_X,
  SOBEL_Y,
  appendBand,
  bandLevels,
  detectEdges,
  edgeLevel,
  edgesToRgba,
  gradientMagnitude,
  hexToRgb,
  rgbToHex,
  toGrey,
} from './edges';

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

const magnitude = (rgba: Uint8ClampedArray, w: number, h: number, kx = SOBEL_X, ky = SOBEL_Y) =>
  gradientMagnitude(toGrey(rgba, w, h), w, h, kx, ky);

describe('edges', () => {
  it('converts RGBA to luma', () => {
    const g = toGrey(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(g[0]).toBeCloseTo(255, 3);
    expect(g[1]).toBe(0);
  });

  it('finds no gradient in a flat image, border included', () => {
    const mag = magnitude(grey(6, 6, () => 120), 6, 6);
    expect(Array.from(mag).every((m) => m === 0)).toBe(true);
  });

  it('reads a full black-to-white step as magnitude 255 next to the step and 0 away from it', () => {
    const w = 8;
    const mag = magnitude(grey(w, 5, (x) => (x < 4 ? 0 : 255)), w, 5);
    expect(mag[2 * w + 3]).toBeCloseTo(255, 3);
    expect(mag[2 * w + 4]).toBeCloseTo(255, 3);
    expect(mag[2 * w + 1]).toBe(0);
    expect(mag[2 * w + 6]).toBe(0);
  });

  it('reads a full step as 255 for every preset, whatever its weights', () => {
    for (const p of KERNEL_PRESETS) {
      const mag = magnitude(grey(8, 5, (x) => (x < 4 ? 0 : 255)), 8, 5, p.x, p.y);
      expect(mag[2 * 8 + 4], p.name).toBeCloseTo(255, 3);
    }
  });

  it('follows an edited kernel: a zeroed kernel finds nothing, a flipped one finds the same edge', () => {
    const img = grey(8, 5, (x) => (x < 4 ? 0 : 255));
    const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0] as const;
    expect(Array.from(magnitude(img, 8, 5, zeros, zeros)).every((m) => m === 0)).toBe(true);
    const flipped = SOBEL_X.map((v) => -v) as unknown as typeof SOBEL_X;
    expect(magnitude(img, 8, 5, flipped, zeros)[2 * 8 + 4]).toBeCloseTo(255, 3);
    // Only the x kernel is active, so a horizontal edge is invisible to it.
    const horizontal = grey(5, 8, (_, y) => (y < 4 ? 0 : 255));
    expect(magnitude(horizontal, 5, 8, SOBEL_X, zeros)[3 * 5 + 2]).toBe(0);
    expect(magnitude(horizontal, 5, 8, SOBEL_X, SOBEL_Y)[3 * 5 + 2]).toBeCloseTo(255, 3);
  });

  describe('bands', () => {
    it('maps magnitudes to the 1-based index of the first band that contains them', () => {
      expect(edgeLevel(0, DEFAULT_BANDS)).toBe(1);
      expect(edgeLevel(15.9, DEFAULT_BANDS)).toBe(1);
      expect(edgeLevel(16, DEFAULT_BANDS)).toBe(2);
      expect(edgeLevel(60, DEFAULT_BANDS)).toBe(3);
      expect(edgeLevel(1e9, DEFAULT_BANDS)).toBe(4);
    });

    it('gives level 0 outside every band, so a band-pass leaves the rest transparent', () => {
      const bands: EdgeBand[] = [{ min: 40, max: 60, color: [1, 2, 3] }];
      expect(edgeLevel(30, bands)).toBe(0);
      expect(edgeLevel(40, bands)).toBe(1);
      expect(edgeLevel(60, bands)).toBe(0);
    });

    it('lets the first band win where ranges overlap', () => {
      const bands: EdgeBand[] = [
        { min: 0, max: 100, color: [1, 1, 1] },
        { min: 50, max: 150, color: [2, 2, 2] },
      ];
      expect(edgeLevel(75, bands)).toBe(1);
      expect(edgeLevel(120, bands)).toBe(2);
    });

    it('detects stronger steps as higher default bands', () => {
      const level = (step: number) => detectEdges(grey(8, 5, (x) => (x < 4 ? 100 : 100 + step)), 8, 5)[2 * 8 + 4];
      expect(level(5)).toBe(1); // the transparent band
      expect(level(30)).toBe(2);
      expect(level(70)).toBe(3);
      expect(level(200)).toBe(4);
    });

    it('re-bands cached magnitudes without needing the image again', () => {
      const mag = new Float32Array([5, 30, 70, 200]);
      expect(Array.from(bandLevels(mag, DEFAULT_BANDS))).toEqual([1, 2, 3, 4]);
      const two: EdgeBand[] = [{ min: 0, max: 50, color: null }, { min: 50, max: Infinity, color: [9, 9, 9] }];
      expect(Array.from(bandLevels(mag, two))).toEqual([1, 1, 2, 2]);
    });
  });

  describe('painting', () => {
    it('paints transparent bands and uncovered magnitudes as nothing, other bands as their colour', () => {
      const px = Array.from(edgesToRgba(new Uint8Array([0, 1, 2, 3, 4]), DEFAULT_BANDS));
      expect(px).toEqual([
        0, 0, 0, 0, // level 0: no band
        0, 0, 0, 0, // band 1 is transparent
        76, 29, 149, 255,
        147, 51, 234, 255,
        216, 180, 254, 255,
      ]);
    });

    it('uses the colour a person picked', () => {
      const bands: EdgeBand[] = [{ min: 0, max: Infinity, color: [10, 200, 30] }];
      expect(Array.from(edgesToRgba(new Uint8Array([1]), bands))).toEqual([10, 200, 30, 255]);
    });

    it('ignores a level with no band (bands shrank after the levels were made)', () => {
      expect(Array.from(edgesToRgba(new Uint8Array([3]), DEFAULT_BANDS.slice(0, 1)))).toEqual([0, 0, 0, 0]);
    });

    it('keeps the default purples dark to bright', () => {
      const luma = DEFAULT_BANDS.slice(1).map((b) => b.color!.reduce((s, v) => s + v, 0));
      expect(luma[0]).toBeLessThan(luma[1]);
      expect(luma[1]).toBeLessThan(luma[2]);
    });
  });

  describe('appendBand', () => {
    it('splits an open-ended top band so the new one is visible straight away', () => {
      const next = appendBand(DEFAULT_BANDS);
      expect(next).toHaveLength(5);
      expect(next[3]).toEqual({ min: 96, max: 176, color: DEFAULT_BANDS[3].color });
      expect(next[4].min).toBe(176);
      expect(next[4].max).toBe(Infinity);
      expect(next[4].color).not.toBeNull();
    });

    it('starts after a bounded top band', () => {
      const next = appendBand([{ min: 0, max: 40, color: [1, 1, 1] }]);
      expect(next[1]).toMatchObject({ min: 40, max: Infinity });
    });

    it('gives each added band a different colour and stops at the cap', () => {
      let bands: EdgeBand[] = [...DEFAULT_BANDS];
      for (let i = 0; i < 3; i++) bands = appendBand(bands);
      const colours = bands.slice(3).map((b) => b.color!.join());
      expect(new Set(colours).size).toBe(colours.length);
      for (let i = 0; i < MAX_BANDS + 5; i++) bands = appendBand(bands);
      expect(bands.length).toBe(MAX_BANDS);
    });

    it('copes with an empty list and a top band that starts at the ceiling', () => {
      expect(appendBand([])).toHaveLength(1);
      const next = appendBand([{ min: 254, max: Infinity, color: null }]);
      expect(next[0].max).toBeGreaterThan(254);
      expect(next[1].min).toBe(next[0].max);
    });
  });

  it('round-trips colours through hex and rejects malformed hex', () => {
    expect(rgbToHex([76, 29, 149])).toBe('#4c1d95');
    expect(hexToRgb('#4C1D95')).toEqual([76, 29, 149]);
    expect(hexToRgb('purple')).toBeNull();
    expect(hexToRgb('#abc')).toBeNull();
  });

  it('exposes Sobel with the default bands as the default config', () => {
    expect(DEFAULT_EDGE_CONFIG.kernelX).toBe(SOBEL_X);
    expect(DEFAULT_EDGE_CONFIG.bands).toBe(DEFAULT_BANDS);
  });
});
