import { ChannelRef, CoordFrame, Plane } from './boss.models';

export type Axis = 'x' | 'y' | 'z';
export type Range = [number, number]; // half-open [start, stop)
export type Region = Record<Axis, Range>;

/** [horizontal, vertical, fixed] axis for each viewing plane. */
export const PLANE_AXES: Record<Plane, [Axis, Axis, Axis]> = {
  xy: ['x', 'y', 'z'],
  xz: ['x', 'z', 'y'],
  yz: ['y', 'z', 'x'],
};

export function extentOf(c: CoordFrame): Region {
  return { x: [c.x_start, c.x_stop], y: [c.y_start, c.y_stop], z: [c.z_start, c.z_stop] };
}

/** A window of at most `size` voxels, centred inside `extent`. */
export function centeredWindow(extent: Range, size: number): Range {
  const n = extent[1] - extent[0];
  const m = Math.min(size, n);
  const o = extent[0] + Math.floor((n - m) / 2);
  return [o, o + m];
}

/** The one-voxel-thick region that renders as a 2D image for a plane. */
export function planeRegion(extent: Region, plane: Plane, fixedPos: number, size: number): Region {
  const [h, v, f] = PLANE_AXES[plane];
  return {
    [h]: centeredWindow(extent[h], size),
    [v]: centeredWindow(extent[v], size),
    [f]: [fixedPos, fixedPos + 1],
  } as Region;
}

/** A window of at most `size` voxels starting at `start`, clamped inside `extent`. */
export function windowAt(extent: Range, start: number, size: number): Range {
  const s = Math.min(Math.max(Math.floor(start), extent[0]), extent[1] - 1);
  return [s, Math.min(s + size, extent[1])];
}

/** Like planeRegion, but starting at chosen corner coordinates; a missing start keeps that side centred. */
export function planeRegionAt(
  extent: Region,
  plane: Plane,
  fixedPos: number,
  size: number,
  starts: { h?: number | null; v?: number | null },
): Region {
  const [h, v, f] = PLANE_AXES[plane];
  return {
    [h]: starts.h == null ? centeredWindow(extent[h], size) : windowAt(extent[h], starts.h, size),
    [v]: starts.v == null ? centeredWindow(extent[v], size) : windowAt(extent[v], starts.v, size),
    [f]: [fixedPos, fixedPos + 1],
  } as Region;
}

export function cutoutUrl(base: string, ref: ChannelRef, resolution: number, r: Region, time?: Range): string {
  const enc = [ref.collection, ref.experiment, ref.channel].map(encodeURIComponent).join('/');
  const parts = (['x', 'y', 'z'] as Axis[]).map((a) => `${r[a][0]}:${r[a][1]}`);
  if (time) parts.push(`${time[0]}:${time[1]}`);
  return `${base}cutout/${enc}/${resolution}/${parts.join('/')}/`;
}

/**
 * Boss JPEG cutouts stack the z-slices vertically: the image is X wide and (Y * Z) tall,
 * with row r = z * Y + y. JPEG caps a side at 65,535 px; we stay far below that so every
 * browser canvas can decode a stack.
 */
export const MAX_STACK_PX = 16_000;

const len = (r: Range) => r[1] - r[0];

/** Split a region along z so each request's stacked image is at most `maxPx` tall. */
export function splitForJpeg(r: Region, maxPx = MAX_STACK_PX): Region[] {
  const perChunk = Math.max(1, Math.floor(maxPx / len(r.y)));
  const out: Region[] = [];
  for (let z = r.z[0]; z < r.z[1]; z += perChunk) {
    out.push({ ...r, z: [z, Math.min(z + perChunk, r.z[1])] });
  }
  return out;
}

/** A cube of `side` voxels centred in the extent (smaller where the extent is smaller). */
export function volumeCenter(extent: Region, side: number): Region {
  return { x: centeredWindow(extent.x, side), y: centeredWindow(extent.y, side), z: centeredWindow(extent.z, side) };
}
