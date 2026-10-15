import { voxelRange, voxelSize } from './format';

describe('format helpers', () => {
  it('formats a voxel range with its length', () => {
    expect(voxelRange(0, 4096)).toBe('0 – 4,096 (4,096 voxels)');
  });

  it('returns null for missing bounds', () => {
    expect(voxelRange(undefined, 10)).toBeNull();
  });

  it('formats voxel size with its unit', () => {
    const c = { x_voxel_size: 4, y_voxel_size: 4, z_voxel_size: 40, voxel_unit: 'nanometers' } as never;
    expect(voxelSize(c)).toBe('4 × 4 × 40 nanometers');
  });
});
