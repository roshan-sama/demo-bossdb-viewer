import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { ChannelRef, CoordFrame, Overlay, Plane } from '../boss/boss.models';
import { Axis, PLANE_AXES, Range, Region, centeredWindow, cutoutUrl, extentOf, planeRegionAt, splitForJpeg } from '../boss/cutout';
import { decodeBlosc, interpretVoxels } from '../lib/blosc';
import { Kernel3, bandLevels, edgesToRgba, imageMagnitudes } from '../lib/edges';
import { labelText, schemeFor } from '../lib/label-names';
import { LabelData, labelColor, labelCounts, labelsToRgba } from '../lib/labels';
import { estimateLevel, levelScales, parseDownsample } from '../lib/levels';
import { Lru } from '../lib/lru';
import { PlanePixels, Stack, joinStacks } from '../lib/plane-pixels';
import { mapLimit } from '../lib/pool';
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

const middle = (r: Range) => Math.floor((r[0] + r[1]) / 2);

/** Draws one JPEG cutout at a time to a canvas; debounces the slider and cancels superseded requests. */
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

  private readonly api = inject(BossApi);
  private readonly edgeSettings = inject(EdgeSettings);
  /** Tells the tools panel when an image is on screen (it stays locked until then). */
  private readonly sliceState = inject(SliceState);
  private readonly canvas =viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly overlayCanvas = viewChild<ElementRef<HTMLCanvasElement>>('ov');
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
    // A YZ plane stacks Y*Z rows into one JPEG, so tall requests are split along z (see splitForJpeg).
    const chunks = splitForJpeg(region).map((r) => cutoutUrl(this.api.base, this.ref(), level, r));
    const shownUrl = chunks.length > 1 ? `${chunks[0]} (+${chunks.length - 1} more)` : chunks[0];

    const id = ++this.seq;
    this.ctl?.abort();
    const ctl = (this.ctl = new AbortController());
    const t0 = performance.now();
    let cached = 0;
    this.status.set({ text: 'Loading…', warn: '', url: shownUrl, error: false });

    try {
      const stacks = await mapLimit(chunks, MAX_PARALLEL, async (url) => {
        const hit = this.cache.get(url);
        if (hit) {
          cached++;
          return hit;
        }
        const s = await this.api.stack(url, ctl.signal);
        this.cache.set(url, s);
        return s;
      });
      if (id !== this.seq) return;

      const img = joinStacks(stacks, region);
      const cv = this.canvas().nativeElement;
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d');
      if (ctx) ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      this.base = img;
      this.sliceState.publish(img);
      this.paintEdges();

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
      const kb = stacks.reduce((n, s) => n + s.bytes, 0) / 1024;
      const reqs = `${chunks.length} request${chunks.length > 1 ? 's' : ''}`;
      this.status.set({
        text: `${img.width}×${img.height} px · ${kb.toFixed(0)} KB · ${ms} ms · ${reqs}${cached === chunks.length ? ' (cached)' : ''}`,
        warn: img.width === ew && img.height === eh ? '' : ` · expected ${ew}×${eh}`,
        url: shownUrl,
        error: false,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError' || id !== this.seq) return;
      this.status.set({ text: (err as Error).message, warn: '', url: shownUrl, error: true });
    }
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
