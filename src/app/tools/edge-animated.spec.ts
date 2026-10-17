import { TestBed } from '@angular/core/testing';
import { SWEEP_COLOR } from '../lib/edge-sweep';
import { EdgeSettings } from '../viewer/edge-settings';
import { EdgeAnimated } from './edge-animated';

describe('EdgeAnimated', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());

  function setup() {
    const fixture = TestBed.createComponent(EdgeAnimated);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const field = (id: string) => el.querySelector<HTMLInputElement>('#sweep-' + id)!;
    const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    const type = (id: string, value: string) => {
      const input = field(id);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, el, field, button, type, settings: TestBed.inject(EdgeSettings) };
  }

  it('starts with an anchor, destination and rate that can run, and nothing playing', () => {
    const { el, field, button } = setup();
    expect([field('anchor').value, field('destination').value, field('fps').value]).toEqual(['16', '96', '10']);
    expect(button('Run').disabled).toBe(false);
    expect(button('Reset').disabled).toBe(true);
    expect(el.querySelector('.err')).toBeNull();
  });

  it('disables Run, with a message, for each input that cannot be used, and enables it again once fixed', () => {
    const { el, field, button, type } = setup();

    type('anchor', '');
    expect(button('Run').disabled).toBe(true);
    expect(el.querySelector('#sweep-anchor-err')?.textContent).toContain('whole number');
    expect(field('anchor').getAttribute('aria-invalid')).toBe('true');
    expect(field('anchor').getAttribute('aria-describedby')).toBe('sweep-anchor-err');
    type('anchor', '16');
    expect(button('Run').disabled).toBe(false);
    expect(field('anchor').hasAttribute('aria-invalid')).toBe(false);

    type('destination', '16');
    expect(button('Run').disabled).toBe(true);
    expect(el.querySelector('#sweep-destination-err')?.textContent).toContain('greater than the anchor');
    type('destination', '40');
    expect(button('Run').disabled).toBe(false);

    type('fps', '0');
    expect(button('Run').disabled).toBe(true);
    expect(el.querySelector('#sweep-fps-err')?.textContent).toContain('1 to 60');
    type('fps', '61');
    expect(button('Run').disabled).toBe(true);
    type('fps', '2.5');
    expect(button('Run').disabled).toBe(false);
    expect(el.querySelector('.err')).toBeNull();
  });

  it('rejects a fractional anchor', () => {
    const { button, type } = setup();
    type('anchor', '16.5');
    expect(button('Run').disabled).toBe(true);
  });

  it('plays the sweep from the anchor, one strength per frame, and reports its progress', () => {
    const { fixture, el, button, type, settings } = setup();
    type('anchor', '16');
    type('destination', '20');
    type('fps', '10');
    button('Run').click();
    fixture.detectChanges();
    expect(settings.animation()).toEqual([{ min: 16, max: 16, color: SWEEP_COLOR }]);
    expect(el.textContent).toContain('Showing edge strengths 16 to 16 · frame 1 of 5');
    expect(button('Reset').disabled).toBe(false);

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(settings.animation()![0].max).toBe(17);
    expect(el.textContent).toContain('Showing edge strengths 16 to 17 · frame 2 of 5');

    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(settings.animation()).toEqual([{ min: 16, max: 20, color: SWEEP_COLOR }]);
    expect(el.textContent).toContain('Done: Showing edge strengths 16 to 20');
    expect(button('Reset').disabled).toBe(false);
  });

  it('does not change a run in progress when the entries are edited', () => {
    const { fixture, button, type, settings } = setup();
    type('destination', '30');
    button('Run').click();
    vi.advanceTimersByTime(200);
    type('anchor', '50');
    expect(button('Run').disabled).toBe(true);
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(settings.animation()).toEqual([{ min: 16, max: 19, color: SWEEP_COLOR }]);
  });

  it('Reset stops the sweep and gives the static bands back', () => {
    const { fixture, el, button, settings } = setup();
    button('Run').click();
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    button('Reset').click();
    fixture.detectChanges();
    expect(settings.animation()).toBeNull();
    expect(settings.activeBands()).toBe(settings.bands());
    expect(button('Reset').disabled).toBe(true);
    expect(el.textContent).not.toContain('Showing edge strengths');
    vi.advanceTimersByTime(5000);
    expect(settings.animation()).toBeNull();
  });

  it('ends the sweep when the subtab goes away', () => {
    const { fixture, button, settings } = setup();
    button('Run').click();
    expect(settings.animation()).not.toBeNull();
    fixture.destroy();
    expect(settings.animation()).toBeNull();
    // No later frame comes back to paint over the static bands.
    vi.advanceTimersByTime(5000);
    expect(settings.animation()).toBeNull();
  });
});
