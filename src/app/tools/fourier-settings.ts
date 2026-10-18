import { Injectable, signal } from '@angular/core';

/** The Fourier tab's options, kept here so they survive switching tabs. */
@Injectable({ providedIn: 'root' })
export class FourierSettings {
  /** Show log(1 + magnitude) instead of the raw magnitude. */
  readonly log = signal(true);
  /** Fade the image edges to zero before the transform. */
  readonly hann = signal(true);
}
