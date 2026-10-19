import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { ChannelRef, CoordFrame, Overlay, Plane } from '../boss/boss.models';
import { Axis, PLANE_AXES, Range, Region, centeredWindow, cutoutUrl, extentOf, planeRegionAt, splitForJpeg } from '../boss/cutout';
import { VoxelArray, decodeBlosc, interpretVoxels } from '../lib/blosc';
import { SliceFormat } from '../lib/capabilities';
import { Kernel3, bandLevels, edgesToRgba, imageMagnitudes } from '../lib/edges';
import { labelText, schemeFor } from '../lib/label-names';
import { LabelData, labelColor, labelCounts, labelsToRgba } from '../lib/labels';
import { estimateLevel, levelScales, parseDownsample } from '../lib/levels';
import { Lru } from '../lib/lru';
import { HOME, MAX_ZOOM, MIN_ZOOM, View, ZOOM_STEP, clampView, zoomAbout } from '../lib/zoom';
import { PlanePixels, Stack, joinStacks } from '../lib/plane-pixels';
import { mapLimit } from '../lib/pool';
import { IntensityWindow, PlaneStats, planeStats, windowToGrey } from '../lib/windowing';
import { WindowSettings } from './window-settings';
import { EdgeSettings } from './edge-settings';
import { SliceState } from './slice-state';

const MAX_PARALLEL = 6;

/** One decoded label plane: row-major, `width` wide, in the same orientation as the image. */
interface LabelPlane {
  data: LabelData;
  width: number;
  height: number;
  region: Region;
  axes: [Axis, Axis];
}

/** The base image for one draw, however it was fetched. */
interface Loaded {
  img: PlanePixels;
  /** Bytes on the wire (compressed). */
  bytes: number;
  requests: number;
  /** True when nothing had to be fetched. */
  cached: boolean;
  /** Extra detail for the status line, such as the intensity window of a blosc image. */
  note: string;
  /** For blosc images, the voxels behind `img`, so the window can change without a fetch. */
  plane?: BloscPlane;
}

/** A decoded blosc plane. The grey picture is made from it on demand, because the window is the viewer's to change. */
interface BloscPlane {
  data: VoxelArray;
  width: number;
  height: number;
  stats: PlaneStats;
  datatype: string;
  bytes: number;
}

const middle = (r: Range) => Math.floor((r[0] + r[1]) / 2);
const span = (r: Range) => r[1] - r[0];
/** Window ends are voxel values: whole numbers for integer data, so drop any fractional noise from binning. */
const shown = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Draws one cutout at a time to a canvas; debounces the slider and cancels superseded requests. uint8 images are
 * fetched as JPEG; other image channels, which the Boss will not serve as JPEG, are fetched as blosc.
 */
@Component({
  selector: 'app-slice-viewer',
  templateUrl: './slice-viewer.html',
})
export class SliceViewer {
  readonly ref = input.required<ChannelRef>();
  readonly coord = input.required<CoordFrame>();
  /** An optional annotation channel drawn over the image. */
  readonly overlay = input<Overlay | null>(null);
  /** Number of resolution levels (the experiment's num_hierarchy_levels). */
  readonly levels = input(1);
  /** The experiment's hierarchy method, used to estimate level sizes if the server's cannot be read. */
  readonly hierarchy = input<string | undefined>();
  /** How to fetch the image: JPEG for uint8 channels (the default), otherwise blosc. */
  readonly format = input<SliceFormat>('jpeg');
  /** The channel's datatype, lower case. Only blosc needs it, to read the voxels. */
  readonly datatype = input('');

  private readonly api = inject(BossApi);
  private readonly edgeSettings = inject(EdgeSettings);
  /** Tells the tools panel when an image is on screen (it stays locked until then). */
  private readonly sliceState = inject(SliceState);
  private readonly windowSettings = inject(WindowSettings);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly overlayCanvas = viewChild<ElementRef<HTMLCanvasElement>>('ov');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly fsDialog = viewChild.required<ElementRef<HTMLDialogElement>>('fs');
  private readonly edgeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('ed');

