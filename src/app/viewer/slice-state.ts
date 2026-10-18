import { Injectable, computed, signal } from '@angular/core';
import { PlanePixels } from '../lib/plane-pixels';

/**
 * What the slice viewer shares with the tools panel: the image it is showing. It is null until the viewer has
 * drawn its first image, and again while a new channel loads, so `ready` is what lets the tools switch on.
 */
@Injectable({ providedIn: 'root' })
export class SliceState {
  readonly image = signal<PlanePixels | null>(null);
  readonly ready = computed(() => this.image() !== null);

  publish(img: PlanePixels): void {
    this.image.set(img);
  }

  reset(): void {
    this.image.set(null);
  }
}
