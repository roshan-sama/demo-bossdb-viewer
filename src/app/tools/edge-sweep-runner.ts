import { Injectable, computed, inject, signal } from '@angular/core';
import { SweepInput, canSweep, sweepBands, sweepFrameCount } from '../lib/edge-sweep';
import { EdgeSettings } from '../viewer/edge-settings';

/**
 * Plays the animated edge-detection sweep. A run shows one band that starts empty at the anchor intensity and
 * grows by one edge strength per frame until it reaches the destination. Each frame is handed to the slice
 * viewer through EdgeSettings.animation, which paints it in place of the edited bands; `reset` takes it away.
 */
@Injectable({ providedIn: 'root' })
export class EdgeSweepRunner {
  private readonly settings = inject(EdgeSettings);
  private timer?: ReturnType<typeof setTimeout>;

  /** The inputs of the run on screen, or null when none is. */
  readonly plan = signal<SweepInput | null>(null);
  /** The sweep band's current upper end, or null when no run is on screen. */
  readonly upper = signal<number | null>(null);
  readonly running = signal(false);
  /** True while a run is playing or its last frame is being held on screen. */
  readonly active = computed(() => this.plan() !== null);
  /** 1-based number of the frame on screen. */
  readonly frame = computed(() => {
    const p = this.plan();
    const u = this.upper();
    return p && u !== null ? u - p.anchor + 1 : 0;
  });
  readonly frames = computed(() => {
    const p = this.plan();
    return p ? sweepFrameCount(p.anchor, p.destination) : 0;
  });

  /**
   * Starts a run, replacing any run already on screen. The first frame appears at once; later frames follow at
   * `fps`, each timed from the start so the pace does not drift. Returns false, changing nothing, for inputs
   * that cannot be run.
   */
  start(input: SweepInput): boolean {
    if (!canSweep(input)) return false;
    clearTimeout(this.timer);
    this.plan.set({ ...input });
    this.running.set(true);
    const t0 = performance.now();
    const show = (n: number): void => {
      const upper = input.anchor + n;
      this.upper.set(upper);
      this.settings.animation.set(sweepBands(input.anchor, upper));
      if (upper >= input.destination) {
        this.timer = undefined;
        this.running.set(false);
        return;
      }
      const due = t0 + ((n + 1) * 1000) / input.fps;
      this.timer = setTimeout(() => show(n + 1), Math.max(0, due - performance.now()));
    };
    show(0);
    return true;
  }

  /** Stops any run and puts the edited bands back on screen. */
  reset(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.running.set(false);
    this.plan.set(null);
    this.upper.set(null);
    this.settings.animation.set(null);
  }
}