  protected readonly planes: Plane[] = ['xy', 'xz', 'yz'];
  protected readonly sizes = [256, 512, 1024, 2048];
  protected readonly plane = signal<Plane>('xy');
  protected readonly size = signal(512);
  protected readonly level = signal(0);
  protected readonly pos = signal<Record<Axis, number>>({ x: 0, y: 0, z: 0 });
  /** Chosen window corner on the horizontal and vertical axes; null keeps that side centred. */
  protected readonly origin = signal<{ h: number | null; v: number | null }>({ h: null, v: null });
  protected readonly aspect = signal('1 / 1');
  /** `aspect` as a number, for the fullscreen sizing in CSS. */
  protected readonly ratio = computed(() => {
    const [w, h] = this.aspect().split('/').map(Number);
    return w > 0 && h > 0 ? w / h : 1;
  });
  /** Fullscreen fit: `cover` fills the screen and crops the overflow; `contain` shows the whole image. */
  protected readonly fit = signal<'cover' | 'contain'>('cover');
  /** Magnification and position of the image in the fullscreen dialog. */
  protected readonly view = signal<View>(HOME);
  protected readonly zoomLabel = computed(() => `${Math.round(this.view().zoom * 100)}%`);
  protected readonly dragging = signal(false);
  protected readonly minZoom = MIN_ZOOM;
  protected readonly maxZoom = MAX_ZOOM;
  protected readonly zoomStep = ZOOM_STEP;
  /** Pointers currently down on the stage: one drags, two pinch. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  protected readonly status = signal({ text: '', warn: '', url: '', error: false });
  protected readonly opacity = signal(0.6);
  protected readonly showZero = signal(false);
  /** The edge-detection layer: computed from the image already on screen, so it needs no extra request. */
  protected readonly showEdges = signal(false);
  protected readonly edgeOpacity = signal(0.8);
  protected readonly overlayStatus = signal({ text: '', error: false });
  protected readonly legend = signal<{ id: string; label: string; px: string; color: string }[]>([]);
  protected readonly hover = signal('');
  protected readonly extentNote = signal('');

  /** Per-level extents from the server, once loaded. */
  private readonly serverExtents = signal<Region[] | null>(null);

  protected readonly levelList = computed(() => Array.from({ length: Math.max(1, this.levels()) }, (_, i) => i));
  /** The volume extent at the chosen resolution level. */
  protected readonly extent = computed<Region>(() => {
    const base = extentOf(this.coord());
    const l = this.level();
    return l === 0 ? base : (this.serverExtents()?.[l] ?? estimateLevel(base, this.hierarchy(), l));
  });
  protected readonly axes = computed(() => PLANE_AXES[this.plane()]);
  protected readonly fixedAxis = computed(() => this.axes()[2]);
  protected readonly range = computed(() => this.extent()[this.fixedAxis()]);
  protected readonly fixedPos = computed(() => this.pos()[this.fixedAxis()]);
  protected readonly starts = computed(() => {
    const [h, v] = this.axes();
    const ext = this.extent();
    const o = this.origin();
    return [
      { axis: h, value: o.h ?? centeredWindow(ext[h], this.size())[0], min: ext[h][0], max: ext[h][1] - 1 },
      { axis: v, value: o.v ?? centeredWindow(ext[v], this.size())[0], min: ext[v][0], max: ext[v][1] - 1 },
    ];
  });
  private readonly scheme = computed(() => (this.overlay() ? schemeFor(this.overlay()!.ref) : undefined));
  protected readonly schemeSource = computed(() => this.scheme()?.source ?? '');
  protected readonly description = computed(() => this.overlay()?.description ?? '');

