import { Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';

let nextId = 0;
const MAX_SHOWN = 100;

/** Searchable single-select dropdown (ARIA combobox with a listbox popup). */
@Component({
  selector: 'app-combobox',
  templateUrl: './combobox.html',
  host: { '(document:pointerdown)': 'outside($event)' },
})
export class Combobox {
  readonly label = input.required<string>();
  readonly items = input<string[]>([]);
  readonly selected = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly error = input('');

  readonly chosen = output<string>();
  readonly retry = output<void>();

  protected readonly id = 'cb' + nextId++;
  protected readonly text = signal('');
  protected readonly typing = signal(false);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly term = computed(() => (this.typing() ? this.text().trim().toLowerCase() : ''));
  protected readonly hits = computed(() => {
    const t = this.term();
    return t ? this.items().filter((n) => n.toLowerCase().includes(t)) : this.items();
  });
  protected readonly shown = computed(() => this.hits().slice(0, MAX_SHOWN));
  protected readonly more = computed(() => Math.max(0, this.hits().length - MAX_SHOWN));
  protected readonly inactive = computed(
    () => this.disabled() || this.loading() || !!this.error() || !this.items().length,
  );
  protected readonly meta = computed(() => {
    if (this.loading()) return 'Loading…';
    if (!this.items().length) return '';
    return this.typing() ? `${this.hits().length} of ${this.items().length}` : `${this.items().length} available`;
  });

  constructor() {
    // Show whatever the parent says is selected (also covers resets and restores from the URL).
    effect(() => {
      this.text.set(this.selected());
      this.typing.set(false);
    });
  }

  /** Splits a name around the search term so the match can be highlighted. */
  protected parts(name: string): [string, string, string] {
    const t = this.term();
    const i = t ? name.toLowerCase().indexOf(t) : -1;
    return i < 0 ? [name, '', ''] : [name.slice(0, i), name.slice(i, i + t.length), name.slice(i + t.length)];
  }

  protected onInput(e: Event): void {
    this.text.set((e.target as HTMLInputElement).value);
    this.typing.set(true);
    this.active.set(-1);
    this.open.set(true);
  }

  protected onFocus(e: FocusEvent): void {
    if (this.inactive()) return;
    (e.target as HTMLInputElement).select();
    this.typing.set(false);
    this.open.set(true);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.shown().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.open.set(true);
        if (n) this.moveTo((this.active() + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.open.set(true);
        if (n) this.moveTo(this.active() < 0 ? n - 1 : (this.active() - 1 + n) % n);
        break;
      case 'Enter': {
        const name = this.shown()[this.active()];
        if (name) {
          e.preventDefault();
          this.pick(name);
        }
        break;
      }
      case 'Escape':
        this.cancel();
        break;
    }
  }

  protected choose(e: Event, name: string): void {
    e.preventDefault(); // keep focus in the input
    this.pick(name);
  }

  outside(e: Event): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.cancel();
  }

  private moveTo(i: number): void {
    this.active.set(i);
    queueMicrotask(() => document.getElementById(`${this.id}-o${i}`)?.scrollIntoView?.({ block: 'nearest' }));
  }

  private pick(name: string): void {
    this.text.set(name);
    this.typing.set(false);
    this.open.set(false);
    this.active.set(-1);
    this.chosen.emit(name);
  }

  private cancel(): void {
    this.open.set(false);
    this.active.set(-1);
    this.typing.set(false);
    this.text.set(this.selected());
  }
}
