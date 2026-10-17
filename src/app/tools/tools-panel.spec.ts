import { TestBed } from '@angular/core/testing';
import { SliceState } from '../viewer/slice-state';
import { DESKTOP_QUERY, ToolsPanel } from './tools-panel';

const img = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

/** Stubs matchMedia and returns a function that flips the answer, as resizing the window would. */
function stubMedia(matches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | undefined;
  const queries: string[] = [];
  vi.stubGlobal('matchMedia', (q: string) => {
    queries.push(q);
    return {
      matches,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => (listener = l),
      removeEventListener: () => (listener = undefined),
    };
  });
  return { queries, resize: (m: boolean) => listener?.({ matches: m } as MediaQueryListEvent) };
}

describe('ToolsPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The panel is hidden until the slice viewer has an image, so tests start with one unless they say otherwise. */
  function setup(ready = true) {
    if (ready) TestBed.inject(SliceState).publish(img);
    const fixture = TestBed.createComponent(ToolsPanel);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('is a sidebar with the edge-detection tab first and selected, then the Fourier tab, when the screen is wide', () => {
    const media = stubMedia(true);
    const { el } = setup();
    expect(media.queries).toEqual([DESKTOP_QUERY]);
    expect(el.querySelector('aside.tools')).not.toBeNull();
    expect(el.querySelector('dialog')).toBeNull();
    expect(el.querySelector('.tools-open')).toBeNull();
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Edge detection', 'Fourier analysis']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    expect(panel.querySelector('app-edge-editor')).not.toBeNull();
    expect(el.querySelector('app-fourier-analysis')).toBeNull();
  });

  it('opens the Fourier tab next to the edge tab, by click or arrow key', () => {
    stubMedia(true);
    const { fixture, el } = setup();
    const tab = (id: string) => el.querySelector<HTMLElement>('#tab-' + id)!;

    tab('fourier').click();
    fixture.detectChanges();
    expect(tab('fourier').getAttribute('aria-selected')).toBe('true');
    expect(tab('edges').getAttribute('aria-selected')).toBe('false');
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(panel.id).toBe('tabpanel-fourier');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-fourier');
    expect(panel.querySelector('app-fourier-analysis')).not.toBeNull();
    expect(el.querySelector('app-edge-editor')).toBeNull();

    tab('fourier').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="tabpanel"]')!.id).toBe('tabpanel-edges');
  });

  it('renders nothing on a wide screen until the slice viewer is ready, and hides again when it is not', () => {
    stubMedia(true);
    const { fixture, el } = setup(false);
    expect(el.querySelector('aside')).toBeNull();
    expect(el.querySelector('[role="tab"]')).toBeNull();

    TestBed.inject(SliceState).publish(img);
    fixture.detectChanges();
    expect(el.querySelector('aside.tools')).not.toBeNull();
    expect(el.querySelectorAll('[role="tab"]').length).toBe(2);

    TestBed.inject(SliceState).reset();
    fixture.detectChanges();
    expect(el.querySelector('aside')).toBeNull();
  });

  it('has no Tools button or dialog on a narrow screen until the slice viewer is ready', () => {
    stubMedia(false);
    const { fixture, el } = setup(false);
    expect(el.querySelector('.tools-open')).toBeNull();
    expect(el.querySelector('dialog')).toBeNull();

    TestBed.inject(SliceState).publish(img);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.tools-open')!.click();
    expect(el.querySelector<HTMLDialogElement>('dialog')!.open).toBe(true);
  });

  it('remembers the chosen tab across being hidden and shown again', () => {
    stubMedia(true);
    const { fixture, el } = setup();
    el.querySelector<HTMLElement>('#tab-fourier')!.click();
    fixture.detectChanges();
    TestBed.inject(SliceState).reset();
    fixture.detectChanges();
    TestBed.inject(SliceState).publish(img);
    fixture.detectChanges();
    expect(el.querySelector('[role="tabpanel"]')!.id).toBe('tabpanel-fourier');
  });

  it('shows the sidebar when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { el } = setup();
    expect(el.querySelector('aside.tools')).not.toBeNull();
  });

  it('is a dialog behind a Tools button on a narrow screen, with the same tabs', () => {
    stubMedia(false);
    const { fixture, el } = setup();
    expect(el.querySelector('aside.tools')).toBeNull();
    const dialog = el.querySelector<HTMLDialogElement>('dialog.tools-dialog')!;
    expect(dialog.open).toBe(false);
    expect(dialog.querySelector('[role="tab"]')?.textContent?.trim()).toBe('Edge detection');
    expect(dialog.querySelector('app-edge-editor')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('.tools-open')!.click();
    fixture.detectChanges();
    expect(dialog.open).toBe(true);

    Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Close')!.click();
    expect(dialog.open).toBe(false);
  });

  it('closes the dialog on a click on its backdrop but not on its contents', () => {
    stubMedia(false);
    const { el } = setup();
    const dialog = el.querySelector<HTMLDialogElement>('dialog')!;
    el.querySelector<HTMLButtonElement>('.tools-open')!.click();
    dialog.querySelector<HTMLElement>('.sheet')!.click();
    expect(dialog.open).toBe(true);
    dialog.click();
    expect(dialog.open).toBe(false);
  });

  it('switches between sidebar and dialog when the window crosses the breakpoint', () => {
    const media = stubMedia(true);
    const { fixture, el } = setup();
    expect(el.querySelector('aside.tools')).not.toBeNull();
    media.resize(false);
    fixture.detectChanges();
    expect(el.querySelector('aside.tools')).toBeNull();
    expect(el.querySelector('dialog')).not.toBeNull();
    media.resize(true);
    fixture.detectChanges();
    expect(el.querySelector('aside.tools')).not.toBeNull();
    expect(el.querySelector('dialog')).toBeNull();
  });
});
