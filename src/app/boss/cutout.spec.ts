import { centeredWindow, cutoutUrl, planeRegion, planeRegionAt, Region, windowAt } from './cutout';

const extent: Region = { x: [0, 1000], y: [0, 800], z: [10, 110] };

describe('cutout helpers', () => {
  it('centres a window inside the extent', () => {
    expect(centeredWindow([0, 1000], 512)).toEqual([244, 756]);
  });

  it('clamps the window to a smaller extent', () => {
    expect(centeredWindow([10, 110], 512)).toEqual([10, 110]);
  });

  it('builds a one-voxel-thick XY region at the chosen z', () => {
    const r = planeRegion(extent, 'xy', 60, 512);
    expect(r.z).toEqual([60, 61]);
    expect(r.x).toEqual([244, 756]);
    expect(r.y).toEqual([144, 656]);
  });

  it('puts the fixed axis on y for XZ planes', () => {
    const r = planeRegion(extent, 'xz', 400, 512);
    expect(r.y).toEqual([400, 401]);
    expect(r.z).toEqual([10, 110]);
  });

  it('builds a cutout URL with encoded names', () => {
    const url = cutoutUrl('https://api.bossdb.io/v1/', { collection: 'a b', experiment: 'e', channel: 'c' }, 0, {
      x: [0, 4], y: [1, 5], z: [2, 3],
    });
    expect(url).toBe('https://api.bossdb.io/v1/cutout/a%20b/e/c/0/0:4/1:5/2:3/');
  });
});

import { MAX_STACK_PX, splitForJpeg } from './cutout';

describe('splitForJpeg', () => {
  it('leaves single-slice (XY) and thin (XZ) requests whole', () => {
    expect(splitForJpeg({ x: [0, 512], y: [0, 512], z: [5, 6] })).toHaveLength(1);
    expect(splitForJpeg({ x: [0, 512], y: [7, 8], z: [0, 512] })).toHaveLength(1);
  });

  it('splits a tall YZ stack along z and covers every slice exactly once', () => {
    const r = { x: [500, 501], y: [0, 512], z: [0, 512] } as const;
    const chunks = splitForJpeg({ x: [...r.x], y: [...r.y], z: [...r.z] } as never);
    expect(chunks).toHaveLength(17);
    expect(chunks[0].z).toEqual([0, 31]);
    expect(chunks.at(-1)?.z).toEqual([496, 512]);
    for (const c of chunks) expect((c.y[1] - c.y[0]) * (c.z[1] - c.z[0])).toBeLessThanOrEqual(MAX_STACK_PX);
    expect(chunks.reduce((n, c) => n + (c.z[1] - c.z[0]), 0)).toBe(512);
  });
});

describe('cutoutUrl time range', () => {
  it('appends an optional time range', () => {
    const ref = { collection: 'a', experiment: 'b', channel: 'c' };
    const r = { x: [0, 4], y: [0, 4], z: [0, 4] } as never;
    expect(cutoutUrl('https://h/v1/', ref, 0, r, [0, 1])).toBe('https://h/v1/cutout/a/b/c/0/0:4/0:4/0:4/0:1/');
    expect(cutoutUrl('https://h/v1/', ref, 0, r)).toBe('https://h/v1/cutout/a/b/c/0/0:4/0:4/0:4/');
  });
});

describe('window at a start coordinate', () => {
  it('clamps inside the extent', () => {
    expect(windowAt([0, 1000], 100, 256)).toEqual([100, 356]);
    expect(windowAt([0, 1000], 900, 256)).toEqual([900, 1000]);
    expect(windowAt([10, 110], -5, 50)).toEqual([10, 60]);
    expect(windowAt([0, 1000], 5000, 256)).toEqual([999, 1000]);
  });

  it('builds a plane region from starts, centring a missing side', () => {
    const e: Region = { x: [0, 1000], y: [0, 800], z: [10, 110] };
    expect(planeRegionAt(e, 'xy', 50, 256, { h: 100 })).toEqual({ x: [100, 356], y: [272, 528], z: [50, 51] });
    expect(planeRegionAt(e, 'yz', 7, 64, { h: 10, v: 20 })).toEqual({ y: [10, 74], z: [20, 84], x: [7, 8] });
    expect(planeRegionAt(e, 'xy', 50, 512, {})).toEqual(planeRegion(e, 'xy', 50, 512));
  });
});
