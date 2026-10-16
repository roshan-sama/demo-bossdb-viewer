import { Injectable } from '@angular/core';
import { Stack } from '../lib/plane-pixels';
import { Channel, ChannelRef, CoordFrame, Experiment } from './boss.models';

const enc = (...s: string[]) => s.map(encodeURIComponent).join('/');

/** All network access to the public BossDB data API lives here. */
@Injectable({ providedIn: 'root' })
export class BossApi {
  readonly base = 'https://api.bossdb.io/v1/';
  private readonly cache = new Map<string, Promise<unknown>>();

  collections() { return this.names('collection/', 'collections'); }
  experiments(c: string) { return this.names(`collection/${enc(c)}/experiment/`, 'experiments'); }
  channels(c: string, e: string) { return this.names(`collection/${enc(c)}/experiment/${enc(e)}/channel/`, 'channels'); }
  experiment(c: string, e: string) { return this.json<Experiment>(`collection/${enc(c)}/experiment/${enc(e)}/`); }
  channel(c: string, e: string, h: string) { return this.json<Channel>(`collection/${enc(c)}/experiment/${enc(e)}/channel/${enc(h)}/`); }
  /** Per-resolution-level extents for a channel (shape confirmed on use; see lib/levels). */
  downsample(r: ChannelRef) { return this.json<unknown>(`downsample/${enc(r.collection, r.experiment, r.channel)}/`); }
  coordFrame(name: string) { return this.json<CoordFrame>(`coord/${enc(name)}/`); }

  /**
   * Fetch one JPEG cutout and decode it to RGBA pixels. Boss stacks z-slices vertically, so the
   * image is X wide and (Y * Z) tall; see joinStacks. Pass an AbortSignal to cancel stale requests.
   */
  async stack(url: string, signal?: AbortSignal): Promise<Stack> {
    const r = await fetch(url, { headers: this.headers('image/jpeg'), signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    const blob = await r.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { rgba: px.data, width: canvas.width, height: canvas.height, bytes: blob.size };
  }

  /** Fetch one cutout as raw `application/blosc` bytes (still compressed; see lib/blosc). */
  async blosc(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const r = await fetch(url, { headers: this.headers('application/blosc'), signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  private headers(accept: string) {
    return { Authorization: 'Token public', Accept: accept };
  }

  private json<T>(path: string): Promise<T> {
    let p = this.cache.get(path) as Promise<T> | undefined;
    if (!p) {
      p = fetch(this.base + path, { headers: this.headers('application/json') }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for /v1/${path}`);
        return r.json() as Promise<T>;
      });
      p.catch(() => this.cache.delete(path)); // don't cache failures
      this.cache.set(path, p);
    }
    return p;
  }

  private async names(path: string, key: string): Promise<string[]> {
    const j = await this.json<unknown>(path);
    const raw = Array.isArray(j) ? j : (j as Record<string, unknown>)?.[key];
    if (!Array.isArray(raw)) throw new Error(`Unexpected response for /v1/${path}`);
    return raw
      .map((c) => (typeof c === 'string' ? c : (c as { name?: string })?.name ?? ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
}
