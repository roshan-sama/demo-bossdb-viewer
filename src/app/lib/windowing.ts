import { VoxelArray } from './blosc';

/** The voxel values shown as black (`lo`) and white (`hi`); everything between is grey, everything outside is clipped. */
export interface IntensityWindow {
  lo: number;
  hi: number;
}

/** The automatic window lets this fraction of the darkest and of the brightest pixels clip, so a few outliers cannot flatten the picture. */
export const AUTO_CLIP = 0.005;

const BINS = 65536;

/**
 * Finds the window from a histogram: the value where `low` of the pixels lie below, and the value where `high` do.
 * Bin `b` stands for the value `offset + b * step`. When that window is empty (a sparse image whose pixels are almost
 * all one value), the full range of values present is used, and a flat image gets a one-value-wide window.
 */
function windowFromHistogram(hist: Uint32Array, n: number, low: number, high: number, offset: number, step: number): IntensityWindow {
  let first = -1;
  let last = -1;
  let lo = -1;
  let hi = -1;
  let seen = 0;
  for (let b = 0; b < hist.length; b++) {
    if (!hist[b]) continue;
    if (first < 0) first = b;
    last = b;
    seen += hist[b];
    if (lo < 0 && seen > n * low) lo = b;
    if (hi < 0 && seen >= n * high) hi = b;
  }
  if (hi <= lo) {
    lo = first;
    hi = last;
  }
  if (hi <= lo) hi = lo + 1;
  return { lo: offset + lo * step, hi: offset + hi * step };
}

/**
 * A window for a plane of voxels. uint8 and uint16 get an exact histogram; uint64 values are binned linearly between
 * the smallest and largest value, since an exact histogram of that range is not practical (and values past 2^53 are
 * only approximate, which is fine for display).
 */
export function autoWindow(data: VoxelArray, clip = AUTO_CLIP): IntensityWindow {
  const n = data.length;
  if (!n) return { lo: 0, hi: 1 };
  const low = clip;
  const high = 1 - clip;

  if (!(data instanceof BigUint64Array)) {
    const hist = new Uint32Array(data instanceof Uint8Array ? 256 : BINS);
    for (let i = 0; i < n; i++) hist[data[i]]++;
    return windowFromHistogram(hist, n, low, high, 0, 1);
  }

  const values = Float64Array.from(data, (v) => Number(v));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  if (max <= min) return { lo: min, hi: min + 1 };
  const step = (max - min) / BINS;
  const hist = new Uint32Array(BINS);
  for (let i = 0; i < n; i++) hist[Math.min(BINS - 1, Math.floor((values[i] - min) / step))]++;
  return windowFromHistogram(hist, n, low, high, min, step);
}

/** Opaque grey RGBA for a plane of voxels: `window.lo` and below is black, `window.hi` and above is white. */
export function windowToGrey(data: VoxelArray, window: IntensityWindow): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data.length * 4);
  const scale = 255 / (window.hi - window.lo);

  if (data instanceof BigUint64Array) {
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      out[j] = out[j + 1] = out[j + 2] = (Number(data[i]) - window.lo) * scale;
      out[j + 3] = 255;
    }
    return out;
  }

  // The grey for a value depends only on the value, and there are at most 65,536 of those, so look it up.
  const lut = new Uint8ClampedArray(data instanceof Uint8Array ? 256 : BINS);
  for (let v = 0; v < lut.length; v++) lut[v] = (v - window.lo) * scale;
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = lut[data[i]];
    out[j + 3] = 255;
  }
  return out;
}

/** How the window is chosen: from the plane's own spread, from every value in it, or by hand. */
export type WindowMode = 'auto' | 'full' | 'manual';

/** What a plane of voxels holds: its smallest and largest value, and the automatic window. */
export interface PlaneStats {
  min: number;
  max: number;
  auto: IntensityWindow;
}

export function planeStats(data: VoxelArray): PlaneStats {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = Number(data[i]);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!data.length) min = max = 0;
  return { min, max, auto: autoWindow(data) };
}

/** The largest value a datatype can hold (uint64 is approximate, as Number cannot be exact there). */
export function datatypeLimit(datatype: string): number {
  return datatype === 'uint8' ? 255 : datatype === 'uint16' ? 65535 : 2 ** 64 - 1;
}

/**
 * The window for a mode. `full` shows every value in the plane, so nothing clips; `manual` is whatever was typed,
 * kept at least one value wide so the grey scale never divides by zero.
 */
export function resolveWindow(mode: WindowMode, stats: PlaneStats, manual: IntensityWindow): IntensityWindow {
  if (mode === 'auto') return stats.auto;
  if (mode === 'full') return { lo: stats.min, hi: stats.max > stats.min ? stats.max : stats.min + 1 };
  return { lo: manual.lo, hi: manual.hi > manual.lo ? manual.hi : manual.lo + 1 };
}
