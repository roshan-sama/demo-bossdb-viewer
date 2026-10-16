import { Range, Region, centeredWindow } from '../boss/cutout';
import { Stack } from './plane-pixels';

/** A uint8 volume in C order: index = (z * height + y) * width + x. */
export interface Volume {
  data: Uint8Array<ArrayBuffer>;
  width: number; // X
  height: number; // Y
  depth: number; // Z
}

export type Dims = [number, number, number];

const len = (r: Range) => r[1] - r[0];

/**
 * Boss JPEG stacks are row = z * Y + y, X wide: already a C-order (z, y, x) array. Joining the
 * z-chunks and keeping one channel (the JPEG is grayscale, so R = G = B) yields the volume.
 */
export function stacksToVolume(stacks: Stack[], region: Region): Volume {
  const [X, Y, Z] = [len(region.x), len(region.y), len(region.z)];
  const total = stacks.reduce((n, s) => n + s.width * s.height, 0);
  if (stacks.some((s) => s.width !== X) || total !== X * Y * Z) {
    throw new Error(`Unexpected image size for a ${X}×${Y}×${Z} region (${total} pixels returned)`);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const s of stacks) {
    const px = s.width * s.height;
    for (let i = 0; i < px; i++) data[offset + i] = s.rgba[i * 4];
    offset += px;
  }
  return { data, width: X, height: Y, depth: Z };
}

/** A block of at most `dims` voxels centred in the extent (smaller where the extent is smaller). */
export function volumeRegion(extent: Region, dims: Dims): Region {
  return { x: centeredWindow(extent.x, dims[0]), y: centeredWindow(extent.y, dims[1]), z: centeredWindow(extent.z, dims[2]) };
}

/** Physical box proportions for the voxel grid, scaled so the longest side is 1. */
export function physicalSize(dims: Dims, voxel: Dims): Dims {
  const s = dims.map((d, i) => d * (voxel[i] || 1)) as Dims;
  const longest = Math.max(...s);
  return s.map((v) => v / longest) as Dims;
}
