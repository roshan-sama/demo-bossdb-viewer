import { Range, Region } from '../boss/cutout';

/** A decoded Boss JPEG: RGBA pixels, X wide and (Y * Zchunk) tall. */
export interface Stack {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  bytes: number;
}

export interface PlanePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

const len = (r: Range) => r[1] - r[0];

/**
 * Joins the stacks for consecutive z-chunks (top to bottom) into one plane image.
 *
 * Stack rows are ordered r = z * Y + y. For a YZ plane (X = 1) the column of Y * Z pixels is
 * already laid out like a Y-wide, Z-tall image, so no pixels move; only the dimensions change.
 * XY (Z = 1) and XZ (Y = 1) stacks are ordinary images and pass through unchanged.
 */
export function joinStacks(stacks: Stack[], region: Region): PlanePixels {
  const width = stacks[0].width;
  const height = stacks.reduce((n, s) => n + s.height, 0);
  const data = new Uint8ClampedArray(width * height * 4);
  let offset = 0;
  for (const s of stacks) {
    data.set(s.rgba, offset);
    offset += s.rgba.length;
  }
  const Y = len(region.y);
  const Z = len(region.z);
  return len(region.x) === 1 && Y * Z === height ? { width: Y, height: Z, data } : { width, height, data };
}
