import { CoordFrame } from '../boss/boss.models';

const n = (v: number) => v.toLocaleString('en-US');

/** "0 – 4,096 (4,096 voxels)", or null when either end is missing. */
export function voxelRange(start?: number, stop?: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return null;
  return `${n(start!)} – ${n(stop!)} (${n(stop! - start!)} voxels)`;
}

/** "4 × 4 × 40 nanometers", or null when voxel sizes are missing. */
export function voxelSize(c: CoordFrame): string | null {
  if (!Number.isFinite(c.x_voxel_size)) return null;
  return `${[c.x_voxel_size, c.y_voxel_size, c.z_voxel_size].join(' × ')} ${c.voxel_unit ?? ''}`.trim();
}
