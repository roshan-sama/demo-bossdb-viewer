import { TestBed } from '@angular/core/testing';
import { WindowSettings } from './window-settings';

const stats = { min: 100, max: 4000, auto: { lo: 120, hi: 3900 } };

describe('WindowSettings', () => {
  function setup() {
    const w = TestBed.inject(WindowSettings);
    w.publish('uint16', stats);
    return w;
  }

  it('starts in auto mode with the window from the plane', () => {
    const w = setup();
    expect(w.mode()).toBe('auto');
    expect(w.applied()).toEqual({ lo: 120, hi: 3900 });
  });

  it('seeds the manual window from the one showing, so the picture does not jump', () => {
    const w = setup();
    w.setMode('full');
    w.setMode('manual');
    expect(w.manual()).toEqual({ lo: 100, hi: 4000 });
    expect(w.applied()).toEqual({ lo: 100, hi: 4000 });
  });

  it('ignores values that are not numbers and keeps the rest within the datatype', () => {
    const w = setup();
    w.setMode('manual');
    w.setManual('lo', NaN);
    w.setManual('hi', 1e9);
    w.setManual('lo', -5);
    expect(w.manual()).toEqual({ lo: 0, hi: 65535 });
  });

  it('has no window when no blosc plane is on screen, and resets to auto', () => {
    const w = setup();
    w.setMode('full');
    w.clear();
    expect(w.applied()).toBeNull();
    w.reset();
    expect(w.mode()).toBe('auto');
  });
});
