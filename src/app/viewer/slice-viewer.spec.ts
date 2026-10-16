import { TestBed } from '@angular/core/testing';
import { BossApi } from '../boss/boss-api.service';
import { CoordFrame } from '../boss/boss.models';
import { SliceViewer } from './slice-viewer';

const coord = {
  x_start: 0, x_stop: 1000, y_start: 0, y_stop: 800, z_start: 0, z_stop: 100,
  x_voxel_size: 4, y_voxel_size: 4, z_voxel_size: 40,
} as CoordFrame;

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('SliceViewer', () => {
  const urls: string[] = [];
  const blosc: string[] = [];

  beforeEach(() => {
    urls.length = 0;
    blosc.length = 0;
    const api = {
      base: 'https://api.bossdb.io/v1/',
      // Like Boss: the image is X wide and (Y * Z) tall.
      blosc: (url: string) => {
        blosc.push(url);
        const n = 512 * 512;
        const raw = new Uint8Array(n).fill(3).fill(0, 0, n / 2);
        const buf = new Uint8Array(16 + n);
        const dv = new DataView(buf.buffer);
        buf.set([2, 1, 0x02, 1]);
        dv.setUint32(4, n, true);
        dv.setUint32(8, n, true);
        dv.setUint32(12, 16 + n, true);
        buf.set(raw, 16);
        return Promise.resolve(buf);
      },
      stack: (url: string) => {
        urls.push(url);
        const [x0, x1, y0, y1, z0, z1] = (url.match(/(\d+):(\d+)/g) ?? []).flatMap((r) => r.split(':').map(Number));
        const width = x1 - x0;
        const height = (y1 - y0) * (z1 - z0);
        return Promise.resolve({ rgba: new Uint8ClampedArray(width * height * 4), width, height, bytes: 2048 });
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: BossApi, useValue: api }] });
  });

  async function setup() {
    const fixture = TestBed.createComponent(SliceViewer);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'h' });
    fixture.componentRef.setInput('coord', coord);
    await fixture.whenStable();
    await tick();
    await fixture.whenStable();
    return fixture;
  }

  it('requests a centred XY slice at the middle of the volume', async () => {
    await setup();
    expect(urls).toEqual(['https://api.bossdb.io/v1/cutout/c/e/h/0/244:756/144:656/50:51/']);
  });

  it('switches to the XZ plane with y fixed at its middle', async () => {
    const fixture = await setup();
    const xz = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.trim() === 'XZ');
    xz?.click();
    await tick();
    expect(urls.at(-1)).toBe('https://api.bossdb.io/v1/cutout/c/e/h/0/244:756/400:401/0:100/');
  });

  it('splits a tall YZ request along z and reports the request count', async () => {
    const fixture = await setup();
    const yz = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.trim() === 'YZ');
    const before = urls.length;
    yz?.click();
    await tick();
    expect(urls.slice(before)).toEqual([
      'https://api.bossdb.io/v1/cutout/c/e/h/0/500:501/144:656/0:31/',
      'https://api.bossdb.io/v1/cutout/c/e/h/0/500:501/144:656/31:62/',
      'https://api.bossdb.io/v1/cutout/c/e/h/0/500:501/144:656/62:93/',
      'https://api.bossdb.io/v1/cutout/c/e/h/0/500:501/144:656/93:100/',
    ]);
    await fixture.whenStable();
    const meta = (fixture.nativeElement as HTMLElement).querySelector('.meta')?.textContent ?? '';
    expect(meta).toContain('512×100 px');
    expect(meta).toContain('4 requests');
  });

  it('shows the status line with size and the request URL', async () => {
    const fixture = await setup();
    await fixture.whenStable();
    const meta = (fixture.nativeElement as HTMLElement).querySelector('.meta')?.textContent ?? '';
    expect(meta).toContain('512×512 px');
    expect(meta).toContain('/cutout/c/e/h/0/');
  });

  it('draws a label overlay fetched as blosc, with a legend that skips label 0', async () => {
    const fixture = TestBed.createComponent(SliceViewer);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'h' });
    fixture.componentRef.setInput('coord', coord);
    fixture.componentRef.setInput('overlay', { ref: { collection: 'c', experiment: 'e2', channel: 'labels' }, datatype: 'uint8' });
    await fixture.whenStable();
    await tick();
    await tick();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(blosc).toContain('https://api.bossdb.io/v1/cutout/c/e2/labels/0/244:756/144:656/50:51/0:1/');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('canvas.overlay')).not.toBeNull();
    const chips = Array.from(el.querySelectorAll('.legend .chip')).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
    expect(chips).toEqual(['3 131072 px']);
  });

  it('has no overlay canvas or blosc request without an overlay', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas.overlay')).toBeNull();
    expect(blosc).toEqual([]);
  });
});
