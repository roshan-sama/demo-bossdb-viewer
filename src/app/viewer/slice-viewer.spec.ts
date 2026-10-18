import { TestBed } from '@angular/core/testing';
import { BossApi } from '../boss/boss-api.service';
import { CoordFrame } from '../boss/boss.models';
import { SliceState } from './slice-state';
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
      downsample: () => Promise.reject(new Error('HTTP 404')),
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
    expect(chips).toEqual(['3 131,072 px']);
  });

  it('has no overlay canvas or blosc request without an overlay', async () => {
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas.overlay')).toBeNull();
    expect(blosc).toEqual([]);
  });

  it('adds an edge canvas only while Edges is on, without any extra request', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('canvas.edges')).toBeNull();
    const before = urls.length;
    const toggle = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((i) => i.parentElement?.textContent?.includes('Edges'))!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('canvas.edges')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Edge opacity"]')).not.toBeNull();
    expect(urls.length).toBe(before);
    expect(blosc).toEqual([]);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('canvas.edges')).toBeNull();
  });

  it('starts the window at typed coordinates and keeps the other side centred', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    const x = el.querySelector<HTMLInputElement>('input[aria-label="x start"]')!;
    expect(x.value).toBe('244');
    x.value = '100';
    x.dispatchEvent(new Event('change'));
    await tick();
    expect(urls.at(-1)).toBe('https://api.bossdb.io/v1/cutout/c/e/h/0/100:612/144:656/50:51/');
    const y = el.querySelector<HTMLInputElement>('input[aria-label="y start"]')!;
    y.value = '700';
    y.dispatchEvent(new Event('change'));
    await tick();
    expect(urls.at(-1)).toBe('https://api.bossdb.io/v1/cutout/c/e/h/0/100:612/700:800/50:51/');
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Centre')?.click();
    await tick();
    fixture.detectChanges();
    // The centred stack is cached, so no new request; the fields show the centred starts again.
    expect(el.querySelector<HTMLInputElement>('input[aria-label="x start"]')!.value).toBe('244');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="y start"]')!.value).toBe('144');
  });

  it('requests a coarser resolution level with estimated extents when the server sizes are unavailable', async () => {
    const fixture = TestBed.createComponent(SliceViewer);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'h' });
    fixture.componentRef.setInput('coord', coord);
    fixture.componentRef.setInput('levels', 3);
    fixture.componentRef.setInput('hierarchy', 'anisotropic');
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sel = el.querySelector<HTMLSelectElement>('select')!;
    expect(Array.from(sel.options).map((o) => o.textContent?.trim())).toEqual(['0 (full)', '1', '2']);
    sel.value = '2';
    sel.dispatchEvent(new Event('change'));
    await tick();
    await tick();
    expect(urls.at(-1)).toBe('https://api.bossdb.io/v1/cutout/c/e/h/2/0:250/0:200/50:51/');
    fixture.detectChanges();
    expect(el.textContent).toContain('estimated');
  });

  it('tells the tools it is ready only once its first image is drawn, and not after it is destroyed', async () => {
    const state = TestBed.inject(SliceState);
    const fixture = TestBed.createComponent(SliceViewer);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'h' });
    fixture.componentRef.setInput('coord', coord);
    fixture.detectChanges();
    expect(state.ready()).toBe(false);
    await fixture.whenStable();
    await tick();
    expect(state.ready()).toBe(true);
    expect([state.image()?.width, state.image()?.height]).toEqual([512, 512]);
    fixture.destroy();
    expect(state.ready()).toBe(false);
  });

  it('locks the tools again while a different channel loads', async () => {
    const state = TestBed.inject(SliceState);
    const fixture = await setup();
    expect(state.ready()).toBe(true);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'other' });
    fixture.detectChanges();
    expect(state.ready()).toBe(false);
    await fixture.whenStable();
    await tick();
    expect(state.ready()).toBe(true);
  });
});

/** A blosc buffer holding `raw` stored uncompressed (the memcpy flag), which is how Blosc stores data it cannot shrink. */
function bloscBuffer(raw: Uint8Array, typesize: number): Uint8Array {
  const buf = new Uint8Array(16 + raw.length);
  const dv = new DataView(buf.buffer);
  buf.set([2, 1, 0x02, typesize]);
  dv.setUint32(4, raw.length, true);
  dv.setUint32(8, raw.length, true);
  dv.setUint32(12, 16 + raw.length, true);
  buf.set(raw, 16);
  return buf;
}

