import { TestBed } from '@angular/core/testing';
import { DEFAULT_BANDS, MAX_BANDS, PREWITT_X, PREWITT_Y, SOBEL_X, SOBEL_Y } from '../lib/edges';
import { EdgeSettings } from './edge-settings';

describe('EdgeSettings', () => {
  const make = () => TestBed.inject(EdgeSettings);

  it('starts as Sobel with the four default bands', () => {
    const s = make();
    expect(s.kernelX()).toBe(SOBEL_X);
    expect(s.kernelY()).toBe(SOBEL_Y);
    expect(s.bands()).toBe(DEFAULT_BANDS);
    expect(s.preset()).toBe('Sobel');
  });

  it('applies a preset and reports Custom after a cell is edited', () => {
    const s = make();
    s.applyPreset('Prewitt');
    expect(s.kernelX()).toBe(PREWITT_X);
    expect(s.kernelY()).toBe(PREWITT_Y);
    expect(s.preset()).toBe('Prewitt');
    s.setKernelCell('x', 4, 7);
    expect(s.kernelX()[4]).toBe(7);
    expect(s.preset()).toBe('Custom');
    s.applyPreset('nope');
    expect(s.preset()).toBe('Custom');
  });

  it('edits a kernel cell without touching the other kernel, and ignores bad values', () => {
    const s = make();
    const y = s.kernelY();
    s.setKernelCell('x', 0, -5);
    expect(s.kernelX()[0]).toBe(-5);
    expect(s.kernelY()).toBe(y);
    s.setKernelCell('x', 1, NaN);
    s.setKernelCell('x', 2, Infinity);
    s.setKernelCell('x', 9, 1);
    expect(Array.from(s.kernelX())).toEqual([-5, 0, 1, -2, 0, 2, -1, 0, 1]);
  });

  it('keeps the kernel objects when only bands change', () => {
    const s = make();
    const [x, y] = [s.kernelX(), s.kernelY()];
    s.setBand(1, { color: [1, 2, 3] });
    s.addBand();
    s.removeBand(0);
    expect(s.kernelX()).toBe(x);
    expect(s.kernelY()).toBe(y);
  });

  it('edits a band range and colour, clamps min at 0, and ignores NaN', () => {
    const s = make();
    s.setBand(1, { min: 20, max: 60 });
    expect(s.bands()[1]).toMatchObject({ min: 20, max: 60 });
    s.setBand(1, { min: -5 });
    expect(s.bands()[1].min).toBe(0);
    s.setBand(1, { min: NaN });
    s.setBand(1, { max: NaN });
    expect(s.bands()[1]).toMatchObject({ min: 0, max: 60 });
    s.setBand(1, { max: Infinity, color: null });
    expect(s.bands()[1]).toMatchObject({ max: Infinity, color: null });
    expect(s.bands()[2]).toBe(DEFAULT_BANDS[2]);
  });

  it('adds bands up to the cap and removes them down to one', () => {
    const s = make();
    s.addBand();
    expect(s.bands()).toHaveLength(5);
    for (let i = 0; i < MAX_BANDS; i++) s.addBand();
    expect(s.bands()).toHaveLength(MAX_BANDS);
    expect(s.canAddBand()).toBe(false);
    for (let i = 0; i < MAX_BANDS + 3; i++) s.removeBand(0);
    expect(s.bands()).toHaveLength(1);
    expect(s.canRemoveBand()).toBe(false);
  });

  it('resets everything', () => {
    const s = make();
    s.applyPreset('Scharr');
    s.addBand();
    s.setBand(0, { max: 99 });
    s.reset();
    expect(s.kernelX()).toBe(SOBEL_X);
    expect(s.bands()).toBe(DEFAULT_BANDS);
  });
});