  private readonly cache = new Lru<Stack>(60);
  /** Decoded blosc planes by URL (raw voxels, so a new window needs no fetch). */
  private readonly bloscCache = new Lru<BloscPlane>(10);
  /** The blosc plane on screen, if any, and the status text before its window note. */
  private bloscPlane?: BloscPlane;
  private statusHead = '';
  private readonly labelCache = new Lru<LabelPlane>(20);
  private labels?: LabelPlane;
  /** The image currently drawn on the base canvas; the edge layer is derived from it. */
  private base?: PlanePixels;
  /** Gradient magnitudes of `base` for one pair of kernels; band and colour edits reuse them. */
  private magnitudes?: { img: PlanePixels; kx: Kernel3; ky: Kernel3; data: Float32Array };
  private seq = 0;
  private ctl?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    // A new channel (or coordinate frame) starts at the full-resolution middle of the volume, and the tools
    // lock again until its first image has been drawn.
    effect(() => {
      const ref = this.ref();
      this.coord();
      untracked(() => {
        this.sliceState.reset();
        this.bloscPlane = undefined;
        this.windowSettings.clear();
        this.level.set(0);
        this.origin.set({ h: null, v: null });
        this.recentre();
        void this.loadLevels(ref);
        this.schedule(0);
      });
    });
    // Choosing or clearing an overlay redraws; the base image comes from the cache.
    effect(() => {
      this.overlay();
      untracked(() => this.schedule(0));
    });
    // A different way of fetching the image means a different picture.
    effect(() => {
      this.format();
      this.datatype();
      untracked(() => this.schedule(0));
    });
    // A new window for the blosc plane on screen redraws it from the voxels already loaded.
    effect(() => {
      this.windowSettings.mode();
      this.windowSettings.manual();
      untracked(() => this.rewindow());
    });
    // Toggling label 0 repaints the labels already loaded.
    effect(() => {
      this.showZero();
      untracked(() => this.paintLabels());
    });
    // The overlay canvas appears a moment after an overlay is chosen; paint once it exists.
    effect(() => {
      this.overlayCanvas();
      untracked(() => this.paintLabels());
    });
    // Toggling edges computes or clears the edge layer from the image already loaded.
    effect(() => {
      this.showEdges();
      untracked(() => this.paintEdges());
    });
    // Editing the kernels or bands in the tools panel, or a frame of an animated sweep, repaints the edge layer.
    effect(() => {
      this.edgeSettings.kernelX();
      this.edgeSettings.kernelY();
      this.edgeSettings.activeBands();
      untracked(() => this.paintEdges());
    });
    // The edge canvas appears a moment after the toggle is switched on; paint once it exists.
    effect(() => {
      this.edgeCanvas();
      untracked(() => this.paintEdges());
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.ctl?.abort();
      this.sliceState.reset();
    });
  }

  private recentre(): void {
    const e = this.extent();
    this.pos.set({ x: middle(e.x), y: middle(e.y), z: middle(e.z) });
  }

  /** Asks the server for each level's size; falls back to an estimate from the hierarchy method. */
  private async loadLevels(ref: ChannelRef): Promise<void> {
    this.serverExtents.set(null);
    this.extentNote.set('');
    if (this.levels() <= 1) return;
    try {
      const parsed = parseDownsample(await this.api.downsample(ref), extentOf(this.coord()), this.levels());
      if (ref !== this.ref()) return;
      if (parsed) {
        this.serverExtents.set(parsed);
        if (this.level() > 0) this.schedule(0);
      } else {
        this.extentNote.set('Level sizes are estimated from the hierarchy method.');
      }
    } catch {
      if (ref === this.ref()) this.extentNote.set('Level sizes are estimated from the hierarchy method.');
    }
  }

  protected setPlane(p: Plane): void {
    this.plane.set(p);
    this.origin.set({ h: null, v: null });
    this.schedule(0);
  }

  protected setSize(e: Event): void {
    this.size.set(+(e.target as HTMLSelectElement).value);
    this.schedule(0);
  }

  protected setLevel(e: Event): void {
    this.level.set(+(e.target as HTMLSelectElement).value);
    this.origin.set({ h: null, v: null });
    this.recentre();
    this.schedule(0);
  }

  protected onStart(which: 'h' | 'v', e: Event): void {
    const input = e.target as HTMLInputElement;
    const n = Number.parseInt(input.value, 10);
    if (!Number.isFinite(n)) return;
    this.origin.update((o) => ({ ...o, [which]: n }));
    this.schedule(0);
  }

  protected centre(): void {
    this.origin.set({ h: null, v: null });
    this.schedule(0);
  }

  protected onSlide(e: Event): void {
    const v = +(e.target as HTMLInputElement).value;
    const a = this.fixedAxis();
    this.pos.update((p) => ({ ...p, [a]: v }));
    this.schedule(60);
  }

  protected onOpacity(e: Event): void {
    this.opacity.set(+(e.target as HTMLInputElement).value);
  }

  protected onShowZero(e: Event): void {
    this.showZero.set((e.target as HTMLInputElement).checked);
  }

  protected onEdgeOpacity(e: Event): void {
    this.edgeOpacity.set(+(e.target as HTMLInputElement).value);
  }

  protected onShowEdges(e: Event): void {
    this.showEdges.set((e.target as HTMLInputElement).checked);
  }

  protected onHover(e: MouseEvent): void {
    const p = this.labels;
    const cv = this.overlayCanvas()?.nativeElement;
    if (!p || !cv) return;
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * p.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * p.height);
    if (x < 0 || y < 0 || x >= p.width || y >= p.height) return this.hover.set('');
    const [h, v] = p.axes;
    const id = p.data[y * p.width + x].toString();
    const name = labelText(this.scheme(), id);
    this.hover.set(`${h}=${p.region[h][0] + x}, ${v}=${p.region[v][0] + y} · label ${id}${name ? ` · ${name}` : ''}`);
  }

  /**
   * The layered canvases move into the dialog while it is open (a canvas keeps its pixels when moved), so
   * hover, opacity and the edge layer keep working with no second set to paint.
   */
  protected openFullscreen(): void {
    const d = this.fsDialog().nativeElement;
    if (d.open) return;
    this.view.set(HOME);
    this.stage().nativeElement.appendChild(this.frame().nativeElement);
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  protected closeFullscreen(): void {
    const d = this.fsDialog().nativeElement;
    if (typeof d.close === 'function') d.close();
    else {
      d.removeAttribute('open');
      this.onFullscreenClosed();
    }
  }

  /** Runs for every way of closing (button, Escape, backdrop) and puts the image back in the page. */
  protected onFullscreenClosed(): void {
    const frame = this.frame().nativeElement;
    const host = this.host().nativeElement;
    if (frame.parentElement !== host) host.appendChild(frame);
    this.view.set(HOME);
    this.pointers.clear();
    this.dragging.set(false);
  }

  protected onFullscreenClick(e: MouseEvent): void {
    if (e.target === this.fsDialog().nativeElement) this.closeFullscreen();
  }

  protected toggleFit(): void {
    this.fit.update((f) => (f === 'cover' ? 'contain' : 'cover'));
    this.view.set(HOME); // the image changes size, so the old position no longer means anything
  }

  protected onFullscreenKey(e: KeyboardEvent): void {
    if (e.key === '+' || e.key === '=') this.zoomBy(ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / ZOOM_STEP);
    else if (e.key === '0') this.resetZoom();
    else return;
    e.preventDefault();
  }

  protected resetZoom(): void {
    this.view.set(HOME);
  }

  /** The zoom buttons magnify about the middle of the screen. */
  protected zoomBy(factor: number): void {
    this.view.update((v) => zoomAbout(v, v.zoom * factor, 0, 0, this.frameSize(), this.stageSize()));
  }

  /** Scrolling zooms toward the cursor; a notch is about 20%. */
  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const [sx, sy] = this.fromCentre(e.clientX, e.clientY);
    this.view.update((v) => zoomAbout(v, v.zoom * Math.exp(-e.deltaY * unit * 0.002), sx, sy, this.frameSize(), this.stageSize()));
  }

  protected onPointerDown(e: PointerEvent): void {
    try {
      this.stage().nativeElement.setPointerCapture?.(e.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; dragging still works without.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging.set(this.view().zoom > 1);
  }

  /** One pointer drags the image; two pinch it, zooming about the point between them. */
  protected onPointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    const others = [...this.pointers].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    this.pointers.set(e.pointerId, next);
    if (others.length === 1) {
      const o = others[0];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(next.x - o.x, next.y - o.y);
      if (before > 0 && after > 0) {
        const [sx, sy] = this.fromCentre((next.x + o.x) / 2, (next.y + o.y) / 2);
        this.view.update((v) => zoomAbout(v, v.zoom * (after / before), sx, sy, this.frameSize(), this.stageSize()));
      }
    } else if (others.length === 0 && this.view().zoom > 1) {
      this.view.update((v) => clampView({ ...v, x: v.x + next.x - prev.x, y: v.y + next.y - prev.y }, this.frameSize(), this.stageSize()));
    }
  }

  protected onPointerEnd(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.dragging.set(false);
  }

  private stageSize() {
    const s = this.stage().nativeElement;
    return { width: s.clientWidth, height: s.clientHeight };
  }

  /** The image's layout size, which a CSS transform does not change. */
  private frameSize() {
    const f = this.frame().nativeElement;
    return { width: f.offsetWidth, height: f.offsetHeight };
  }

  /** A screen position as an offset from the middle of the stage. */
  private fromCentre(clientX: number, clientY: number): [number, number] {
    const r = this.stage().nativeElement.getBoundingClientRect();
    return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)];
  }

  protected onLeave(): void {
    this.hover.set('');
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.draw(), ms);
  }

  private async draw(): Promise<void> {
    const coord = this.coord();
    const plane = this.plane();
    const level = this.level();
    const ext = this.extent();
    const [h, v, f] = PLANE_AXES[plane];
    const fixed = Math.min(Math.max(this.pos()[f], ext[f][0]), ext[f][1] - 1);
    const region = planeRegionAt(ext, plane, fixed, this.size(), this.origin());
    // Blosc is one request for any plane. A YZ plane stacks Y*Z rows into one JPEG, so tall JPEG requests
    // are split along z (see splitForJpeg).
    const blosc = this.format() === 'blosc';
    const chunks = blosc
      ? [cutoutUrl(this.api.base, this.ref(), level, region, [0, 1])]
      : splitForJpeg(region).map((r) => cutoutUrl(this.api.base, this.ref(), level, r));
    const shownUrl = chunks.length > 1 ? `${chunks[0]} (+${chunks.length - 1} more)` : chunks[0];

    const id = ++this.seq;
    this.ctl?.abort();
    const ctl = (this.ctl = new AbortController());
    const t0 = performance.now();
    this.status.set({ text: 'Loading…', warn: '', url: shownUrl, error: false });

    try {
      const loaded = blosc
        ? await this.loadBlosc(chunks[0], region, [h, v], ctl.signal)
        : await this.loadJpeg(chunks, region, ctl.signal);
      if (id !== this.seq) return;

      const { img } = loaded;
      this.show(img);
      this.bloscPlane = loaded.plane;
      if (loaded.plane) this.windowSettings.publish(loaded.plane.datatype, loaded.plane.stats);
      else this.windowSettings.clear();

      // Show the image at its physical proportions (voxels are rarely cubic in EM data, and coarser
      // levels make voxels bigger on the axes they are downsampled along).
      const scales = levelScales(extentOf(coord), ext);
      const idx = (a: Axis) => ['x', 'y', 'z'].indexOf(a);
      const size = (a: Axis) => (coord[`${a}_voxel_size` as `${Axis}_voxel_size`] || 1) * scales[idx(a)];
      this.aspect.set(`${img.width * size(h)} / ${img.height * size(v)}`);

      void this.drawOverlay(region, [h, v], level, id, ctl.signal);
      const ew = region[h][1] - region[h][0];
      const eh = region[v][1] - region[v][0];
      const ms = Math.round(performance.now() - t0);
      const kb = loaded.bytes / 1024;
      const reqs = `${loaded.requests} request${loaded.requests > 1 ? 's' : ''}`;
      this.statusHead = `${img.width}×${img.height} px · ${kb.toFixed(0)} KB · ${ms} ms · ${reqs}${loaded.cached ? ' (cached)' : ''}`;
      this.status.set({
        text: this.statusHead + (loaded.note ? ` · ${loaded.note}` : ''),
        warn: img.width === ew && img.height === eh ? '' : ` · expected ${ew}×${eh}`,
        url: shownUrl,
        error: false,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError' || id !== this.seq) return;
      this.status.set({ text: (err as Error).message, warn: '', url: shownUrl, error: true });
    }
  }

  /** Fetches and joins the JPEG stacks for a region. */
  private async loadJpeg(urls: string[], region: Region, signal: AbortSignal): Promise<Loaded> {
    let hits = 0;
    const stacks = await mapLimit(urls, MAX_PARALLEL, async (url) => {
      const hit = this.cache.get(url);
      if (hit) {
        hits++;
        return hit;
      }
      const s = await this.api.stack(url, signal);
      this.cache.set(url, s);
      return s;
    });
    return {
      img: joinStacks(stacks, region),
      bytes: stacks.reduce((n, s) => n + s.bytes, 0),
      requests: urls.length,
      cached: hits === urls.length,
      note: '',
    };
  }

  /**
   * Fetches one plane as blosc and turns its voxels into grey pixels. The data is in the plane's own orientation
   * (rows run along the vertical axis), so no stacking is involved. Anything wider than 8 bits is windowed: the
   * darkest and brightest half percent clip, and the rest spreads over black to white. Without that, typical
   * 16-bit data, which rarely uses the whole range, would come out nearly black.
   */
  private async loadBlosc(url: string, region: Region, axes: [Axis, Axis], signal: AbortSignal): Promise<Loaded> {
    let plane = this.bloscCache.get(url);
    const cached = !!plane;
    if (!plane) {
      const wire = await this.api.blosc(url, signal);
      const datatype = this.datatype();
      const { data } = interpretVoxels(await decodeBlosc(wire), datatype, region);
      const [h, v] = axes;
      plane = { data, width: span(region[h]), height: span(region[v]), stats: planeStats(data), datatype, bytes: wire.length };
      this.bloscCache.set(url, plane);
    }
    const window = this.windowSettings.resolve(plane.stats);
    return { img: this.grey(plane, window), bytes: plane.bytes, requests: 1, cached, note: this.windowNote(plane, window), plane };
  }

  private grey(p: BloscPlane, w: IntensityWindow): PlanePixels {
    return { width: p.width, height: p.height, data: windowToGrey(p.data, w) };
  }

  private windowNote(p: BloscPlane, w: IntensityWindow): string {
    return `${p.datatype} window ${shown(w.lo)}–${shown(w.hi)}`;
  }

  /** Redraws the blosc plane on screen with the window now in the settings. */
  private rewindow(): void {
    const p = this.bloscPlane;
    if (!p) return;
    const w = this.windowSettings.resolve(p.stats);
    this.show(this.grey(p, w));
    this.status.update((s) => ({ ...s, text: `${this.statusHead} · ${this.windowNote(p, w)}` }));
  }

  /** Puts an image on the base canvas and hands it to the edge layer and the tools. */
  private show(img: PlanePixels): void {
    const cv = this.canvas().nativeElement;
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    this.base = img;
    this.sliceState.publish(img);
    this.paintEdges();
  }

  /** Fetches the label plane as blosc (one request, any plane) and paints it over the image. */
  private async drawOverlay(region: Region, axes: [Axis, Axis], level: number, id: number, signal: AbortSignal): Promise<void> {
    const o = this.overlay();
    if (!o) {
      this.labels = undefined;
      this.legend.set([]);
      this.hover.set('');
      this.overlayStatus.set({ text: '', error: false });
      this.paintLabels();
      return;
    }
    const url = cutoutUrl(this.api.base, o.ref, level, region, [0, 1]);
    this.overlayStatus.set({ text: 'Loading labels…', error: false });
    try {
      let plane = this.labelCache.get(url);
      if (!plane) {
        const raw = await decodeBlosc(await this.api.blosc(url, signal));
        const { data } = interpretVoxels(raw, o.datatype, region);
        const [h, v] = axes;
        plane = { data, width: region[h][1] - region[h][0], height: region[v][1] - region[v][0], region, axes };
        this.labelCache.set(url, plane);
      }
      if (id !== this.seq) return;
      this.labels = plane;
      this.paintLabels();
      this.overlayStatus.set({ text: `${plane.width}×${plane.height} labels · ${url}`, error: false });
    } catch (err) {
      if ((err as Error).name === 'AbortError' || id !== this.seq) return;
      this.labels = undefined;
      this.legend.set([]);
      this.paintLabels();
      this.overlayStatus.set({ text: (err as Error).message, error: true });
    }
  }

  /** Runs edge detection on the base image with the current kernels and paints each band in its colour. */
  private paintEdges(): void {
    const cv = this.edgeCanvas()?.nativeElement;
    const img = this.base;
    if (!cv) return;
    if (!this.showEdges() || !img) {
      cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const kx = this.edgeSettings.kernelX();
    const ky = this.edgeSettings.kernelY();
    const bands = this.edgeSettings.activeBands();
    let m = this.magnitudes;
    if (!m || m.img !== img || m.kx !== kx || m.ky !== ky) {
      m = this.magnitudes = { img, kx, ky, data: imageMagnitudes(img.data, img.width, img.height, kx, ky) };
    }
    cv.width = img.width;
    cv.height = img.height;
    const rgba = edgesToRgba(bandLevels(m.data, bands), bands);
    cv.getContext('2d')?.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  }

  private paintLabels(): void {
    const cv = this.overlayCanvas()?.nativeElement;
    const p = this.labels;
    if (!cv) return;
    if (!p) {
      cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    cv.width = p.width;
    cv.height = p.height;
    cv.getContext('2d')?.putImageData(new ImageData(labelsToRgba(p.data, { showZero: this.showZero() }), p.width, p.height), 0, 0);
    const scheme = this.scheme();
    this.legend.set(
      labelCounts(p.data)
        .filter((l) => this.showZero() || l.id !== '0')
        .map((l) => ({
          id: l.id,
          label: labelText(scheme, l.id) ?? '',
          px: `${l.count.toLocaleString('en-US')} px`,
          color: `rgb(${labelColor(Number(l.id)).join(',')})`,
        })),
    );
  }
}
