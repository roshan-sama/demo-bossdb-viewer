import { Injectable, inject } from '@angular/core';
import { Volume, stacksToVolume } from '../lib/volume';
import { mapLimit } from '../lib/pool';
import { BossApi } from './boss-api.service';
import { ChannelRef } from './boss.models';
import { Region, cutoutUrl, splitForJpeg } from './cutout';

export interface LoadedVolume extends Volume {
  bytes: number;
  requests: number;
}

export interface LoadOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

// Each decoded stack is large (RGBA, up to ~16k rows), so keep fewer in flight than for slices.
const MAX_PARALLEL = 4;

/** Loads a block of a uint8 image channel as a 3D array, via Boss's stacked JPEG cutouts. */
@Injectable({ providedIn: 'root' })
export class VolumeLoader {
  private readonly api = inject(BossApi);

  async load(ref: ChannelRef, region: Region, opts: LoadOptions = {}): Promise<LoadedVolume> {
    const urls = splitForJpeg(region).map((r) => cutoutUrl(this.api.base, ref, 0, r));
    let done = 0;
    const stacks = await mapLimit(urls, MAX_PARALLEL, async (url) => {
      const s = await this.api.stack(url, opts.signal);
      opts.onProgress?.(++done, urls.length);
      return s;
    });
    return {
      ...stacksToVolume(stacks, region),
      bytes: stacks.reduce((n, s) => n + s.bytes, 0),
      requests: urls.length,
    };
  }
}
