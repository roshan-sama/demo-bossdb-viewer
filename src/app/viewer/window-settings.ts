import { Injectable, computed, signal } from '@angular/core';
import { IntensityWindow, WindowMode, datatypeLimit, resolveWindow } from '../lib/windowing';

/** What the slice viewer tells the tools panel about the blosc plane it is showing. */
export interface WindowInfo {
  datatype: string;
  /** Smallest and largest voxel value in the plane. */
  min: number;
  max: number;
  /** The automatic window, which lets the darkest and brightest half percent clip. */
  auto: IntensityWindow;
  /** Largest value the datatype can hold. */
  limit: number;
}

/**
 * The intensity window for blosc images, shared by the tools panel (which edits it) and the slice viewer (which
 * applies it). `info` is null unless a blosc plane is on screen, which is also when the tab is offered.
 */
@Injectable({ providedIn: 'root' })
export class WindowSettings {
  readonly mode = signal<WindowMode>('auto');
  /** The hand-set window, used in manual mode. */
  readonly manual = signal<IntensityWindow>({ lo: 0, hi: 255 });
  readonly info = signal<WindowInfo | null>(null);

  /** The window currently applied to the plane on screen. */
  readonly applied = computed(() => {
    const i = this.info();
    return i ? this.resolve(i) : null;
  });

  resolve(stats: Pick<WindowInfo, 'min' | 'max' | 'auto'>): IntensityWindow {
    return resolveWindow(this.mode(), stats, this.manual());
  }

  publish(datatype: string, stats: Pick<WindowInfo, 'min' | 'max' | 'auto'>): void {
    this.info.set({ datatype, ...stats, limit: datatypeLimit(datatype) });
  }

  clear(): void {
    this.info.set(null);
  }

  /** Switching to manual starts from the window that was showing, so the picture does not jump. */
  setMode(mode: WindowMode): void {
    if (mode === 'manual' && this.mode() !== 'manual') {
      const w = this.applied();
      if (w) this.manual.set({ lo: w.lo, hi: w.hi });
    }
    this.mode.set(mode);
  }

  /** Sets one end of the manual window. Values that are not finite numbers are ignored; the rest are kept within the datatype. */
  setManual(end: 'lo' | 'hi', value: number): void {
    if (!Number.isFinite(value)) return;
    const limit = this.info()?.limit ?? Infinity;
    this.manual.update((w) => ({ ...w, [end]: Math.min(limit, Math.max(0, value)) }));
  }

  /** Back to the automatic window. */
  reset(): void {
    this.mode.set('auto');
  }
}
