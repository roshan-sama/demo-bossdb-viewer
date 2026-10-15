import { joinStacks, Stack } from './plane-pixels';

/** A stack whose pixel i has red channel = first + i. */
function stack(width: number, height: number, first = 0): Stack {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba[i * 4] = first + i;
  return { rgba, width, height, bytes: 0 };
}

describe('joinStacks', () => {
  it('passes an XY or XZ stack through unchanged', () => {
    const s = stack(4, 3);
    const out = joinStacks([s], { x: [0, 4], y: [0, 3], z: [9, 10] });
    expect([out.width, out.height]).toEqual([4, 3]);
    expect(out.data).toEqual(s.rgba);
  });

  it('reshapes a 1-wide YZ column into a Y-wide, Z-tall image', () => {
    // Y = 3, Z = 2: rows are y0z0, y1z0, y2z0, y0z1, y1z1, y2z1
    const out = joinStacks([stack(1, 6)], { x: [5, 6], y: [0, 3], z: [0, 2] });
    expect([out.width, out.height]).toEqual([3, 2]);
    const pixel = (y: number, z: number) => out.data[(z * out.width + y) * 4];
    expect(pixel(1, 1)).toBe(4); // y1 z1 is row 1*3+1
    expect(pixel(2, 0)).toBe(2);
  });

  it('concatenates z-chunks in order', () => {
    // Y = 2, Z = 3 split as 2 slices + 1 slice
    const out = joinStacks([stack(1, 4, 0), stack(1, 2, 4)], { x: [0, 1], y: [0, 2], z: [0, 3] });
    expect([out.width, out.height]).toEqual([2, 3]);
    expect(Array.from({ length: 6 }, (_, i) => out.data[i * 4])).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
