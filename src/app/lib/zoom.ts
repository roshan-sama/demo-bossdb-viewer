/** How far the fullscreen image is magnified, and where it sits: `x` and `y` are the pixel offset of its centre from the screen's. */
export interface View {
  zoom: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 32;
/** One press of a zoom button. */
export const ZOOM_STEP = 1.5;
export const HOME: View = { zoom: 1, x: 0, y: 0 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Keeps the magnified image covering as much of the screen as it can: it may be dragged until an edge meets the
 * screen's edge, and an image smaller than the screen on one axis stays centred on that axis.
 */
export function clampView(v: View, frame: Size, stage: Size): View {
  const zoom = clamp(v.zoom, MIN_ZOOM, MAX_ZOOM);
  const room = (img: number, screen: number) => Math.max(0, (img * zoom - screen) / 2);
  const rx = room(frame.width, stage.width);
  const ry = room(frame.height, stage.height);
  return { zoom, x: clamp(v.x, -rx, rx), y: clamp(v.y, -ry, ry) };
}

/**
 * Changes the zoom to `zoom` while the image point under (`sx`, `sy`), measured from the screen's centre, stays under it.
 * That is what makes scrolling zoom toward the cursor rather than toward the middle.
 */
export function zoomAbout(v: View, zoom: number, sx: number, sy: number, frame: Size, stage: Size): View {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const k = z / v.zoom;
  return clampView({ zoom: z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }, frame, stage);
}
