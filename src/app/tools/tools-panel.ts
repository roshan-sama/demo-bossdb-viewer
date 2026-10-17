import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { SliceState } from '../viewer/slice-state';
import { EdgeEditor } from './edge-editor';
import { FourierAnalysis } from './fourier-analysis';

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
  imports: [NgTemplateOutlet, EdgeEditor, FourierAnalysis],
  templateUrl: './tools-panel.html',
})
export class ToolsPanel {
  /** Edge detection comes first; further tabs go after it. */
  protected readonly tabs: Tab[] = [
    { id: 'edges', label: 'Edge detection' },
    { id: 'fourier', label: 'Fourier analysis' },
  ];
  protected readonly active = signal(this.tabs[0].id);
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
    const n = this.tabs.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    this.active.set(this.tabs[next].id);
    queueMicrotask(() => document.getElementById('tab-' + this.tabs[next].id)?.focus());
  }
}
