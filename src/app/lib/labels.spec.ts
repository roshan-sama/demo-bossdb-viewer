import { labelColor, labelCounts, labelsToRgba } from './labels';

describe('labels', () => {
  it('colours ids stably and distinctly', () => {
    expect(labelColor(1)).toEqual(labelColor(1));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => labelColor(i + 1).join()));
    expect(seen.size).toBe(30);
    expect(labelColor(0)).toEqual([128, 128, 128]);
  });

  it('makes label 0 transparent unless asked', () => {
    const data = new Uint8Array([0, 2]);
    expect(Array.from(labelsToRgba(data, { showZero: false }))).toEqual([0, 0, 0, 0, ...labelColor(2), 255]);
    expect(labelsToRgba(data, { showZero: true })[3]).toBe(255);
  });

  it('handles uint64 ids', () => {
    const data = new BigUint64Array([0n, 3n, 3n]);
    const px = labelsToRgba(data, { showZero: false });
    expect(Array.from(px.slice(4, 8))).toEqual([...labelColor(3), 255]);
  });

  it('counts labels biggest first and keeps big ids exact as text', () => {
    const data = new BigUint64Array([5n, 5n, 5n, 2n, 18446744073709551615n, 2n]);
    expect(labelCounts(data, 2)).toEqual([
      { id: '5', count: 3 },
      { id: '2', count: 2 },
    ]);
    expect(labelCounts(data).at(-1)?.id).toBe('18446744073709551615');
  });
});
