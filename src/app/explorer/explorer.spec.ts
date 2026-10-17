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
