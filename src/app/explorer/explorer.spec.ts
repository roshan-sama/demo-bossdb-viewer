import { TestBed } from '@angular/core/testing';
import { BossApi } from '../boss/boss-api.service';
import { Explorer } from './explorer';
import { ExplorerStore } from './explorer.store';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('Explorer selection box', () => {
  beforeEach(async () => {
    const api = {
      collections: () => Promise.resolve(['c']),
      experiments: () => Promise.resolve(['e']),
      channels: () => Promise.resolve(['h']),
      experiment: () => Promise.resolve({ coord_frame: 'cf', num_hierarchy_levels: 1 }),
      coordFrame: () => Promise.resolve({ x_start: 0, x_stop: 10, y_start: 0, y_stop: 10, z_start: 0, z_stop: 10 }),
      // An unknown datatype keeps the viewers out of the page; only the selection box matters here.
      channel: () => Promise.resolve({ name: 'h', type: 'image', datatype: 'unknown' }),
    };
    await TestBed.configureTestingModule({ imports: [Explorer], providers: [{ provide: BossApi, useValue: api }] }).compileComponents();
  });

  async function setup() {
    const fixture = TestBed.createComponent(Explorer);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, store: fixture.debugElement.injector.get(ExplorerStore) };
  }

  const box = (el: HTMLElement) => el.querySelector<HTMLDetailsElement>('details.picker')!;

  it('starts open, holding the three dropdowns', async () => {
    const { el } = await setup();
    expect(box(el).open).toBe(true);
    expect(box(el).querySelectorAll('app-combobox').length).toBe(3);
  });

  it('folds away once a channel is chosen and shows the choice in the header', async () => {
    const { fixture, el, store } = await setup();
    await store.chooseCollection('c');
    await store.chooseExperiment('e');
    fixture.detectChanges();
    expect(box(el).open).toBe(true);
    await store.chooseChannel('h');
    await fixture.whenStable();
    fixture.detectChanges();
    await tick();
    expect(box(el).open).toBe(false);
    expect(box(el).querySelector('summary .crumb')?.textContent?.trim()).toBe('c / e / h');
  });

  it('stays open when the person reopens it, and folds again on the next channel choice', async () => {
    const { fixture, el, store } = await setup();
    await store.chooseCollection('c');
    await store.chooseExperiment('e');
    await store.chooseChannel('h');
    await fixture.whenStable();
    fixture.detectChanges();
    box(el).open = true;
    box(el).dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    await tick();
    expect(box(el).open).toBe(true);
    await store.chooseExperiment('e'); // clears the channel
    fixture.detectChanges();
    expect(box(el).open).toBe(true);
    await store.chooseChannel('h');
    await fixture.whenStable();
    fixture.detectChanges();
    await tick();
    expect(box(el).open).toBe(false);
  });
});

describe('Explorer viewers by channel type', () => {
  let chan: { type: string; datatype: string };
  const fetched = { jpeg: 0, blosc: 0 };

  beforeEach(async () => {
    fetched.jpeg = 0;
    fetched.blosc = 0;
    const api = {
      base: 'https://api.bossdb.io/v1/',
      collections: () => Promise.resolve(['c']),
      experiments: () => Promise.resolve(['e']),
      channels: () => Promise.resolve(['h']),
      experiment: () => Promise.resolve({ coord_frame: 'cf', num_hierarchy_levels: 1 }),
      coordFrame: () =>
        Promise.resolve({ x_start: 0, x_stop: 8, y_start: 0, y_stop: 8, z_start: 0, z_stop: 4, x_voxel_size: 1, y_voxel_size: 1, z_voxel_size: 1 }),
      channel: () => Promise.resolve({ ...chan }),
      downsample: () => Promise.reject(new Error('HTTP 404')),
      stack: () => {
        fetched.jpeg++;
        return Promise.resolve({ rgba: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8, bytes: 1 });
      },
      blosc: () => {
        fetched.blosc++;
        const raw = new Uint8Array(8 * 8 * 2);
        const buf = new Uint8Array(16 + raw.length);
        const dv = new DataView(buf.buffer);
        buf.set([2, 1, 0x02, 2]);
        dv.setUint32(4, raw.length, true);
        dv.setUint32(8, raw.length, true);
        dv.setUint32(12, buf.length, true);
        buf.set(raw, 16);
        return Promise.resolve(buf);
      },
    };
    await TestBed.configureTestingModule({ imports: [Explorer], providers: [{ provide: BossApi, useValue: api }] }).compileComponents();
  });

  async function open(c: { type: string; datatype: string }) {
    chan = c;
    const fixture = TestBed.createComponent(Explorer);
    await fixture.whenStable();
    const store = fixture.debugElement.injector.get(ExplorerStore);
    await store.chooseCollection('c');
    await store.chooseExperiment('e');
    await store.chooseChannel('h');
    await fixture.whenStable();
    fixture.detectChanges();
    await tick();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, text: el.textContent?.replace(/\s+/g, ' ') ?? '', viewer: el.querySelector('app-slice-viewer') };
  }

  it('shows a uint8 image through JPEG, with the 3D viewer', async () => {
    const { el, viewer } = await open({ type: 'image', datatype: 'uint8' });
    expect(viewer).not.toBeNull();
    expect(el.querySelector('app-volume-viewer')).not.toBeNull();
    expect(fetched.jpeg).toBeGreaterThan(0);
    expect(fetched.blosc).toBe(0);
  });

  it('shows a uint16 image in the slice viewer through blosc, and says why there is no 3D viewer', async () => {
    const { el, text, viewer } = await open({ type: 'image', datatype: 'uint16' });
    expect(viewer).not.toBeNull();
    expect(el.querySelector('app-overlay-picker')).not.toBeNull();
    expect(el.querySelector('app-volume-viewer')).toBeNull();
    expect(text).toContain('The 3D viewer uses JPEG cutouts');
    expect(text).toContain('image / uint16');
    expect(fetched.jpeg).toBe(0);
    expect(fetched.blosc).toBeGreaterThan(0);
  });

  it('does not draw an annotation channel as the base image, and points to Label overlay', async () => {
    const { el, text, viewer } = await open({ type: 'annotation', datatype: 'uint64' });
    expect(viewer).toBeNull();
    expect(el.querySelector('app-volume-viewer')).toBeNull();
    expect(text).toContain('annotation / uint64');
    expect(text).toContain('pick this one under Label overlay');
    expect(fetched.jpeg + fetched.blosc).toBe(0);
  });

  it('says plainly that a datatype it cannot decode is not drawn, without the annotation hint', async () => {
    const { text, viewer } = await open({ type: 'image', datatype: 'float32' });
    expect(viewer).toBeNull();
    expect(text).toContain('image / float32');
    expect(text).not.toContain('Label overlay');
  });
});
