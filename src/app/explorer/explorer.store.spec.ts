import { TestBed } from '@angular/core/testing';
import { BossApi } from '../boss/boss-api.service';
import { CoordFrame } from '../boss/boss.models';
import { ExplorerStore } from './explorer.store';

const coord = { x_start: 0, x_stop: 100, y_start: 0, y_stop: 100, z_start: 0, z_stop: 10 } as CoordFrame;

function fakeApi(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    collections: () => Promise.resolve(['a', 'b']),
    experiments: (c: string) => Promise.resolve([`${c}-exp`]),
    channels: () => Promise.resolve(['em']),
    experiment: () => Promise.resolve({ coord_frame: 'cf' }),
    coordFrame: () => Promise.resolve(coord),
    channel: () => Promise.resolve({ type: 'image' }),
    ...overrides,
  };
}

function setup(api: unknown) {
  TestBed.configureTestingModule({
    providers: [ExplorerStore, { provide: BossApi, useValue: api }],
  });
  return TestBed.inject(ExplorerStore);
}

describe('ExplorerStore', () => {
  it('loads collections on init', async () => {
    const s = setup(fakeApi());
    await s.init('');
    expect(s.collections().data).toEqual(['a', 'b']);
    expect(s.target()).toBeNull();
  });

  it('cascades to a ready target once a channel is chosen', async () => {
    const s = setup(fakeApi());
    await s.loadCollections();
    await s.chooseCollection('a');
    await s.chooseExperiment('a-exp');
    await s.chooseChannel('em');
    expect(s.target()?.ref).toEqual({ collection: 'a', experiment: 'a-exp', channel: 'em' });
    expect(s.target()?.coord).toBe(coord);
  });

  it('restores a selection from the URL hash', async () => {
    const s = setup(fakeApi());
    await s.init('#b/b-exp/em');
    expect(s.sel()).toEqual({ c: 'b', e: 'b-exp', h: 'em' });
  });

  it('ignores a slow response for a collection that is no longer selected', async () => {
    let release!: (v: string[]) => void;
    const slow = new Promise<string[]>((r) => (release = r));
    const s = setup(fakeApi({ experiments: (c: string) => (c === 'a' ? slow : Promise.resolve(['b-exp'])) }));
    await s.loadCollections();
    const first = s.chooseCollection('a');
    await s.chooseCollection('b');
    release(['a-exp']);
    await first;
    expect(s.experiments().data).toEqual(['b-exp']);
  });

  it('keeps the error and lets the caller retry', async () => {
    let fail = true;
    const s = setup(fakeApi({ collections: () => (fail ? Promise.reject(new Error('HTTP 500')) : Promise.resolve(['a'])) }));
    await s.loadCollections();
    expect(s.collections().error).toBe('HTTP 500');
    fail = false;
    await s.loadCollections();
    expect(s.collections().data).toEqual(['a']);
  });
});
