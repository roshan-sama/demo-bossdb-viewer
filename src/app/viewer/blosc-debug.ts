import { Component, computed, inject, input, signal } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { Channel, ChannelRef, CoordFrame } from '../boss/boss.models';
import { Region, cutoutUrl, extentOf, volumeCenter } from '../boss/cutout';
import { decodeBlosc, interpretVoxels } from '../lib/blosc';
import { capabilitiesOf } from '../lib/capabilities';
import { Comparison, compareArrays } from '../lib/compare';
import { stacksToVolume } from '../lib/volume';

const SIDE = 4;

interface Result {
  url: string;
  dtype: string;
  bytes: number;
  header: string;
  blosc: number[];
  jpeg?: number[];
  cmp?: Comparison;
  note?: string;
}

/** Fetches a tiny block as blosc (and as JPEG when the channel allows it) and shows the values. */
@Component({
  selector: 'app-blosc-debug',
  templateUrl: './blosc-debug.html',
})
export class BloscDebug {
  readonly ref = input.required<ChannelRef>();
  readonly coord = input.required<CoordFrame>();
  readonly chan = input.required<Channel>();

  private readonly api = inject(BossApi);
  protected readonly caps = computed(() => capabilitiesOf(this.chan()));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<Result | null>(null);

  protected async run(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      const dtype = this.chan().datatype ?? '';
      const region = volumeCenter(extentOf(this.coord()), SIDE);
      const res = this.chan().base_resolution ?? 0;
      const url = cutoutUrl(this.api.base, this.ref(), res, region, [0, 1]);
      const raw = await this.api.blosc(url);
      const header = `${raw.length} bytes on the wire`;
      const decoded = await decodeBlosc(raw);
      const { data, dims } = interpretVoxels(decoded, dtype, region);
      const blosc = Array.from(data as ArrayLike<number | bigint>, Number);
      const r: Result = { url, dtype, bytes: raw.length, header: `${header}, ${dims.join('×')} voxels`, blosc };
      if (this.caps().jpeg) {
        r.jpeg = await this.jpeg(region, res);
        r.cmp = compareArrays(blosc, r.jpeg);
      } else {
        r.note = 'JPEG cutouts are only served for uint8 image channels, so there is nothing to compare against.';
      }
      this.result.set(r);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async jpeg(region: Region, res: number): Promise<number[]> {
    const stack = await this.api.stack(cutoutUrl(this.api.base, this.ref(), res, region));
    return Array.from(stacksToVolume([stack], region).data);
  }

  protected head(v: number[] | undefined): string {
    return (v ?? []).slice(0, 16).join(', ');
  }
}
