import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { ChannelRef, CoordFrame, Overlay, Plane } from '../boss/boss.models';
import { Axis, PLANE_AXES, Range, Region, cutoutUrl, extentOf, planeRegion, splitForJpeg } from '../boss/cutout';
import { decodeBlosc, interpretVoxels } from '../lib/blosc';
import { LabelData, labelColor, labelCounts, labelsToRgba } from '../lib/labels';
import { Lru } from '../lib/lru';
import { Stack, joinStacks } from '../lib/plane-pixels';
import { mapLimit } from '../lib/pool';

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

  private readonly api = inject(BossApi);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly overlayCanvas = viewChild<ElementRef<HTMLCanvasElement>>('ov');

  protected readonly planes: Plane[] = ['xy', 'xz', 'yz'];
  protected readonly sizes = [256, 512, 1024];
  protected readonly plane = signal<Plane>('xy');
  protected readonly size = signal(512);
  protected readonly pos = signal<Record<Axis, number>>({ x: 0, y: 0, z: 0 });
  protected readonly aspect = signal('1 / 1');
  protected readonly status = signal({ text: '', warn: '', url: '', error: false });
  protected readonly opacity = signal(0.6);
  protected readonly showZero = signal(false);
  protected readonly overlayStatus = signal({ text: '', error: false });
  protected readonly legend = signal<{ id: string; count: number; color: string }[]>([]);
  protected readonly hover = signal('');

  protected readonly fixedAxis = computed(() => PLANE_AXES[this.plane()][2]);
  protected readonly range = computed(() => extentOf(this.coord())[this.fixedAxis()]);
  protected readonly fixedPos = computed(() => this.pos()[this.fixedAxis()]);

  private readonly cache = new Lru<Stack>(60);
  private readonly labelCache = new Lru<LabelPlane>(20);
  private plane_?: LabelPlane;
  private seq = 0;
  private ctl?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    // A new channel (or coordinate frame) starts at the middle of the volume.
    effect(() => {
      const x = extentOf(this.coord());
      this.ref();
      untracked(() => {
        this.pos.set({ x: middle(x.x), y: middle(x.y), z: middle(x.z) });
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
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.ctl?.abort();
    });
  }

  protected setPlane(p: Plane): void {
    this.plane.set(p);
    this.schedule(0);
  }

  protected setSize(e: Event): void {
    this.size.set(+(e.target as HTMLSelectElement).value);
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

  protected onHover(e: MouseEvent): void {
    const p = this.plane_;
    const cv = this.overlayCanvas()?.nativeElement;
    if (!p || !cv) return;
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * p.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * p.height);
    if (x < 0 || y < 0 || x >= p.width || y >= p.height) return this.hover.set('');
    const [h, v] = p.axes;
    this.hover.set(`${h}=${p.region[h][0] + x}, ${v}=${p.region[v][0] + y} · label ${p.data[y * p.width + x]}`);
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
    const [h, v, f] = PLANE_AXES[plane];
    const region = planeRegion(extentOf(coord), plane, this.pos()[f], this.size());
    // A YZ plane stacks Y*Z rows into one JPEG, so tall requests are split along z (see splitForJpeg).
    const chunks = splitForJpeg(region).map((r) => cutoutUrl(this.api.base, this.ref(), 0, r));
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

      // Show the image at its physical proportions (voxels are rarely cubic in EM data).
      const vh = coord[`${h}_voxel_size` as `${Axis}_voxel_size`] || 1;
      const vv = coord[`${v}_voxel_size` as `${Axis}_voxel_size`] || 1;
      this.aspect.set(`${img.width * vh} / ${img.height * vv}`);

      const ew = region[h][1] - region[h][0];
      const eh = region[v][1] - region[v][0];
      const ms = Math.round(performance.now() - t0);
      const kb = stacks.reduce((n, s) => n + s.bytes, 0) / 1024;
      const reqs = `${chunks.length} request${chunks.length > 1 ? 's' : ''}`;
      void this.drawOverlay(region, [h, v], id, ctl.signal);
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
  private async drawOverlay(region: Region, axes: [Axis, Axis], id: number, signal: AbortSignal): Promise<void> {
    const o = this.overlay();
    if (!o) {
      this.plane_ = undefined;
      this.legend.set([]);
      this.hover.set('');
      this.overlayStatus.set({ text: '', error: false });
      this.paintLabels();
      return;
    }
    const url = cutoutUrl(this.api.base, o.ref, 0, region, [0, 1]);
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
      this.plane_ = plane;
      this.paintLabels();
      this.overlayStatus.set({ text: `${plane.width}×${plane.height} labels · ${url}`, error: false });
    } catch (err) {
      if ((err as Error).name === 'AbortError' || id !== this.seq) return;
      this.plane_ = undefined;
      this.legend.set([]);
      this.paintLabels();
      this.overlayStatus.set({ text: (err as Error).message, error: true });
    }
  }

  private paintLabels(): void {
    const cv = this.overlayCanvas()?.nativeElement;
    const p = this.plane_;
    if (!cv) return;
    if (!p) {
      cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    cv.width = p.width;
    cv.height = p.height;
    cv.getContext('2d')?.putImageData(new ImageData(labelsToRgba(p.data, { showZero: this.showZero() }), p.width, p.height), 0, 0);
    this.legend.set(
      labelCounts(p.data)
        .filter((l) => this.showZero() || l.id !== '0')
        .map((l) => ({ ...l, color: `rgb(${labelColor(Number(l.id)).join(',')})` })),
    );
  }
}
