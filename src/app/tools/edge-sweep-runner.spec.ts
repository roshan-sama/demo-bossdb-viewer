import { TestBed } from '@angular/core/testing';
import { SWEEP_COLOR } from '../lib/edge-sweep';
import { EdgeSettings } from '../viewer/edge-settings';
import { EdgeSweepRunner } from './edge-sweep-runner';

describe('EdgeSweepRunner', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());

  const setup = () => ({ run: TestBed.inject(EdgeSweepRunner), settings: TestBed.inject(EdgeSettings) });
  const band = (s: EdgeSettings) => s.animation()?.[0];

  it('shows an empty band at the anchor straight away', () => {
    const { run, settings } = setup();
    expect(run.start({ anchor: 16, destination: 20, fps: 10 })).toBe(true);
    expect(band(settings)).toEqual({ min: 16, max: 16, color: SWEEP_COLOR });
    expect(run.running()).toBe(true);
    expect([run.frame(), run.frames()]).toEqual([1, 5]);
  });

  it('grows the upper end by one per frame at the requested fps until the destination, then stops', () => {
    const { run, settings } = setup();
    run.start({ anchor: 16, destination: 20, fps: 10 });
    const seen = [band(settings)!.max];
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(99);
      expect(band(settings)!.max).toBe(seen.at(-1));
      vi.advanceTimersByTime(1);
      seen.push(band(settings)!.max);
    }
    expect(seen).toEqual([16, 17, 18, 19, 20]);
    expect(run.running()).toBe(false);
    expect(run.frame()).toBe(5);
    vi.advanceTimersByTime(5000);
    expect(band(settings)).toEqual({ min: 16, max: 20, color: SWEEP_COLOR });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the destination frame on screen until reset, and reset restores the edited bands', () => {
    const { run, settings } = setup();
    run.start({ anchor: 0, destination: 2, fps: 60 });
    vi.advanceTimersByTime(1000);
    expect([run.active(), run.running()]).toEqual([true, false]);
    expect(settings.activeBands()).toBe(settings.animation());
    run.reset();
    expect([run.active(), run.running(), run.upper(), run.plan()]).toEqual([false, false, null, null]);
    expect(settings.animation()).toBeNull();
    expect(settings.activeBands()).toBe(settings.bands());
  });

  it('paces slow rates by the clock, one frame per second at 1 fps', () => {
    const { run, settings } = setup();
    run.start({ anchor: 5, destination: 8, fps: 1 });
    vi.advanceTimersByTime(2999);
    expect(band(settings)!.max).toBe(7);
    vi.advanceTimersByTime(1);
    expect(band(settings)!.max).toBe(8);
  });

  it('refuses inputs that cannot run and leaves what is on screen alone', () => {
    const { run, settings } = setup();
    expect(run.start({ anchor: 50, destination: 40, fps: 10 })).toBe(false);
    expect(run.start({ anchor: 1, destination: 9, fps: 0 })).toBe(false);
    expect([run.active(), settings.animation()]).toEqual([false, null]);

    run.start({ anchor: 10, destination: 30, fps: 10 });
    vi.advanceTimersByTime(300);
    const before = band(settings)!.max;
    expect(run.start({ anchor: NaN, destination: 30, fps: 10 })).toBe(false);
    expect(band(settings)!.max).toBe(before);
    vi.advanceTimersByTime(100);
    expect(band(settings)!.max).toBe(before + 1);
  });

  it('starting again replaces the run in progress', () => {
    const { run, settings } = setup();
    run.start({ anchor: 10, destination: 90, fps: 10 });
    vi.advanceTimersByTime(500);
    run.start({ anchor: 100, destination: 103, fps: 10 });
    expect(band(settings)).toEqual({ min: 100, max: 100, color: SWEEP_COLOR });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(300);
    expect(band(settings)!.max).toBe(103);
    expect(run.running()).toBe(false);
  });

  it('reset stops a run that is still playing', () => {
    const { run, settings } = setup();
    run.start({ anchor: 10, destination: 90, fps: 10 });
    run.reset();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(settings.animation()).toBeNull();
  });
});
