import { TestBed } from '@angular/core/testing';
import { Combobox } from './combobox';

async function setup(items = ['alpha', 'beta', 'alphabet']) {
  const fixture = TestBed.createComponent(Combobox);
  fixture.componentRef.setInput('label', 'Collection');
  fixture.componentRef.setInput('items', items);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  return { fixture, el, input };
}

describe('Combobox', () => {
  it('filters the list as the user types', async () => {
    const { fixture, el, input } = await setup();
    input.value = 'alp';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const options = Array.from(el.querySelectorAll('[role=option]')).map((o) => o.textContent);
    expect(options).toEqual(['alpha', 'alphabet']);
  });

  it('emits the highlighted item on Enter', async () => {
    const { fixture, input } = await setup();
    const picked: string[] = [];
    fixture.componentInstance.chosen.subscribe((v) => picked.push(v));
    input.value = 'bet';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    // 'bet' matches [beta, alphabet]; two ArrowDowns highlight the second hit.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(picked).toEqual(['alphabet']);
  });

  it('is disabled while loading and shows the error with a retry button', async () => {
    const { fixture, el, input } = await setup();
    fixture.componentRef.setInput('error', 'HTTP 500');
    await fixture.whenStable();
    expect(input.disabled).toBe(true);
    expect(el.querySelector('.meta')?.textContent).toContain('HTTP 500');
    expect(el.querySelector('button')?.textContent).toContain('Retry');
  });
});
