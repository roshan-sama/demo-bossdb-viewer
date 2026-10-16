import { Region } from '../boss/cutout';

const COMPRESSORS = ['blosclz', 'lz4', 'snappy', 'zlib', 'zstd'];

/** The 16-byte header every Blosc buffer starts with (little endian). */
export interface BloscHeader {
  version: number;
  versionLz: number;
  typesize: number;
  /** Size of the decoded data in bytes. */
  nbytes: number;
  blocksize: number;
  /** Size of the whole compressed buffer, header included. */
  ctbytes: number;
  shuffle: boolean;
  bitshuffle: boolean;
  /** True when the payload is stored raw (Blosc does this for tiny buffers). */
  memcpy: boolean;
  compressor: string;
}

export const BLOSC_HEADER_BYTES = 16;

export function parseBloscHeader(b: Uint8Array): BloscHeader {
  if (b.length < BLOSC_HEADER_BYTES) throw new Error(`Not a Blosc buffer: ${b.length} bytes is shorter than the header`);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const flags = b[2];
  const h: BloscHeader = {
    version: b[0],
    versionLz: b[1],
    typesize: b[3],
    nbytes: v.getUint32(4, true),
    blocksize: v.getUint32(8, true),
    ctbytes: v.getUint32(12, true),
    shuffle: (flags & 0x1) !== 0,
    memcpy: (flags & 0x2) !== 0,
    bitshuffle: (flags & 0x4) !== 0,
    compressor: COMPRESSORS[(flags >> 5) & 0x7] ?? 'unknown',
  };
  if (h.version < 1 || h.version > 2 || h.ctbytes !== b.length) {
    throw new Error(`Not a Blosc buffer (version ${h.version}, header says ${h.ctbytes} bytes, got ${b.length})`);
  }
  return h;
}

export type VoxelArray = Uint8Array | Uint16Array | BigUint64Array;

const BYTES: Record<string, number> = { uint8: 1, uint16: 2, uint64: 8 };

export const isKnownDatatype = (dt: string | undefined): dt is string => !!dt && dt in BYTES;

export interface Block {
  data: VoxelArray;
  /** [X, Y, Z]. The array is C order (z, y, x): index = (z * Y + y) * X + x. */
  dims: [number, number, number];
}

/**
 * Decode a Blosc buffer. The numcodecs WASM codec is about 600 kB, so it is only fetched
 * when a blosc request is actually made.
 */
export async function decodeBlosc(bytes: Uint8Array): Promise<Uint8Array> {
  parseBloscHeader(bytes); // fail early with a readable message
  const { default: Blosc } = await import('numcodecs/blosc');
  const codec = Blosc.fromConfig({ id: 'blosc' });
  return await codec.decode(bytes);
}

/** Reinterpret decoded bytes as typed voxels for a region. Assumes a little-endian host. */
export function interpretVoxels(raw: Uint8Array, datatype: string, region: Region): Block {
  const size = BYTES[datatype];
  if (!size) throw new Error(`Unsupported datatype "${datatype}"`);
  const dims: [number, number, number] = [
    region.x[1] - region.x[0],
    region.y[1] - region.y[0],
    region.z[1] - region.z[0],
  ];
  const voxels = dims[0] * dims[1] * dims[2];
  if (raw.length !== voxels * size) {
    throw new Error(`Expected ${voxels * size} bytes for ${dims.join('×')} ${datatype}, decoded ${raw.length}`);
  }
  // Copy so the typed array is aligned whatever byteOffset the decoder returned.
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const data = size === 1 ? new Uint8Array(buf) : size === 2 ? new Uint16Array(buf) : new BigUint64Array(buf);
  return { data, dims };
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
