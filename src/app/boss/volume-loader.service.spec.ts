import { TestBed } from '@angular/core/testing';
import { BossApi } from './boss-api.service';
import { VolumeLoader } from './volume-loader.service';

describe('VolumeLoader', () => {
  const urls: string[] = [];

  beforeEach(() => {
    urls.length = 0;
    const api = {
      base: 'https://api.bossdb.io/v1/',
      // Like Boss: X wide, (Y * Z) tall; each pixel's red value is its z index.
      stack: (url: string) => {
        urls.push(url);
        const n = (url.match(/\d+:\d+/g) ?? []).map((r) => r.split(':').map(Number));
        const [[x0, x1], [y0, y1], [z0, z1]] = n;
        const [width, Y] = [x1 - x0, y1 - y0];
        const height = Y * (z1 - z0);
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) rgba[i * 4] = z0 + Math.floor(i / width / Y);
        return Promise.resolve({ rgba, width, height, bytes: 100 });
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: BossApi, useValue: api }] });
  });

  it('splits a tall block into several requests and reassembles it in z order', async () => {
    const progress: number[] = [];
    const v = await TestBed.inject(VolumeLoader).load(
      { collection: 'c', experiment: 'e', channel: 'h' },
      { x: [10, 12], y: [0, 512], z: [100, 140] },
      { onProgress: (d) => progress.push(d) },
    );
    expect(urls).toEqual([
      'https://api.bossdb.io/v1/cutout/c/e/h/0/10:12/0:512/100:131/',
      'https://api.bossdb.io/v1/cutout/c/e/h/0/10:12/0:512/131:140/',
    ]);
    expect([v.width, v.height, v.depth]).toEqual([2, 512, 40]);
    expect(v.requests).toBe(2);
    expect(v.bytes).toBe(200);
    expect(progress).toEqual([1, 2]);
    const at = (x: number, y: number, z: number) => v.data[(z * v.height + y) * v.width + x];
    expect(at(1, 300, 0)).toBe(100);
    expect(at(0, 0, 31)).toBe(131);
    expect(at(1, 511, 39)).toBe(139);
  });
});
