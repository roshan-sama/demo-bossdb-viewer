import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { BossApi } from './boss/boss-api.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: BossApi, useValue: { collections: () => Promise.resolve(['a', 'b']) } }],
    }).compileComponents();
  });

  it('renders the three drill-down dropdowns and loads collections', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('BossDB Data Explorer');
    // The tools panel has its own labels; this is about the explorer's three dropdowns.
    const labels = Array.from(el.querySelectorAll('app-explorer label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Collection', 'Experiment', 'Channel']);
    expect(el.textContent).toContain('2 available');
  });
});
