import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { Channel, ChannelRef, CoordFrame, Experiment } from '../boss/boss.models';
import { EMPTY_SELECTION, Selection, formatHash, parseHash } from './selection';

export interface Load<T> {
  loading: boolean;
  error: string;
  data: T;
}

export interface Info {
  exp?: Experiment;
  coord?: CoordFrame;
  chan?: Channel;
  err?: string;
  chanErr?: string;
}

const idle = (): Load<string[]> => ({ loading: false, error: '', data: [] });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owns the collection > experiment > channel drill-down. Components only read signals and call methods. */
@Injectable()
export class ExplorerStore {
  private readonly api = inject(BossApi);

  readonly collections = signal<Load<string[]>>(idle());
  readonly experiments = signal<Load<string[]>>(idle());
  readonly channels = signal<Load<string[]>>(idle());
  readonly sel = signal<Selection>({ ...EMPTY_SELECTION });
  readonly info = signal<Info>({});

  /** Set once a channel and its coordinate frame are loaded; keeps its identity until they change. */
  readonly target = computed<{ ref: ChannelRef; coord: CoordFrame } | null>(
    () => {
      const { c, e, h } = this.sel();
      const { chan, coord } = this.info();
      return chan && coord && h ? { ref: { collection: c, experiment: e, channel: h }, coord } : null;
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a && !!b && a.coord === b.coord && a.ref.collection === b.ref.collection &&
          a.ref.experiment === b.ref.experiment && a.ref.channel === b.ref.channel),
    },
  );

  async init(hash: string): Promise<void> {
    await this.loadCollections();
    await this.restore(hash);
  }

  loadCollections = () => this.fill(this.collections, () => this.api.collections(), () => true);
  loadExperiments = () => {
    const c = this.sel().c;
    return this.fill(this.experiments, () => this.api.experiments(c), () => this.sel().c === c);
  };
  loadChannels = () => {
    const { c, e } = this.sel();
    return this.fill(this.channels, () => this.api.channels(c, e), () => this.sel().c === c && this.sel().e === e);
  };

  async chooseCollection(c: string): Promise<void> {
    this.sel.set({ c, e: '', h: '' });
    this.info.set({});
    this.experiments.set(idle());
    this.channels.set(idle());
    this.syncHash();
    await this.loadExperiments();
  }

  async chooseExperiment(e: string): Promise<void> {
    this.sel.update((s) => ({ ...s, e, h: '' }));
    this.info.set({});
    this.channels.set(idle());
    this.syncHash();
    await Promise.all([this.loadChannels(), this.loadExperimentInfo()]);
  }

  async chooseChannel(h: string): Promise<void> {
    const { c, e } = this.sel();
    const stale = () => this.sel().h !== h || this.sel().e !== e || this.sel().c !== c;
    this.sel.update((s) => ({ ...s, h }));
    this.info.update((i) => ({ ...i, chan: undefined, chanErr: '' }));
    this.syncHash();
    try {
      const chan = await this.api.channel(c, e, h);
      if (!stale()) this.info.update((i) => ({ ...i, chan }));
    } catch (err) {
      if (!stale()) this.info.update((i) => ({ ...i, chanErr: message(err) }));
    }
  }

  /** Re-applies a "#collection/experiment/channel" hash, stopping at the first name that is not available. */
  async restore(hash: string): Promise<void> {
    const { c, e, h } = parseHash(hash);
    if (!c || !this.collections().data.includes(c)) return;
    await this.chooseCollection(c);
    if (!e || !this.experiments().data.includes(e)) return;
    await this.chooseExperiment(e);
    if (h && this.channels().data.includes(h)) await this.chooseChannel(h);
  }

  private async loadExperimentInfo(): Promise<void> {
    const { c, e } = this.sel();
    const stale = () => this.sel().c !== c || this.sel().e !== e;
    try {
      const exp = await this.api.experiment(c, e);
      const coord = exp.coord_frame ? await this.api.coordFrame(exp.coord_frame) : undefined;
      if (!stale()) this.info.update((i) => ({ ...i, exp, coord }));
    } catch (err) {
      if (!stale()) this.info.update((i) => ({ ...i, err: message(err) }));
    }
  }

  private async fill(
    target: WritableSignal<Load<string[]>>,
    load: () => Promise<string[]>,
    stillValid: () => boolean,
  ): Promise<void> {
    target.set({ loading: true, error: '', data: [] });
    try {
      const data = await load();
      if (stillValid()) target.set({ loading: false, error: '', data });
    } catch (err) {
      if (stillValid()) target.set({ loading: false, error: message(err), data: [] });
    }
  }

  private syncHash(): void {
    if (typeof history === 'undefined') return;
    history.replaceState(null, '', formatHash(this.sel()) || location.pathname + location.search);
  }
}
