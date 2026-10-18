import { Component, computed, inject } from '@angular/core';
import { WindowMode } from '../lib/windowing';
import { WindowSettings } from '../viewer/window-settings';

interface ModeChoice {
  id: WindowMode;
  label: string;
  hint: string;
}

/**
 * The intensity window for blosc images: which range of voxel values maps from black to white. Auto clips the
 * extremes so the picture has contrast, "Whole range" clips nothing, and Manual is whatever is typed.
 */
@Component({
  selector: 'app-window-tools',
  templateUrl: './window-tools.html',
})
export class WindowTools {
  protected readonly w = inject(WindowSettings);
  protected readonly modes: ModeChoice[] = [
    { id: 'auto', label: 'Auto', hint: 'Lets the darkest and brightest 0.5% of pixels clip, so a few outliers cannot flatten the picture.' },
    { id: 'full', label: 'Whole range', hint: 'Black is the smallest value in this plane and white the largest; nothing is clipped.' },
    { id: 'manual', label: 'Manual', hint: 'Choose the values shown as black and white. Anything outside them is clipped.' },
  ];

  /** Slider step: one value for small ranges, a thousandth of the plane's spread for wide ones. */
  protected readonly step = computed(() => {
    const i = this.w.info();
    return i ? Math.max(1, Math.round((i.max - i.min) / 1000)) : 1;
  });

  protected onMode(id: WindowMode): void {
    this.w.setMode(id);
  }

  protected onEnd(end: 'lo' | 'hi', e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.value.trim() === '') return;
    this.w.setManual(end, Number(el.value));
  }
}
