import { Component, DestroyRef, ElementRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ChannelRef, CoordFrame } from '../boss/boss.models';
import { Axis, extentOf } from '../boss/cutout';
import { VolumeLoader } from '../boss/volume-loader.service';
import { Dims, physicalSize, volumeRegion } from '../lib/volume';
import { VOLUME_SCENE, VolumeSceneApi } from './volume-scene';

interface Preset {
  label: string;
  dims: Dims;
}

/** Block sizes in voxels (x × y × z). Roughly 1 to 8 MB of uint8 data each. */
export const VOLUME_PRESETS: Preset[] = [
  { label: '128 × 128 × 64', dims: [128, 128, 64] },
  { label: '256 × 256 × 64', dims: [256, 256, 64] },
  { label: '256 × 256 × 128', dims: [256, 256, 128] },
];

const PLANE_LABELS: Record<Axis, string> = { x: 'YZ plane (x)', y: 'XZ plane (y)', z: 'XY plane (z)' };

@Component({
  selector: 'app-volume-viewer',
  templateUrl: './volume-viewer.html',
})
export class VolumeViewer {
  readonly ref = input.required<ChannelRef>();
  readonly coord = input.required<CoordFrame>();

  private readonly loader = inject(VolumeLoader);
  private readonly makeScene = inject(VOLUME_SCENE);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('gl');

  protected readonly presets = VOLUME_PRESETS;
  protected readonly axes: Axis[] = ['x', 'y', 'z'];
  protected readonly labels = PLANE_LABELS;

  protected readonly preset = signal(1);
  protected readonly loading = signal(false);
  protected readonly status = signal({ text: '', error: false });
  /** Dimensions of the loaded volume; null until a volume is loaded. */
  protected readonly dims = signal<Dims | null>(null);
  protected readonly index = signal<Record<Axis, number>>({ x: 0, y: 0, z: 0 });
  protected readonly visible = signal<Record<Axis, boolean>>({ x: true, y: true, z: true });
  protected readonly look = signal({ contrast: 1, brightness: 0 });

  private scene?: VolumeSceneApi;
  private ctl?: AbortController;

  constructor() {
    // A different channel makes the loaded block stale.
    effect(() => {
      this.ref();
      this.coord();
      untracked(() => {
        this.ctl?.abort();
        this.dims.set(null);
        this.loading.set(false);
        this.status.set({ text: '', error: false });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.ctl?.abort();
      this.scene?.dispose();
    });
  }

  protected setPreset(e: Event): void {
    this.preset.set(+(e.target as HTMLSelectElement).value);
  }

  protected max(axis: Axis): number {
    const d = this.dims();
    return d ? d[this.axes.indexOf(axis)] - 1 : 0;
  }

  protected async load(): Promise<void> {
    const coord = this.coord();
    const region = volumeRegion(extentOf(coord), VOLUME_PRESETS[this.preset()].dims);
    this.ctl?.abort();
    const ctl = (this.ctl = new AbortController());
    this.loading.set(true);
    this.status.set({ text: 'Loading…', error: false });
    const t0 = performance.now();

    try {
      const vol = await this.loader.load(this.ref(), region, {
        signal: ctl.signal,
        onProgress: (done, total) => {
          if (!ctl.signal.aborted) this.status.set({ text: `Loading ${done}/${total} requests…`, error: false });
        },
      });
      if (ctl.signal.aborted) return;
      this.scene ??= await this.makeScene(this.canvas().nativeElement);
      if (ctl.signal.aborted) return;

      const dims: Dims = [vol.width, vol.height, vol.depth];
      const size = physicalSize(dims, [coord.x_voxel_size, coord.y_voxel_size, coord.z_voxel_size]);
      this.scene.setVolume({ data: vol.data, width: vol.width, height: vol.height, depth: vol.depth, size });
      this.dims.set(dims);
      this.index.set({ x: dims[0] >> 1, y: dims[1] >> 1, z: dims[2] >> 1 });
      for (const a of this.axes) this.applyPlane(a);
      this.applyLook();

      const mb = (vol.bytes / 1024 / 1024).toFixed(1);
      const s = ((performance.now() - t0) / 1000).toFixed(1);
      this.status.set({
        text: `${dims.join('×')} voxels · ${mb} MB over ${vol.requests} request${vol.requests > 1 ? 's' : ''} · ${s} s`,
        error: false,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError' || ctl.signal.aborted) return;
      this.status.set({ text: (err as Error).message, error: true });
    } finally {
      if (this.ctl === ctl) this.loading.set(false);
    }
  }

  protected move(axis: Axis, e: Event): void {
    this.index.update((i) => ({ ...i, [axis]: +(e.target as HTMLInputElement).value }));
    this.applyPlane(axis);
  }

  protected toggle(axis: Axis, e: Event): void {
    this.visible.update((v) => ({ ...v, [axis]: (e.target as HTMLInputElement).checked }));
    this.applyPlane(axis);
  }

  protected setLook(which: 'contrast' | 'brightness', e: Event): void {
    this.look.update((l) => ({ ...l, [which]: +(e.target as HTMLInputElement).value }));
    this.applyLook();
  }

  protected resetView(): void {
    this.scene?.resetView();
  }

  private applyPlane(axis: Axis): void {
    this.scene?.setPlane(axis, this.index()[axis], this.visible()[axis]);
  }

  private applyLook(): void {
    this.scene?.setLook(this.look().contrast, this.look().brightness);
  }
}
