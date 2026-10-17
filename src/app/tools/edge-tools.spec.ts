import { TestBed } from '@angular/core/testing';
import { EdgeSettings } from '../viewer/edge-settings';
import { EdgeTools } from './edge-tools';

describe('EdgeTools', () => {
  function setup() {
    const fixture = TestBed.createComponent(EdgeTools);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tab = (id: string) => el.querySelector<HTMLElement>('#subtab-' + id)!;
    return { fixture, el, tab };
  }

  it('offers static and animated edge detection, with static selected first', () => {
    const { el, tab } = setup();
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Static edge detection', 'Animated edge detection']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(panel.id).toBe('subtabpanel-static');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('static').id);
    expect(panel.querySelector('app-edge-editor')).not.toBeNull();
    expect(el.querySelector('app-edge-animated')).toBeNull();
  });

  it('switches to the animated panel and back', () => {
    const { fixture, el, tab } = setup();
    tab('animated').click();
    fixture.detectChanges();
    expect(tab('animated').getAttribute('aria-selected')).toBe('true');
    expect(tab('animated').getAttribute('aria-controls')).toBe('subtabpanel-animated');
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(panel.id).toBe('subtabpanel-animated');
    expect(panel.querySelector('app-edge-animated')).not.toBeNull();
    expect(el.querySelector('app-edge-editor')).toBeNull();

    tab('static').click();
    fixture.detectChanges();
    expect(el.querySelector('app-edge-editor')).not.toBeNull();
    expect(el.querySelector('app-edge-animated')).toBeNull();
  });

  it('moves between the subtabs with the arrow, Home and End keys', () => {
    const { fixture, el, tab } = setup();
    const press = (key: string, from: string) => {
      tab(from).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
      return el.querySelector('[role="tabpanel"]')!.id;
    };
    expect(press('ArrowRight', 'static')).toBe('subtabpanel-animated');
    expect(press('ArrowRight', 'animated')).toBe('subtabpanel-static');
    expect(press('ArrowLeft', 'static')).toBe('subtabpanel-animated');
    expect(press('Home', 'animated')).toBe('subtabpanel-static');
    expect(press('End', 'static')).toBe('subtabpanel-animated');
    expect(press('a', 'animated')).toBe('subtabpanel-animated');
  });

  it('ends a sweep and brings the static bands back when switching to the static subtab', () => {
    const { fixture, el, tab } = setup();
    const settings = TestBed.inject(EdgeSettings);
    tab('animated').click();
    fixture.detectChanges();
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Run')!.click();
    expect(settings.animation()).not.toBeNull();
    expect(settings.activeBands()).toBe(settings.animation());

    tab('static').click();
    fixture.detectChanges();
    expect(settings.animation()).toBeNull();
    expect(settings.activeBands()).toBe(settings.bands());
  });
});
