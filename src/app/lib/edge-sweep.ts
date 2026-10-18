/**
 * The animated edge-detection sweep: one band whose lower end stays at the anchor intensity while its upper
 * end starts at the anchor (so nothing is painted) and grows by one edge strength per frame until it reaches
 * the destination intensity. Intensities are edge strengths on the same 0-255 scale as the bands.
 */
import { EdgeBand, Rgb } from './edges';

/** What the sweep paints; the same purple as the default middle band. */
export const SWEEP_COLOR: Rgb = [147, 51, 234];

/** The highest anchor or destination accepted (a full step reads 255, and diagonal edges can read higher). */
export const MAX_SWEEP_INTENSITY = 1000;
export const MIN_FPS = 1;
export const MAX_FPS = 60;

export interface SweepInput {
  anchor: number;
  destination: number;
  fps: number;
}

/** A message for each input that cannot be used; an empty object means the sweep can run. */
export type SweepProblems = Partial<Record<keyof SweepInput, string>>;

const isWhole = (n: number) => Number.isInteger(n);

export function sweepProblems(i: SweepInput): SweepProblems {
  const out: SweepProblems = {};
  if (!isWhole(i.anchor) || i.anchor < 0 || i.anchor > MAX_SWEEP_INTENSITY) {
    out.anchor = `Use a whole number from 0 to ${MAX_SWEEP_INTENSITY}.`;
  }
  if (!isWhole(i.destination) || i.destination < 0 || i.destination > MAX_SWEEP_INTENSITY) {
    out.destination = `Use a whole number from 0 to ${MAX_SWEEP_INTENSITY}.`;
  } else if (!out.anchor && i.destination <= i.anchor) {
    out.destination = 'Must be greater than the anchor.';
  }
  if (!Number.isFinite(i.fps) || i.fps < MIN_FPS || i.fps > MAX_FPS) {
    out.fps = `Use a number from ${MIN_FPS} to ${MAX_FPS}.`;
  }
  return out;
}

export const canSweep = (i: SweepInput) => Object.keys(sweepProblems(i)).length === 0;

/** How many frames a sweep shows: the empty one at the anchor, then one per strength up to the destination. */
export function sweepFrameCount(anchor: number, destination: number): number {
  return destination - anchor + 1;
}

/** The band for one frame: from the anchor up to, but not including, `upper` (so `upper` = anchor paints nothing). */
export function sweepBands(anchor: number, upper: number): EdgeBand[] {
  return [{ min: anchor, max: upper, color: SWEEP_COLOR }];
}
