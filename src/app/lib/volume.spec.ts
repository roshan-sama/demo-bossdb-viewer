import { physicalSize, stacksToVolume, volumeRegion } from './volume';
import { Stack } from './plane-pixels';

function stack(width: number, height: number, red: (i: number) => number): Stack {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba[i * 4] = red(i);
  return { rgba, width, height, bytes: 0 };
}

describe('stacksToVolume', () => {
  it('lays chunks out as a C-order (z, y, x) array using the red channel', () => {
    // X=2, Y=3, Z=3 delivered as two chunks: z 0-1 and z 2. Pixel value = z * 10 + y.
    const region = { x: [0, 2], y: [0, 3], z: [0, 3] } as never;
    const row = (zStart: number) => (i: number) => (zStart + Math.floor(i / 2 / 3)) * 10 + (Math.floor(i / 2) % 3);
    const v = stacksToVolume([stack(2, 6, row(0)), stack(2, 3, row(2))], region);
    expect([v.width, v.height, v.depth]).toEqual([2, 3, 3]);
    const at = (x: number, y: number, z: number) => v.data[(z * v.height + y) * v.width + x];
    expect(at(0, 0, 0)).toBe(0);
    expect(at(1, 2, 1)).toBe(12);
    expect(at(0, 1, 2)).toBe(21);
  });

  it('rejects stacks that do not match the requested region', () => {
    expect(() => stacksToVolume([stack(2, 5, () => 0)], { x: [0, 2], y: [0, 3], z: [0, 2] } as never)).toThrow(/Unexpected image size/);
  });
});

describe('volumeRegion / physicalSize', () => {
  it('centres the block and clamps it to a smaller extent', () => {
    const r = volumeRegion({ x: [0, 1000], y: [0, 800], z: [0, 40] }, [256, 256, 64]);
    expect(r.x).toEqual([372, 628]);
    expect(r.y).toEqual([272, 528]);
    expect(r.z).toEqual([0, 40]);
  });

  it('scales the box so the longest physical side is 1', () => {
    // 256 x 256 x 64 voxels of 4 x 4 x 40 nm -> 1024 x 1024 x 2560 nm
    const s = physicalSize([256, 256, 64], [4, 4, 40]);
    expect(s[2]).toBe(1);
    expect(s[0]).toBeCloseTo(0.4, 5);
    expect(s[1]).toBeCloseTo(0.4, 5);
  });
});
