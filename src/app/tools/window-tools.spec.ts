import { TestBed } from '@angular/core/testing';
import { WindowSettings } from '../viewer/window-settings';
import { WindowTools } from './window-tools';

describe('WindowTools', () => {
  function setup() {
    const w = TestBed.inject(WindowSettings);
    w.publish('uint16', { min: 100, max: 4000, auto: { lo: 120, hi: 3900 } });
    const fixture = TestBed.createComponent(WindowTools);
    fixture.detectChanges();
    return { w, fixture, el: fixture.nativeElement as HTMLElement };
  }
  const radio = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find((r) => r.parentElement?.textContent?.includes(label))!;

  it('shows the plane range and the window in use, with auto chosen', () => {
    const { el } = setup();
    expect(radio(el, 'Auto').checked).toBe(true);
    expect(el.querySelector('.window-facts')?.textContent).toContain('100 – 4,000');
    expect(el.querySelector('.window-facts')?.textContent).toContain('120 – 3,900');
    expect(el.querySelector('input[type="number"]')).toBeNull();
  });

  it('switches to the whole range, which shows every value', () => {
    const { w, fixture, el } = setup();
    radio(el, 'Whole range').click();
    fixture.detectChanges();
    expect(w.applied()).toEqual({ lo: 100, hi: 4000 });
  });

  it('lets the black and white points be typed in manual mode, ignoring an empty box', () => {
    const { w, fixture, el } = setup();
    radio(el, 'Manual').click();
    fixture.detectChanges();
    const lo = el.querySelector<HTMLInputElement>('input[aria-label="Black point"]')!;
    lo.value = '500';
    lo.dispatchEvent(new Event('change'));
    lo.value = '';
    lo.dispatchEvent(new Event('change'));
    const hi = el.querySelector<HTMLInputElement>('input[aria-label="White point slider"]')!;
    hi.value = '2000';
    hi.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(w.applied()).toEqual({ lo: 500, hi: 2000 });
  });

  it('goes back to auto with Reset', () => {
    const { w, fixture, el } = setup();
    radio(el, 'Whole range').click();
    fixture.detectChanges();
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reset'))!.click();
    expect(w.mode()).toBe('auto');
  });

  it('renders nothing without a blosc plane', () => {
    TestBed.inject(WindowSettings).clear();
    const fixture = TestBed.createComponent(WindowTools);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
