/**
 * Basic edge detection for a decoded plane image.
 *
 * Pipeline: RGBA -> grey -> 3x3 convolution (gx, gy) -> gradient magnitude -> level 0..3 -> purple RGBA.
 * The kernel and the level bands are hardcoded in DEFAULT_EDGE_CONFIG; the functions take the config as a
 * parameter so the kernel and bands can be exposed in the UI later without touching the pipeline.
 */

/** A 3x3 kernel, row-major. */
export type Kernel3 = readonly [number, number, number, number, number, number, number, number, number];

/** Output level: 0 is "no edge" (transparent), 1..3 are increasing edge strength. */
export type EdgeLevel = 0 | 1 | 2 | 3;

export interface EdgeBand {
  /** Smallest magnitude (inclusive) that produces this level. */
  min: number;
  /** Magnitude (exclusive) at which this level stops applying; Infinity is the plain "bigger is stronger" default. */
  max: number;
}

export interface EdgeConfig {
  kernelX: Kernel3;
  kernelY: Kernel3;
  /**
   * Bands for levels 1, 2 and 3, on a 0-255 magnitude scale (a full black-to-white step reads as 255).
   * A magnitude outside every band yields level 0, so a band-pass is just bands that stop short of Infinity.
   */
  bands: readonly [EdgeBand, EdgeBand, EdgeBand];
}

export const SOBEL_X: Kernel3 = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
export const SOBEL_Y: Kernel3 = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

/** Default: Sobel, where a larger difference in pixel values is a stronger edge. */
export const DEFAULT_EDGE_CONFIG: EdgeConfig = {
  kernelX: SOBEL_X,
  kernelY: SOBEL_Y,
  bands: [
    { min: 16, max: 48 },
    { min: 48, max: 96 },
    { min: 96, max: Infinity },
  ],
};

/** Dark, medium and bright purple for levels 1, 2 and 3. Level 0 stays fully transparent. */
export const EDGE_PALETTE: readonly [number, number, number][] = [
  [76, 29, 149],
  [147, 51, 234],
  [216, 180, 254],
];

/** Rec. 601 luma of each RGBA pixel, 0-255. */
export function toGrey(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return grey;
}

/**
 * Gradient magnitude per pixel, scaled so a full-range step across a pixel pair reads as 255 regardless
 * of kernel weights. Pixels past the border reuse the nearest edge pixel.
 */
export function gradientMagnitude(grey: Float32Array, width: number, height: number, cfg: EdgeConfig = DEFAULT_EDGE_CONFIG): Float32Array {
  const out = new Float32Array(width * height);
  const norm = (k: Kernel3) => k.reduce((s, w) => s + Math.max(w, 0), 0) || 1;
  const nx = norm(cfg.kernelX);
  const ny = norm(cfg.kernelY);
  for (let y = 0; y < height; y++) {
    const rows = [Math.max(y - 1, 0), y, Math.min(y + 1, height - 1)];
    for (let x = 0; x < width; x++) {
      const cols = [Math.max(x - 1, 0), x, Math.min(x + 1, width - 1)];
      let gx = 0;
      let gy = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const v = grey[rows[r] * width + cols[c]];
          gx += cfg.kernelX[r * 3 + c] * v;
          gy += cfg.kernelY[r * 3 + c] * v;
        }
      }
      out[y * width + x] = Math.hypot(gx / nx, gy / ny);
    }
  }
  return out;
}

/** Maps one magnitude to a level using the first band that contains it. */
export function edgeLevel(magnitude: number, bands: EdgeConfig['bands'] = DEFAULT_EDGE_CONFIG.bands): EdgeLevel {
  for (let i = 0; i < bands.length; i++) {
    if (magnitude >= bands[i].min && magnitude < bands[i].max) return (i + 1) as EdgeLevel;
  }
  return 0;
}

/** Levels 0-3 for every pixel of an RGBA image. */
export function detectEdges(rgba: Uint8ClampedArray, width: number, height: number, cfg: EdgeConfig = DEFAULT_EDGE_CONFIG): Uint8Array {
  const mag = gradientMagnitude(toGrey(rgba, width, height), width, height, cfg);
  const levels = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) levels[i] = edgeLevel(mag[i], cfg.bands);
  return levels;
}

/** RGBA pixels for an edge map: level 0 is transparent, levels 1-3 are dark to bright purple at full alpha. */
export function edgesToRgba(levels: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(levels.length * 4);
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    if (!l) continue;
    const c = EDGE_PALETTE[l - 1];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
