import { Component, inject } from '@angular/core';
import { EdgeBand, KERNEL_PRESETS, Rgb, hexToRgb, rgbToHex } from '../lib/edges';
import { EdgeSettings } from '../viewer/edge-settings';

/** Used when a transparent band is switched back to a colour and no earlier colour is known. */
const FALLBACK_COLOR: Rgb = [147, 51, 234];

/** The edge-detection tab: the two 3x3 kernels, then the bands that decide what gets painted and in which colour. */
@Component({
  selector: 'app-edge-editor',
  templateUrl: './edge-editor.html',
})
export class EdgeEditor {
  protected readonly s = inject(EdgeSettings);
  protected readonly presets = KERNEL_PRESETS;
  protected readonly cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  /** The colour each band had before it was made transparent, so un-ticking "Transparent" brings it back. */
  private readonly lastColor = new Map<number, Rgb>();

  protected hex(i: number, b: EdgeBand): string {
    return rgbToHex(b.color ?? this.lastColor.get(i) ?? [0, 0, 0]);
  }

  /** The text for a band's "to" box: blank when it has no upper limit. */
  protected endText(b: EdgeBand): string {
    return b.max === Infinity ? '' : String(b.max);
  }

  protected cellLabel(axis: string, i: number): string {
    return `${axis} kernel, row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`;
  }

  protected onPreset(e: Event): void {
    this.s.applyPreset((e.target as HTMLSelectElement).value);
  }

  protected onCell(which: 'x' | 'y', i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    const n = el.value.trim() === '' ? NaN : Number(el.value);
    this.s.setKernelCell(which, i, n);
    // Put the real value back when the entry was rejected (blank or not a number).
    el.value = String((which === 'x' ? this.s.kernelX() : this.s.kernelY())[i]);
  }

  protected onMin(i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    this.s.setBand(i, { min: el.value.trim() === '' ? NaN : Number(el.value) });
    el.value = String(this.s.bands()[i].min);
  }

  /** A blank "to" box means no upper limit. */
  protected onMax(i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    this.s.setBand(i, { max: el.value.trim() === '' ? Infinity : Number(el.value) });
    const max = this.s.bands()[i].max;
    el.value = max === Infinity ? '' : String(max);
  }

  protected onColor(i: number, e: Event): void {
    const rgb = hexToRgb((e.target as HTMLInputElement).value);
    if (!rgb) return;
    this.lastColor.set(i, rgb);
    this.s.setBand(i, { color: rgb });
  }

  protected onTransparent(i: number, e: Event): void {
    const on = (e.target as HTMLInputElement).checked;
    const band = this.s.bands()[i];
    if (on) {
      if (band.color) this.lastColor.set(i, band.color);
      this.s.setBand(i, { color: null });
    } else {
      this.s.setBand(i, { color: this.lastColor.get(i) ?? FALLBACK_COLOR });
    }
  }

  protected add(): void {
    this.s.addBand();
  }

  protected remove(i: number): void {
    this.s.removeBand(i);
    // Remembered colours are keyed by position, which just shifted.
    this.lastColor.clear();
  }
}
