import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { imageSpectrum, spectrumToRgba } from '../lib/fourier';
import { SliceState } from '../viewer/slice-state';
import { FourierSettings } from './fourier-settings';

/** The Fourier-analysis tab: the magnitude spectrum of the image the slice viewer is showing. */
@Component({
  selector: 'app-fourier-analysis',
  templateUrl: './fourier-analysis.html',
})
export class FourierAnalysis {
  protected readonly s = inject(FourierSettings);
  private readonly slice = inject(SliceState);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('cv');

  /** The transform is the slow part, so it reruns for a new image or a window change; the log switch only repaints. */
  protected readonly spec = computed(() => {
    const img = this.slice.image();
    return img ? imageSpectrum(img.data, img.width, img.height, this.s.hann()) : null;
  });

  protected readonly note = computed(() => {
    const sp = this.spec();
    if (!sp) return '';
    return `${sp.cropWidth}×${sp.cropHeight} px analysed${sp.cropped ? ' (centre of a larger slice)' : ''} · ${sp.width}×${sp.height} transform`;
  });

  constructor() {
    // The canvas appears a moment after the first image arrives; paint once it exists.
    effect(() => {
      const sp = this.spec();
      const log = this.s.log();
      const cv = this.canvas()?.nativeElement;
      if (!cv || !sp) return;
      cv.width = sp.width;
      cv.height = sp.height;
      cv.getContext('2d')?.putImageData(new ImageData(spectrumToRgba(sp, log), sp.width, sp.height), 0, 0);
    });
  }

  protected onLog(e: Event): void {
    this.s.log.set((e.target as HTMLInputElement).checked);
  }

  protected onHann(e: Event): void {
    this.s.hann.set((e.target as HTMLInputElement).checked);
  }
}
