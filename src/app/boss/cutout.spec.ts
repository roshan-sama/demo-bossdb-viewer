import { centeredWindow, cutoutUrl, planeRegion, Region } from './cutout';

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
