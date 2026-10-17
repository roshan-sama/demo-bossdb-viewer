import { MAX_FFT, Spectrum, fft, fft2d, hannWeights, imageSpectrum, isPow2, magnitudeSpectrum, nextPow2, spectrumToRgba } from './fourier';

/** A w*h grey image whose value is given per pixel. */
function image(w: number, h: number, f: (x: number, y: number) => number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = f(x, y);
  return out;
}

describe('isPow2 / nextPow2', () => {
  it('recognises powers of two', () => {
    expect([1, 2, 4, 1024].every(isPow2)).toBe(true);
    expect([0, 3, 6, 1000, -4, 1.5].some(isPow2)).toBe(false);
  });

  it('rounds up to the next power of two', () => {
    expect([0, 1, 2, 3, 5, 48, 64, 65, 1000].map(nextPow2)).toEqual([1, 1, 2, 4, 8, 64, 64, 128, 1024]);
  });
});

describe('fft', () => {
  it('turns an impulse into a flat spectrum', () => {
    const re = new Float32Array(8);
    const im = new Float32Array(8);
    re[0] = 1;
    fft(re, im);
    for (let i = 0; i < 8; i++) {
      expect(re[i]).toBeCloseTo(1, 5);
      expect(im[i]).toBeCloseTo(0, 5);
    }
  });

  it('puts a cosine at +k and -k', () => {
    const n = 16;
    const re = Float32Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 3 * i) / n));
    const im = new Float32Array(n);
    fft(re, im);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(i === 3 || i === 13 ? n / 2 : 0, 4);
  });

  it('rejects lengths that are not a power of two', () => {
    expect(() => fft(new Float32Array(6), new Float32Array(6))).toThrow(RangeError);
    expect(() => fft(new Float32Array(4), new Float32Array(8))).toThrow(RangeError);
  });
});

describe('fft2d', () => {
  it('turns an impulse into a flat spectrum', () => {
    const re = new Float32Array(8 * 4);
    const im = new Float32Array(8 * 4);
    re[0] = 1;
    fft2d(re, im, 8, 4);
    expect(Array.from(re).every((v) => Math.abs(v - 1) < 1e-5)).toBe(true);
    expect(Array.from(im).every((v) => Math.abs(v) < 1e-5)).toBe(true);
  });

  it('finds a cosine along x in the matching column of the first row', () => {
    const w = 8;
    const h = 4;
    const re = Float32Array.from({ length: w * h }, (_, i) => Math.cos((2 * Math.PI * 2 * (i % w)) / w));
    const im = new Float32Array(w * h);
    fft2d(re, im, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(re[y * w + x]).toBeCloseTo(y === 0 && (x === 2 || x === 6) ? (w * h) / 2 : 0, 3);
      }
    }
  });

  it('rejects sides that are not powers of two or arrays of the wrong size', () => {
    expect(() => fft2d(new Float32Array(12), new Float32Array(12), 3, 4)).toThrow(RangeError);
    expect(() => fft2d(new Float32Array(8), new Float32Array(8), 4, 4)).toThrow(RangeError);
  });
});

describe('hannWeights', () => {
  it('is zero at the ends and one in the middle', () => {
    const w = hannWeights(5);
    expect(Array.from(w).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.5, 1, 0.5, 0]);
    expect(Array.from(hannWeights(1))).toEqual([1]);
  });
});

describe('magnitudeSpectrum', () => {
  const N = 64;
  const k = 5;
  const wave = image(N, N, (x) => 128 + 100 * Math.cos((2 * Math.PI * k * x) / N));

  it('puts a horizontal cosine at the two bins either side of the centre, at half its amplitude', () => {
    const sp = magnitudeSpectrum(wave, N, N, false);
    expect([sp.width, sp.height]).toEqual([N, N]);
    const c = N / 2;
    expect(sp.magnitude[c * N + c + k]).toBeCloseTo(50, 0);
    expect(sp.magnitude[c * N + c - k]).toBeCloseTo(50, 0);
    // The mean is removed, so there is nothing at zero frequency.
    expect(sp.magnitude[c * N + c]).toBeCloseTo(0, 1);
  });

  it('gives an all-zero spectrum for a flat image', () => {
    const sp = magnitudeSpectrum(image(16, 16, () => 200), 16, 16);
    expect(Array.from(sp.magnitude).every((v) => v < 1e-4)).toBe(true);
  });

  it('pads each side to its own power of two and reports that nothing was cropped', () => {
    const sp = magnitudeSpectrum(image(48, 20, (x, y) => x + y), 48, 20);
    expect([sp.width, sp.height, sp.magnitude.length]).toEqual([64, 32, 64 * 32]);
    expect([sp.cropWidth, sp.cropHeight, sp.cropped]).toEqual([48, 20, false]);
  });

  it('analyses only the centre of a plane larger than MAX_FFT', () => {
    const w = MAX_FFT + 76;
    const sp = magnitudeSpectrum(new Float32Array(w * 10), w, 10);
    expect([sp.width, sp.height]).toEqual([MAX_FFT, 16]);
    expect([sp.cropWidth, sp.cropHeight, sp.cropped]).toEqual([MAX_FFT, 10, true]);
  });

  it('leaks far less away from the peak with the Hann window than without it', () => {
    // 5.5 cycles do not fit the width evenly, so a plain transform smears the peak across the spectrum.
    const smeared = image(N, N, (x) => 128 + 100 * Math.cos((2 * Math.PI * 5.5 * x) / N));
    const far = (sp: Spectrum) => sp.magnitude[(N / 2) * N + N / 2 + 20];
    expect(far(magnitudeSpectrum(smeared, N, N, true))).toBeLessThan(far(magnitudeSpectrum(smeared, N, N, false)) / 5);
  });

  it('reads RGBA images through their grey value', () => {
    const rgba = new Uint8ClampedArray(N * N * 4);
    for (let i = 0; i < N * N; i++) rgba.set([255, 255, 255, 255], i * 4);
    const sp = imageSpectrum(rgba, N, N);
    expect(Array.from(sp.magnitude).every((v) => v < 1e-3)).toBe(true);
  });
});

describe('spectrumToRgba', () => {
  const spec = (magnitude: number[]): Spectrum => ({ width: 2, height: 2, magnitude: Float32Array.from(magnitude), cropWidth: 2, cropHeight: 2, cropped: false });

  it('scales the strongest component to white on a linear scale', () => {
    const out = spectrumToRgba(spec([0, 1, 3, 0]), false);
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 85, 85, 85, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  });

  it('lifts weak components on the log scale', () => {
    const lin = spectrumToRgba(spec([0, 1, 3, 0]), false);
    const log = spectrumToRgba(spec([0, 1, 3, 0]), true);
    expect(log[8]).toBe(255);
    expect(log[4]).toBeGreaterThanOrEqual(127);
    expect(log[4]).toBeLessThanOrEqual(128);
    expect(log[4]).toBeGreaterThan(lin[4]);
  });

  it('paints a zero spectrum black but opaque', () => {
    const out = spectrumToRgba(spec([0, 0, 0, 0]));
    expect(Array.from(out)).toEqual(Array.from({ length: 16 }, (_, i) => (i % 4 === 3 ? 255 : 0)));
  });
});
