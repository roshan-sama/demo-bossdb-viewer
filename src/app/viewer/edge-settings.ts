import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_BANDS,
  EdgeBand,
  KERNEL_PRESETS,
  Kernel3,
  MAX_BANDS,
  SOBEL_X,
  SOBEL_Y,
  appendBand,
} from '../lib/edges';

const sameKernel = (a: Kernel3, b: Kernel3) => a.every((v, i) => v === b[i]);

/**
 * The edge-detection settings shared by the tools panel (which edits them) and the slice viewer (which
 * paints from them). The kernels and the bands are separate signals so that editing a band keeps the
 * kernel objects as they were, which lets the viewer reuse its gradient magnitudes.
 */
@Injectable({ providedIn: 'root' })
export class EdgeSettings {
  readonly kernelX = signal<Kernel3>(SOBEL_X);
  readonly kernelY = signal<Kernel3>(SOBEL_Y);
  readonly bands = signal<readonly EdgeBand[]>(DEFAULT_BANDS);
  /** Bands that stand in for `bands` while an animated sweep is on screen; null when none is. */
  readonly animation = signal<readonly EdgeBand[] | null>(null);
  /** The bands the slice viewer paints: the sweep's while one is on screen, otherwise the edited ones. */
  readonly activeBands = computed(() => this.animation() ?? this.bands());

  readonly maxBands = MAX_BANDS;
  readonly canAddBand = computed(() => this.bands().length < MAX_BANDS);
  readonly canRemoveBand = computed(() => this.bands().length > 1);

  /** The preset the current kernels match, or 'Custom' once a value has been edited. */
  readonly preset = computed(
    () => KERNEL_PRESETS.find((p) => sameKernel(p.x, this.kernelX()) && sameKernel(p.y, this.kernelY()))?.name ?? 'Custom',
  );

  applyPreset(name: string): void {
    const p = KERNEL_PRESETS.find((k) => k.name === name);
    if (!p) return;
    this.kernelX.set(p.x);
    this.kernelY.set(p.y);
  }

  /** Sets one cell (0-8, row-major) of the x or y kernel; values that are not finite numbers are ignored. */
  setKernelCell(which: 'x' | 'y', index: number, value: number): void {
    if (!Number.isFinite(value) || index < 0 || index > 8) return;
    const sig = which === 'x' ? this.kernelX : this.kernelY;
    sig.update((k) => k.map((v, i) => (i === index ? value : v)) as unknown as Kernel3);
  }

  /**
   * Edits one band. `min` is kept at 0 or above; a `max` of Infinity means no upper limit. NaN is ignored
   * so a half-typed number never breaks the layer.
   */
  setBand(index: number, patch: Partial<EdgeBand>): void {
    if ((patch.min !== undefined && Number.isNaN(patch.min)) || (patch.max !== undefined && Number.isNaN(patch.max))) return;
    const clean: Partial<EdgeBand> = { ...patch };
    if (clean.min !== undefined) clean.min = Math.max(0, clean.min);
    this.bands.update((bs) => bs.map((b, i) => (i === index ? { ...b, ...clean } : b)));
  }

  addBand(): void {
    this.bands.update((bs) => appendBand(bs));
  }

  removeBand(index: number): void {
    if (!this.canRemoveBand()) return;
    this.bands.update((bs) => bs.filter((_, i) => i !== index));
  }

  reset(): void {
    this.kernelX.set(SOBEL_X);
    this.kernelY.set(SOBEL_Y);
    this.bands.set(DEFAULT_BANDS);
  }
}
