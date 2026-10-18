import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MAX_FPS, MAX_SWEEP_INTENSITY, MIN_FPS, SweepInput, sweepProblems } from '../lib/edge-sweep';
import { EdgeSweepRunner } from './edge-sweep-runner';

/** A blank or unreadable entry is NaN, which the validation then rejects. */
const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

/**
 * The animated-edge-detection subtab: an anchor and a destination intensity and a frame rate. Run plays one band
 * that starts empty at the anchor and grows by one edge strength per frame until it reaches the destination.
 */
@Component({
  selector: 'app-edge-animated',
  templateUrl: './edge-animated.html',
})
export class EdgeAnimated {
  protected readonly sweep = inject(EdgeSweepRunner);
  protected readonly maxIntensity = MAX_SWEEP_INTENSITY;
  protected readonly minFps = MIN_FPS;
  protected readonly maxFps = MAX_FPS;

  // The entries stay as typed so a half-finished number never gets rewritten under the cursor.
  protected readonly anchorText = signal('16');
  protected readonly destinationText = signal('96');
  protected readonly fpsText = signal('10');

  private readonly input = computed<SweepInput>(() => ({
    anchor: parse(this.anchorText()),
    destination: parse(this.destinationText()),
    fps: parse(this.fpsText()),
  }));
  protected readonly problems = computed(() => sweepProblems(this.input()));
  protected readonly canRun = computed(() => Object.keys(this.problems()).length === 0);

  protected readonly status = computed(() => {
    const p = this.sweep.plan();
    const upper = this.sweep.upper();
    if (!p || upper === null) return '';
    const shown = `Showing edge strengths ${p.anchor} to ${upper}`;
    return this.sweep.running()
      ? `${shown} · frame ${this.sweep.frame()} of ${this.sweep.frames()}`
      : `Done: ${shown}. Reset puts the static bands back.`;
  });

  constructor() {
    // Leaving this subtab (or the tools panel) ends the sweep and brings the static bands back.
    inject(DestroyRef).onDestroy(() => this.sweep.reset());
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected start(): void {
    if (this.canRun()) this.sweep.start(this.input());
  }

  protected reset(): void {
    this.sweep.reset();
  }
}