describe('SliceViewer with a blosc image (channels the Boss will not serve as JPEG)', () => {
  const blosc: string[] = [];
  const jpeg: string[] = [];

  beforeEach(() => {
    blosc.length = 0;
    jpeg.length = 0;
    const api = {
      base: 'https://api.bossdb.io/v1/',
      downsample: () => Promise.reject(new Error('HTTP 404')),
      stack: (url: string) => {
        jpeg.push(url);
        return Promise.reject(new Error('The Boss serves no JPEG for this channel'));
      },
      // A uint16 plane whose first half is 100 and second half is 4000: a low-range image, as 16-bit data usually is.
      blosc: (url: string) => {
        blosc.push(url);
        const [x0, x1, y0, y1, z0, z1] = (url.match(/(\d+):(\d+)/g) ?? []).flatMap((r) => r.split(':').map(Number));
        const n = (x1 - x0) * (y1 - y0) * (z1 - z0);
        const raw = new Uint16Array(n).fill(4000).fill(100, 0, n / 2);
        return Promise.resolve(bloscBuffer(new Uint8Array(raw.buffer), 2));
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: BossApi, useValue: api }] });
  });

  async function setup(datatype = 'uint16') {
    const fixture = TestBed.createComponent(SliceViewer);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'h' });
    fixture.componentRef.setInput('coord', coord);
    fixture.componentRef.setInput('format', 'blosc');
    fixture.componentRef.setInput('datatype', datatype);
    await fixture.whenStable();
    await tick();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const plane = (fixture: { nativeElement: unknown }, name: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.trim() === name)!;
  const meta = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).querySelector('.meta')?.textContent ?? '';

  it('fetches the centred plane as a single blosc request and makes no JPEG request', async () => {
    await setup();
    expect(blosc).toEqual(['https://api.bossdb.io/v1/cutout/c/e/h/0/244:756/144:656/50:51/0:1/']);
    expect(jpeg).toEqual([]);
  });

  it('windows the 16-bit values to grey, so a low-range image still uses black to white', async () => {
    await setup();
    const img = TestBed.inject(SliceState).image()!;
    expect([img.width, img.height]).toEqual([512, 512]);
    // A plain 16-to-8-bit shift would give 0 and 15 here, which is nearly black.
    expect(Array.from(img.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(img.data.slice(-4))).toEqual([255, 255, 255, 255]);
  });

  it('reports the size, the single request and the intensity window in the status line', async () => {
    const fixture = await setup();
    const text = meta(fixture);
    expect(text).toContain('512×512 px');
    expect(text).toContain('1 request');
    expect(text).toContain('uint16 window 100–4,000');
    expect(text).toContain('/cutout/c/e/h/0/244:756/144:656/50:51/0:1/');
  });

  it('draws a YZ plane from one request, with the y axis across and z down', async () => {
    const fixture = await setup();
    plane(fixture, 'YZ').click();
    await tick();
    await fixture.whenStable();
    expect(blosc.at(-1)).toBe('https://api.bossdb.io/v1/cutout/c/e/h/0/500:501/144:656/0:100/0:1/');
    expect(blosc).toHaveLength(2); // JPEG would have needed 4 requests here
    const img = TestBed.inject(SliceState).image()!;
    expect([img.width, img.height]).toEqual([512, 100]);
  });

  it('does not fetch a plane again when it is shown a second time', async () => {
    const fixture = await setup();
    plane(fixture, 'XZ').click();
    await tick();
    plane(fixture, 'XY').click();
    await tick();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(blosc).toHaveLength(2);
    expect(meta(fixture)).toContain('(cached)');
  });

  it('adds an edge layer without any further request', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((i) => i.parentElement?.textContent?.includes('Edges'))!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('canvas.edges')).not.toBeNull();
    expect(blosc).toHaveLength(1);
  });

  it('shows a readable error for a datatype it cannot read', async () => {
    const fixture = await setup('float32');
    expect((fixture.nativeElement as HTMLElement).querySelector('.meta.err')?.textContent).toContain('Unsupported datatype "float32"');
    expect(TestBed.inject(SliceState).ready()).toBe(false);
  });
});
