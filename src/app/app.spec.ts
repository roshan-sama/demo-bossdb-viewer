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

  it('shows the collection count from the API service', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('BossDB Explorer');
    expect(el.textContent).toContain('2 public collections');
  });
});
