/**
 * Basic edge detection for a decoded plane image.
 *
 * Pipeline: RGBA -> grey -> two 3x3 convolutions (gx, gy) -> gradient magnitude -> band -> colour.
 * The kernels and the bands are plain data (see DEFAULT_EDGE_CONFIG) so the UI can edit them. The
 * magnitude step is separate from the band step so that changing bands never repeats the convolution.
 */

/** A 3x3 kernel, row-major. */
export type Kernel3 = readonly [number, number, number, number, number, number, number, number, number];

export type Rgb = readonly [number, number, number];

/**
 * A range of gradient magnitudes and the colour painted for it. Magnitudes are on a 0-255 scale where a
 * full black-to-white step reads as 255 (diagonal edges can read higher). `min` is inclusive, `max` is
 * exclusive, and Infinity means "no upper limit". A `null` colour paints nothing (transparent).
 */
export interface EdgeBand {
  min: number;
  max: number;
  color: Rgb | null;
}

export interface EdgeConfig {
  kernelX: Kernel3;
  kernelY: Kernel3;
  /** Checked in order: when ranges overlap, the first matching band wins. A magnitude no band covers is transparent. */
  bands: readonly EdgeBand[];
}

/** Bands are stored as a level per pixel in a Uint8Array (0 = no band), so there is a hard cap. */
export const MAX_BANDS = 32;

export const SOBEL_X: Kernel3 = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
export const SOBEL_Y: Kernel3 = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
export const PREWITT_X: Kernel3 = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
export const PREWITT_Y: Kernel3 = [-1, -1, -1, 0, 0, 0, 1, 1, 1];
export const SCHARR_X: Kernel3 = [-3, 0, 3, -10, 0, 10, -3, 0, 3];
export const SCHARR_Y: Kernel3 = [-3, -10, -3, 0, 0, 0, 3, 10, 3];

export interface KernelPreset {
  name: string;
  x: Kernel3;
  y: Kernel3;
}

export const KERNEL_PRESETS: readonly KernelPreset[] = [
  { name: 'Sobel', x: SOBEL_X, y: SOBEL_Y },
  { name: 'Prewitt', x: PREWITT_X, y: PREWITT_Y },
  { name: 'Scharr', x: SCHARR_X, y: SCHARR_Y },
];

/** Nothing for weak differences, then dark, medium and bright purple for stronger ones. */
export const DEFAULT_BANDS: readonly EdgeBand[] = [
  { min: 0, max: 16, color: null },
  { min: 16, max: 48, color: [76, 29, 149] },
  { min: 48, max: 96, color: [147, 51, 234] },
  { min: 96, max: Infinity, color: [216, 180, 254] },
];

/** Default: Sobel, where a larger difference in pixel values is a stronger edge. */
export const DEFAULT_EDGE_CONFIG: EdgeConfig = { kernelX: SOBEL_X, kernelY: SOBEL_Y, bands: DEFAULT_BANDS };

/** Colours offered to bands added after the defaults, cycled in order. */
const NEXT_COLORS: readonly Rgb[] = [
  [250, 204, 21],
  [34, 197, 94],
  [56, 189, 248],
  [244, 63, 94],
  [251, 146, 60],
];

/**
 * Adds a band above the strongest one. If the top band is open-ended it is split halfway to 255 and the
 * new band takes the upper half, so the result is visible straight away; otherwise the new band starts
 * where the top one ends and has no upper limit.
 */
export function appendBand(bands: readonly EdgeBand[]): EdgeBand[] {
  if (bands.length >= MAX_BANDS) return [...bands];
  const color = NEXT_COLORS[Math.max(0, bands.length - DEFAULT_BANDS.length) % NEXT_COLORS.length];
  const last = bands.at(-1);
  if (!last) return [{ min: 16, max: Infinity, color }];
  if (last.max === Infinity) {
    const split = last.min < 254 ? Math.round(last.min + (255 - last.min) / 2) : last.min + 16;
    return [...bands.slice(0, -1), { ...last, max: split }, { min: split, max: Infinity, color }];
  }
  return [...bands, { min: last.max, max: Infinity, color }];
}

