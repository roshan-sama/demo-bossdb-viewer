import { TestBed } from '@angular/core/testing';
import { SliceState } from '../viewer/slice-state';
import { FourierAnalysis } from './fourier-analysis';
import { FourierSettings } from './fourier-settings';

const img = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

describe('FourierAnalysis', () => {
  async function setup() {
    const fixture = TestBed.createComponent(FourierAnalysis);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('waits, without a canvas, until the slice viewer has an image', async () => {
    const { el } = await setup();
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.textContent).toContain('Waiting for the slice viewer');
  });

  it('sizes the spectrum canvas to the transform and describes what was analysed', async () => {
    TestBed.inject(SliceState).publish(img(48, 20));
    const { el } = await setup();
    const cv = el.querySelector<HTMLCanvasElement>('canvas')!;
    expect([cv.width, cv.height]).toEqual([64, 32]);
    expect(el.textContent).toContain('48×20 px analysed · 64×32 transform');
  });

  it('follows the slice viewer when a new image arrives', async () => {
    const slice = TestBed.inject(SliceState);
    slice.publish(img(16, 16));
    const { fixture, el } = await setup();
    expect(el.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(16);
    slice.publish(img(32, 32));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(32);
  });

  it('keeps the log-scale and Hann-window choices in the shared settings', async () => {
    const s = TestBed.inject(FourierSettings);
    TestBed.inject(SliceState).publish(img(16, 16));
    const { el } = await setup();
    const box = (label: string) => Array.from(el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((i) => i.parentElement?.textContent?.includes(label))!;
    expect([box('Log scale').checked, box('Hann window').checked]).toEqual([true, true]);
    box('Log scale').checked = false;
    box('Log scale').dispatchEvent(new Event('change'));
    box('Hann window').checked = false;
    box('Hann window').dispatchEvent(new Event('change'));
    expect([s.log(), s.hann()]).toEqual([false, false]);
  });
});
