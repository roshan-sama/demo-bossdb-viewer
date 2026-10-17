import { TestBed } from '@angular/core/testing';
import { DEFAULT_BANDS, PREWITT_X, SOBEL_X } from '../lib/edges';
import { EdgeSettings } from '../viewer/edge-settings';
import { EdgeEditor } from './edge-editor';

describe('EdgeEditor', () => {
  function setup() {
    const fixture = TestBed.createComponent(EdgeEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const settings = TestBed.inject(EdgeSettings);
    const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
    const bandRows = () => el.querySelectorAll('.band');
    const type = (input: HTMLInputElement, value: string, event = 'change') => {
      input.value = value;
      input.dispatchEvent(new Event(event));
      fixture.detectChanges();
    };
    return { fixture, el, settings, q, bandRows, type };
  }

  it('shows both kernels, the Sobel preset and the four default bands', () => {
    const { el, q, bandRows } = setup();
    expect(el.querySelectorAll('input.cell[aria-label^="Horizontal kernel"]')).toHaveLength(9);
    expect(el.querySelectorAll('input.cell[aria-label^="Vertical kernel"]')).toHaveLength(9);
    expect(q<HTMLSelectElement>('#edge-preset').value).toBe('Sobel');
    expect(bandRows()).toHaveLength(4);
    expect(Array.from(el.querySelectorAll<HTMLInputElement>('input.cell[aria-label^="Horizontal kernel"]')).map((i) => i.value)).toEqual(
      SOBEL_X.map(String),
    );
  });

  it('applies a preset chosen from the list', () => {
    const { fixture, settings, q } = setup();
    const sel = q<HTMLSelectElement>('#edge-preset');
    sel.value = 'Prewitt';
    sel.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.kernelX()).toBe(PREWITT_X);
    expect(sel.value).toBe('Prewitt');
  });

  it('edits a kernel cell, switches the preset to Custom, and restores the value after a rejected entry', () => {
    const { settings, q, type } = setup();
    const cell = q<HTMLInputElement>('input[aria-label="Horizontal kernel, row 2, column 3"]');
    type(cell, '5');
    expect(settings.kernelX()[5]).toBe(5);
    expect(q<HTMLSelectElement>('#edge-preset').value).toBe('Custom');
    type(cell, '');
    expect(settings.kernelX()[5]).toBe(5);
    expect(cell.value).toBe('5');
    type(cell, '-2.5');
    expect(settings.kernelX()[5]).toBe(-2.5);
  });

  it('edits a band range, treating a blank end as no limit and restoring rejected entries', () => {
    const { settings, q, type } = setup();
    const start = q<HTMLInputElement>('input[aria-label="Band 2 start"]');
    const end = q<HTMLInputElement>('input[aria-label="Band 2 end"]');
    type(start, '20');
    type(end, '70');
    expect(settings.bands()[1]).toMatchObject({ min: 20, max: 70 });
    type(start, '');
    expect(start.value).toBe('20');
    type(end, '');
    expect(settings.bands()[1].max).toBe(Infinity);
    expect(end.value).toBe('');
    expect(q<HTMLInputElement>('input[aria-label="Band 4 end"]').value).toBe('');
    type(start, '-10');
    expect(start.value).toBe('0');
  });

  it('warns about a band whose end is not above its start', () => {
    const { el, q, type } = setup();
    expect(el.querySelector('.band .err')).toBeNull();
    type(q('input[aria-label="Band 2 end"]'), '10');
    expect(el.querySelector('.band .err')?.textContent).toContain('Empty range');
  });

  it('sets a band colour from the colour picker as you drag', () => {
    const { settings, q, type } = setup();
    type(q('input[aria-label="Band 3 colour"]'), '#00ff80', 'input');
    expect(settings.bands()[2].color).toEqual([0, 255, 128]);
  });

  it('makes a band transparent and brings its colour back when un-ticked', () => {
    const { settings, el, q, fixture } = setup();
    const row = el.querySelectorAll('.band')[2];
    const box = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.bands()[2].color).toBeNull();
    expect(q<HTMLInputElement>('input[aria-label="Band 3 colour"]').disabled).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.bands()[2].color).toEqual(DEFAULT_BANDS[2].color);
    expect(q<HTMLInputElement>('input[aria-label="Band 3 colour"]').disabled).toBe(false);
  });

  it('starts a transparent default band as a colour once un-ticked', () => {
    const { settings, el, fixture } = setup();
    const box = el.querySelectorAll('.band')[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.bands()[0].color).not.toBeNull();
  });

  it('adds, removes and resets bands', () => {
    const { fixture, el, bandRows, settings } = setup();
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
    button('Add band').click();
    fixture.detectChanges();
    expect(bandRows()).toHaveLength(5);
    (el.querySelector('button[aria-label="Remove band 1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(bandRows()).toHaveLength(4);
    button('Reset to defaults').click();
    fixture.detectChanges();
    expect(bandRows()).toHaveLength(4);
    expect(settings.bands()).toBe(DEFAULT_BANDS);
  });

  it('disables Remove on the last band and Add band at the cap', () => {
    const { fixture, el, settings } = setup();
    while (settings.canAddBand()) settings.addBand();
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Add band'))!.disabled).toBe(true);
    while (settings.canRemoveBand()) settings.removeBand(0);
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="Remove band 1"]')!.disabled).toBe(true);
  });
});