export function rgbToHex(c: Rgb): string {
  return '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Parses "#rrggbb"; anything else gives null. */
export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** Rec. 601 luma of each RGBA pixel, 0-255. */
export function toGrey(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return grey;
}

/** What a kernel's output is divided by: its larger one-sided weight sum, so a full step reads as 255. */
function kernelScale(k: Kernel3): number {
  let pos = 0;
  let neg = 0;
  for (const w of k) {
    if (w > 0) pos += w;
    else neg -= w;
  }
  return Math.max(pos, neg) || 1;
}

/**
 * Gradient magnitude per pixel: sqrt(gx² + gy²), each term scaled by its kernel (see kernelScale).
 * Pixels past the border reuse the nearest edge pixel.
 */
export function gradientMagnitude(grey: Float32Array, width: number, height: number, kernelX: Kernel3, kernelY: Kernel3): Float32Array {
  const out = new Float32Array(width * height);
  const sx = kernelScale(kernelX);
  const sy = kernelScale(kernelY);
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = kernelX;
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = kernelY;
  for (let y = 0; y < height; y++) {
    const r0 = Math.max(y - 1, 0) * width;
    const r1 = y * width;
    const r2 = Math.min(y + 1, height - 1) * width;
    for (let x = 0; x < width; x++) {
      const xl = Math.max(x - 1, 0);
      const xr = Math.min(x + 1, width - 1);
      const p0 = grey[r0 + xl], p1 = grey[r0 + x], p2 = grey[r0 + xr];
      const p3 = grey[r1 + xl], p4 = grey[r1 + x], p5 = grey[r1 + xr];
      const p6 = grey[r2 + xl], p7 = grey[r2 + x], p8 = grey[r2 + xr];
      const gx = (a0 * p0 + a1 * p1 + a2 * p2 + a3 * p3 + a4 * p4 + a5 * p5 + a6 * p6 + a7 * p7 + a8 * p8) / sx;
      const gy = (b0 * p0 + b1 * p1 + b2 * p2 + b3 * p3 + b4 * p4 + b5 * p5 + b6 * p6 + b7 * p7 + b8 * p8) / sy;
      out[r1 + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/** The 1-based index of the first band containing the magnitude, or 0 when none does. */
export function edgeLevel(magnitude: number, bands: readonly EdgeBand[]): number {
  for (let i = 0; i < bands.length; i++) {
    if (magnitude >= bands[i].min && magnitude < bands[i].max) return i + 1;
  }
  return 0;
}

/** A band level (see edgeLevel) for every magnitude. */
export function bandLevels(magnitudes: Float32Array, bands: readonly EdgeBand[]): Uint8Array {
  const levels = new Uint8Array(magnitudes.length);
  const usable = bands.slice(0, MAX_BANDS);
  for (let i = 0; i < magnitudes.length; i++) levels[i] = edgeLevel(magnitudes[i], usable);
  return levels;
}

/** Gradient magnitudes of an RGBA image. */
export function imageMagnitudes(rgba: Uint8ClampedArray, width: number, height: number, kernelX: Kernel3, kernelY: Kernel3): Float32Array {
  return gradientMagnitude(toGrey(rgba, width, height), width, height, kernelX, kernelY);
}

/** Band levels of an RGBA image in one go. */
export function detectEdges(rgba: Uint8ClampedArray, width: number, height: number, cfg: EdgeConfig = DEFAULT_EDGE_CONFIG): Uint8Array {
  return bandLevels(imageMagnitudes(rgba, width, height, cfg.kernelX, cfg.kernelY), cfg.bands);
}

/** RGBA pixels for band levels: level 0 and transparent bands paint nothing, every other band is its colour at full alpha. */
export function edgesToRgba(levels: Uint8Array, bands: readonly EdgeBand[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(levels.length * 4);
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    const c = l ? bands[l - 1]?.color : null;
    if (!c) continue;
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
