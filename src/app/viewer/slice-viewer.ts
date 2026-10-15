import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { ChannelRef, CoordFrame, Plane } from '../boss/boss.models';
import { Axis, PLANE_AXES, Range, cutoutUrl, extentOf, planeRegion, splitForJpeg } from '../boss/cutout';
import { Lru } from '../lib/lru';
import { Stack, joinStacks } from '../lib/plane-pixels';
import { mapLimit } from '../lib/pool';

const MAX_PARALLEL = 6;

const middle = (r: Range) => Math.floor((r[0] + r[1]) / 2);

/** Draws one JPEG cutout at a time to a canvas; debounces the slider and cancels superseded requests. */
@Component({
  selector: 'app-slice-viewer',
  templateUrl: './slice-viewer.html',
})
export class SliceViewer {
  readonly ref = input.required<ChannelRef>();
  readonly coord = input.required<CoordFrame>();

  private readonly api = inject(BossApi);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');

  protected readonly planes: Plane[] = ['xy', 'xz', 'yz'];
  protected readonly sizes = [256, 512, 1024];
  protected readonly plane = signal<Plane>('xy');
  protected readonly size = signal(512);
  protected readonly pos = signal<Record<Axis, number>>({ x: 0, y: 0, z: 0 });
  protected readonly aspect = signal('1 / 1');
  protected readonly status = signal({ text: '', warn: '', url: '', error: false });

  protected readonly fixedAxis = computed(() => PLANE_AXES[this.plane()][2]);
  protected readonly range = computed(() => extentOf(this.coord())[this.fixedAxis()]);
  protected readonly fixedPos = computed(() => this.pos()[this.fixedAxis()]);

  private readonly cache = new Lru<Stack>(60);
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
}
