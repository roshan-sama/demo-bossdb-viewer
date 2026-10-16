import { base64ToBytes, decodeBlosc, interpretVoxels, parseBloscHeader } from './blosc';

// Real response from api.bossdb.io for apl-team/humans/boss, res 0, x 0:4, y 0:4, z 0:4, t 0:1.
const SAMPLE =
  'AgETCEAAAABAAAAAUAAAAAgJCQkJCAkJCQkICQkJCAkUFRUVFBYVFhQWFRYUFRUVLCwpNSwsKTUsLCk1LCwpNDc2NjU2NTY1Njc2Njc2NTU=';

const EXPECTED = [
  8, 9, 9, 9, 9, 8, 9, 9, 9, 9, 8, 9, 9, 9, 8, 9,
  20, 21, 21, 21, 20, 22, 21, 22, 20, 22, 21, 22, 20, 21, 21, 21,
  44, 44, 41, 53, 44, 44, 41, 53, 44, 44, 41, 53, 44, 44, 41, 52,
  55, 54, 54, 53, 54, 53, 54, 53, 54, 55, 54, 54, 55, 54, 53, 53,
];
const region = { x: [0, 4], y: [0, 4], z: [0, 4] } as const;
const R = { x: [...region.x], y: [...region.y], z: [...region.z] } as never;

describe('blosc', () => {
  it('parses the header of the sample response', () => {
    expect(parseBloscHeader(base64ToBytes(SAMPLE))).toEqual({
      version: 2, versionLz: 1, typesize: 8, nbytes: 64, blocksize: 64, ctbytes: 80,
      shuffle: true, memcpy: true, bitshuffle: false, compressor: 'blosclz',
    });
  });

  it('rejects buffers that are not blosc', () => {
    expect(() => parseBloscHeader(new Uint8Array(4))).toThrow(/shorter/);
    expect(() => parseBloscHeader(base64ToBytes(SAMPLE).slice(0, 40))).toThrow(/Not a Blosc/);
  });

  it('decodes the sample to the 64 uint8 voxels', async () => {
    const raw = await decodeBlosc(base64ToBytes(SAMPLE));
    expect(Array.from(raw)).toEqual(EXPECTED);
    const { data, dims } = interpretVoxels(raw, 'uint8', R);
    expect(dims).toEqual([4, 4, 4]);
    expect(data).toBeInstanceOf(Uint8Array);
    // index = (z * Y + y) * X + x
    expect(data[(1 * 4 + 1) * 4 + 1]).toBe(22);
  });

  it('interprets bytes by datatype', () => {
    const r = { x: [0, 2], y: [0, 1], z: [0, 1] } as never;
    const u16 = interpretVoxels(new Uint8Array([1, 0, 0, 1]), 'uint16', r).data as Uint16Array;
    expect(Array.from(u16)).toEqual([1, 256]);
    const u64 = interpretVoxels(new Uint8Array(16).fill(0).map((_, i) => (i === 0 ? 7 : i === 8 ? 1 : 0)), 'uint64', r).data;
    expect(u64).toBeInstanceOf(BigUint64Array);
    expect(Array.from(u64 as BigUint64Array)).toEqual([7n, 1n]);
  });

  it('reports a size mismatch and unknown datatypes', () => {
    expect(() => interpretVoxels(new Uint8Array(3), 'uint8', R)).toThrow(/Expected 64/);
    expect(() => interpretVoxels(new Uint8Array(64), 'float32', R)).toThrow(/Unsupported/);
  });
});
