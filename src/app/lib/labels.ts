export type LabelData = Uint8Array | Uint16Array | BigUint64Array;

/** Distinct, colour-blind-friendly hues for the first labels (Okabe-Ito order, then generated). */
const PALETTE: [number, number, number][] = [
  [230, 159, 0],
  [86, 180, 233],
  [0, 158, 115],
  [240, 228, 66],
  [0, 114, 178],
  [213, 94, 0],
  [204, 121, 167],
  [153, 153, 153],
];

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** A stable colour for a label id. Id 0 is neutral grey; small ids use the palette, larger ones spread by golden angle. */
export function labelColor(id: number): [number, number, number] {
  if (id === 0) return [128, 128, 128];
  if (id <= PALETTE.length) return PALETTE[id - 1];
  return hsl((id * 137.508) % 360, 0.7, 0.55);
}

/** RGBA pixels for a label plane: label 0 is transparent unless `showZero`, everything else is opaque. */
export function labelsToRgba(data: LabelData, opts: { showZero: boolean }): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data.length * 4);
  const cache = new Map<number | bigint, [number, number, number]>();
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!v && !opts.showZero) continue;
    let c = cache.get(v);
    if (!c) cache.set(v, (c = labelColor(Number(v))));
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export interface LabelCount {
  /** The id as text, so uint64 values above 2^53 stay exact. */
  id: string;
  count: number;
}

/** The most common labels in a plane, biggest first. */
export function labelCounts(data: LabelData, max = 12): LabelCount[] {
  const counts = new Map<number | bigint, number>();
  for (let i = 0; i < data.length; i++) counts.set(data[i], (counts.get(data[i]) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id, count]) => ({ id: id.toString(), count }));
}
