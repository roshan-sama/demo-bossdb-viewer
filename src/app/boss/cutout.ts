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

export function cutoutUrl(base: string, ref: ChannelRef, resolution: number, r: Region): string {
  const enc = [ref.collection, ref.experiment, ref.channel].map(encodeURIComponent).join('/');
  const ranges = (['x', 'y', 'z'] as Axis[]).map((a) => `${r[a][0]}:${r[a][1]}`).join('/');
  return `${base}cutout/${enc}/${resolution}/${ranges}/`;
}
