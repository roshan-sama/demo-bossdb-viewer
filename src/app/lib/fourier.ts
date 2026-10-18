/**
 * Fourier analysis for a decoded plane image.
 *
 * Pipeline: RGBA -> grey -> centre crop -> remove the mean -> optional Hann window -> zero-pad each side to a
 * power of two -> 2D FFT -> magnitude -> shift so zero frequency sits in the middle -> grey pixels.
 * The transform is separate from the painting step so that switching between log and linear never repeats it.
 */
import { toGrey } from './edges';

/** Larger planes are analysed on their central MAX_FFT x MAX_FFT part, which keeps the transform quick. */
export const MAX_FFT = 1024;

export function isPow2(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** The smallest power of two that is at least `n` (and at least 1). */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

interface Twiddles {
  cos: Float64Array;
  sin: Float64Array;
}

const twiddleCache = new Map<number, Twiddles>();

/** cos and sin of 2πk/n for k < n/2, kept per size so repeated transforms of one size share them. */
function twiddles(n: number): Twiddles {
  let t = twiddleCache.get(n);
  if (!t) {
    const half = Math.max(1, n >> 1);
    t = { cos: new Float64Array(half), sin: new Float64Array(half) };
    for (let k = 0; k < half; k++) {
      t.cos[k] = Math.cos((2 * Math.PI * k) / n);
      t.sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
    twiddleCache.set(n, t);
  }
  return t;
}

/** In-place forward FFT (e^(-2πikn/N)) of `re` + i·`im`; the length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (!isPow2(n) || im.length !== n) throw new RangeError('fft needs two arrays of the same power-of-two length');
  const { cos, sin } = twiddles(n);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = -sin[k * step];
        const a = i + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** In-place forward 2D FFT of a row-major `width` x `height` array; both sides must be powers of two. */
export function fft2d(re: Float32Array, im: Float32Array, width: number, height: number): void {
  if (!isPow2(width) || !isPow2(height) || re.length !== width * height || im.length !== width * height) {
    throw new RangeError('fft2d needs power-of-two sides and arrays of width * height values');
  }
  for (let y = 0; y < height; y++) {
    fft(re.subarray(y * width, (y + 1) * width), im.subarray(y * width, (y + 1) * width));
  }
  const cr = new Float32Array(height);
  const ci = new Float32Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      cr[y] = re[y * width + x];
      ci[y] = im[y * width + x];
    }
    fft(cr, ci);
    for (let y = 0; y < height; y++) {
      re[y * width + x] = cr[y];
      im[y * width + x] = ci[y];
    }
  }
}

/** Hann weights for `n` samples: 0 at both ends, 1 in the middle. One sample gets weight 1. */
export function hannWeights(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = n === 1 ? 1 : 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

export interface Spectrum {
  /** Side lengths of the transform (powers of two) and of `magnitude`. */
  width: number;
  height: number;
  /** Row-major, zero frequency at (width / 2, height / 2). Each value is the amplitude averaged over the analysed pixels. */
  magnitude: Float32Array;
  /** The part of the image that was analysed: all of it, or its centre when it was larger than MAX_FFT. */
  cropWidth: number;
  cropHeight: number;
  cropped: boolean;
}

/**
 * The magnitude spectrum of a grey image. The mean is removed first so the zero-frequency spike does not
 * swamp everything else, and `hann` fades the edges to zero so the image border does not leave a bright
 * cross through the middle of the spectrum.
 */
export function magnitudeSpectrum(grey: Float32Array, width: number, height: number, hann = true): Spectrum {
  const cw = Math.min(width, MAX_FFT);
  const ch = Math.min(height, MAX_FFT);
  const x0 = (width - cw) >> 1;
  const y0 = (height - ch) >> 1;

  let sum = 0;
  for (let y = 0; y < ch; y++) {
    const row = (y0 + y) * width + x0;
    for (let x = 0; x < cw; x++) sum += grey[row + x];
  }
  const mean = cw * ch > 0 ? sum / (cw * ch) : 0;

  const W = nextPow2(cw);
  const H = nextPow2(ch);
  const re = new Float32Array(W * H);
  const im = new Float32Array(W * H);
  const wx = hann ? hannWeights(cw) : null;
  const wy = hann ? hannWeights(ch) : null;
  for (let y = 0; y < ch; y++) {
    const row = (y0 + y) * width + x0;
    const wyy = wy ? wy[y] : 1;
    for (let x = 0; x < cw; x++) re[y * W + x] = (grey[row + x] - mean) * (wx ? wx[x] : 1) * wyy;
  }

  fft2d(re, im, W, H);

  const magnitude = new Float32Array(W * H);
  const scale = cw * ch > 0 ? 1 / (cw * ch) : 1;
  const hx = W >> 1;
  const hy = H >> 1;
  for (let y = 0; y < H; y++) {
    const ty = (y + hy) % H;
    for (let x = 0; x < W; x++) {
      magnitude[ty * W + ((x + hx) % W)] = Math.hypot(re[y * W + x], im[y * W + x]) * scale;
    }
  }
  return { width: W, height: H, magnitude, cropWidth: cw, cropHeight: ch, cropped: cw !== width || ch !== height };
}

/** The magnitude spectrum of an RGBA image (see magnitudeSpectrum). */
export function imageSpectrum(rgba: Uint8ClampedArray, width: number, height: number, hann = true): Spectrum {
  return magnitudeSpectrum(toGrey(rgba, width, height), width, height, hann);
}

/**
 * Grey RGBA pixels for a spectrum, scaled so the strongest component is white. The log scale (log(1 + m))
 * keeps the faint high frequencies visible next to the strong low ones.
 */
export function spectrumToRgba(spec: Spectrum, log = true): Uint8ClampedArray<ArrayBuffer> {
  const m = spec.magnitude;
  const f = log ? Math.log1p : (v: number) => v;
  let max = 0;
  for (let i = 0; i < m.length; i++) max = Math.max(max, f(m[i]));
  const out = new Uint8ClampedArray(m.length * 4);
  for (let i = 0; i < m.length; i++) {
    const v = max > 0 ? (f(m[i]) / max) * 255 : 0;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
