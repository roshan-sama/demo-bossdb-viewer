import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { SliceState } from '../viewer/slice-state';
import { WindowSettings } from '../viewer/window-settings';
import { EdgeTools } from './edge-tools';
import { FourierAnalysis } from './fourier-analysis';
import { tabKeyTarget } from './tab-nav';
import { WindowTools } from './window-tools';

/** Wide enough for the sidebar beside the 640px column. Keep in step with the `.layout` rule in styles.css. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

interface Tab {
  id: string;
  label: string;
}

/**
 * The tools that tune what the viewers draw. On a wide screen it is a left-hand sidebar with tabs; on a
 * narrow one the same tabs open in a modal <dialog> from a floating button. Neither is rendered until the
 * slice viewer has drawn an image, since every tool works on what it shows.
 */
@Component({
  selector: 'app-tools-panel',
  imports: [NgTemplateOutlet, EdgeTools, FourierAnalysis, WindowTools],
  templateUrl: './tools-panel.html',
})
export class ToolsPanel {
  private readonly windowSettings = inject(WindowSettings);
  /** Edge detection comes first; further tabs go after it. The intensity window only exists for blosc images. */
  protected readonly tabs = computed<Tab[]>(() => [
    { id: 'edges', label: 'Edge detection' },
    { id: 'fourier', label: 'Fourier analysis' },
    ...(this.windowSettings.info() ? [{ id: 'window', label: 'Intensity window' }] : []),
  ]);
  private readonly chosen = signal('edges');
  /** The tab on show: the chosen one, or the first when it is not offered for this channel. */
  protected readonly active = computed(() => {
    const tabs = this.tabs();
    return tabs.some((t) => t.id === this.chosen()) ? this.chosen() : tabs[0].id;
  });
  protected select(id: string): void {
    this.chosen.set(id);
  }
  protected readonly desktop = signal(true);
  /** True once the slice viewer has an image on screen. */
  protected readonly ready = inject(SliceState).ready;

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    // Without matchMedia (tests, very old browsers) the sidebar is shown.
    const mq = typeof matchMedia === 'function' ? matchMedia(DESKTOP_QUERY) : null;
    if (!mq) return;
    this.desktop.set(mq.matches);
    const onChange = (e: MediaQueryListEvent) => this.desktop.set(e.matches);
    mq.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
  }

  protected openDialog(): void {
    const d = this.dialog()?.nativeElement;
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  protected closeDialog(): void {
    const d = this.dialog()?.nativeElement;
    if (!d) return;
    if (typeof d.close === 'function') d.close();
    else d.removeAttribute('open');
  }

  /** A click on the dialog element itself (not its contents) is a click on the backdrop. */
  protected onDialogClick(e: MouseEvent): void {
    if (e.target === this.dialog()?.nativeElement) this.closeDialog();
  }

  /** Arrow keys move between tabs, as in the ARIA tabs pattern. */
  protected onTabKey(e: KeyboardEvent, i: number): void {
    const tabs = this.tabs();
    const next = tabKeyTarget(e.key, i, tabs.length);
    if (next < 0) return;
    e.preventDefault();
    this.chosen.set(tabs[next].id);
    queueMicrotask(() => document.getElementById('tab-' + tabs[next].id)?.focus());
  }
}
