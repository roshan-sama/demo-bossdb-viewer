import { TestBed } from '@angular/core/testing';
import { SliceState } from './slice-state';

const img = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

describe('SliceState', () => {
  it('is not ready until an image is published, and not ready again after a reset', () => {
    const s = TestBed.inject(SliceState);
    expect(s.ready()).toBe(false);
    expect(s.image()).toBeNull();
    s.publish(img);
    expect(s.ready()).toBe(true);
    expect(s.image()).toBe(img);
    s.reset();
    expect(s.ready()).toBe(false);
    expect(s.image()).toBeNull();
  });
});
