import { Region } from '../boss/cutout';
import { estimateLevel, levelScales, parseDownsample } from './levels';

const base: Region = { x: [0, 1000], y: [0, 801], z: [10, 110] };

describe('levels', () => {
  it('estimates anisotropic and isotropic levels', () => {
    expect(estimateLevel(base, 'anisotropic', 2)).toEqual({ x: [0, 250], y: [0, 201], z: [10, 110] });
    expect(estimateLevel(base, 'isotropic', 1)).toEqual({ x: [0, 500], y: [0, 401], z: [5, 55] });
    expect(estimateLevel(base, undefined, 0)).toEqual(base);
  });

  it('reads per-level extents from a downsample response', () => {
    const json = { extent: { '0': [1000, 801, 110], '1': [500, 401, 110], '2': [250, 201, 55] } };
    const r = parseDownsample(json, base, 3);
    expect(r?.[1]).toEqual({ x: [0, 500], y: [0, 401], z: [10, 110] });
    expect(r?.[2].z).toEqual([5, 55]);
  });

  it('returns null for unexpected shapes or missing levels', () => {
    expect(parseDownsample({}, base, 2)).toBeNull();
    expect(parseDownsample({ extent: { '0': [1, 1, 1] } }, base, 2)).toBeNull();
    expect(parseDownsample({ extent: { '0': [1, 'x', 1] } }, base, 1)).toBeNull();
    expect(parseDownsample(null, base, 1)).toBeNull();
  });

  it('derives voxel scale factors per axis', () => {
    expect(levelScales(base, estimateLevel(base, 'anisotropic', 2))).toEqual([4, 4, 1]);
    expect(levelScales(base, estimateLevel(base, 'isotropic', 1))).toEqual([2, 2, 2]);
  });
});
