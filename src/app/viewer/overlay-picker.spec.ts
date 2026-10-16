import { TestBed } from '@angular/core/testing';
import { BossApi } from '../boss/boss-api.service';
import { Overlay } from '../boss/boss.models';
import { OverlayPicker } from './overlay-picker';

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('OverlayPicker', () => {
  let channelMeta: Record<string, { type: string; datatype: string }>;
  const emitted: (Overlay | null)[] = [];

  beforeEach(() => {
    emitted.length = 0;
    channelMeta = {
      labels: { type: 'annotation', datatype: 'uint64' },
      weird: { type: 'image', datatype: 'float32' },
    };
    const api = {
      experiments: () => Promise.resolve(['exp2']),
      channels: () => Promise.resolve(Object.keys(channelMeta)),
      experiment: () => Promise.resolve({ coord_frame: 'frame2' }),
      channel: (_c: string, _e: string, h: string) => Promise.resolve(channelMeta[h]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: BossApi, useValue: api }] });
  });

  async function setup() {
    const f = TestBed.createComponent(OverlayPicker);
    f.componentRef.setInput('collection', 'c');
    f.componentRef.setInput('frame', 'frame1');
    f.componentInstance.chosen.subscribe((o) => emitted.push(o));
    await f.whenStable();
    await tick();
    return f;
  }

  const pick = async (f: Awaited<ReturnType<typeof setup>>, i: number, value: string) => {
    const sel = (f.nativeElement as HTMLElement).querySelectorAll('select')[i];
    sel.value = value;
    sel.dispatchEvent(new Event('change'));
    await tick();
    await f.whenStable();
    f.detectChanges();
  };

  it('emits an overlay for a readable annotation channel and warns about a different frame', async () => {
    const f = await setup();
    f.detectChanges();
    await pick(f, 0, 'exp2');
    await pick(f, 1, 'labels');
    expect(emitted.at(-1)).toEqual({ ref: { collection: 'c', experiment: 'exp2', channel: 'labels' }, datatype: 'uint64' });
    expect((f.nativeElement as HTMLElement).textContent).toContain('"frame2"');
  });

  it('refuses channels it cannot read as blosc', async () => {
    const f = await setup();
    f.detectChanges();
    await pick(f, 0, 'exp2');
    await pick(f, 1, 'weird');
    expect(emitted.at(-1)).toBeNull();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Cannot read this channel');
  });
});
