import { Range, Region } from '../boss/cutout';

const div = (r: Range, k: number): Range => [Math.floor(r[0] / k), Math.ceil(r[1] / k)];

/**
 * Estimated extent at a resolution level, from the hierarchy method: isotropic halves all three
 * axes per level, anisotropic only x and y. This is a fallback for when the server's own
 * per-level extents (the `downsample` endpoint) cannot be read.
 */
export function estimateLevel(base: Region, hierarchy: string | undefined, level: number): Region {
  const k = 2 ** level;
  const iso = hierarchy?.toLowerCase() === 'isotropic';
  return { x: div(base.x, k), y: div(base.y, k), z: iso ? div(base.z, k) : base.z };
}

/**
 * Reads per-level extents from a `downsample` response, expected as `{ extent: { "0": [x, y, z], ... } }`
 * (voxel counts at each level). Returns null if the shape is not recognised or a level is missing.
 */
export function parseDownsample(json: unknown, base: Region, levels: number): Region[] | null {
  const extent = (json as { extent?: Record<string, unknown> } | null)?.extent;
  if (!extent || typeof extent !== 'object') return null;
  const out: Region[] = [];
  for (let l = 0; l < levels; l++) {
    const e = extent[String(l)];
    if (!Array.isArray(e) || e.length < 3 || e.slice(0, 3).some((n) => !Number.isFinite(n) || n <= 0)) return null;
    const stops = e.slice(0, 3) as number[];
    const axes = (['x', 'y', 'z'] as const).map((a, i) => {
      const stop0 = base[a][1] || 1;
      return [Math.floor((base[a][0] * stops[i]) / stop0), stops[i]] as Range;
    });
    out.push({ x: axes[0], y: axes[1], z: axes[2] });
  }
  return out;
}

/** How many level-0 voxels one voxel covers on each axis (powers of two), for drawing at physical proportions. */
export function levelScales(base: Region, level: Region): [number, number, number] {
  const f = (a: 'x' | 'y' | 'z') => {
    const b = base[a][1] - base[a][0];
    const l = level[a][1] - level[a][0];
    return b > 0 && l > 0 ? 2 ** Math.max(0, Math.round(Math.log2(b / l))) : 1;
  };
  return [f('x'), f('y'), f('z')];
}
