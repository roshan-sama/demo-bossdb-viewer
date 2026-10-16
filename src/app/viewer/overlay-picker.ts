import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { BossApi } from '../boss/boss-api.service';
import { Overlay } from '../boss/boss.models';
import { capabilitiesOf } from '../lib/capabilities';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Picks a second channel (usually an annotation channel) from the same collection to draw over the slices. */
@Component({
  selector: 'app-overlay-picker',
  templateUrl: './overlay-picker.html',
})
export class OverlayPicker {
  /** The collection of the channel being viewed. */
  readonly collection = input.required<string>();
  /** The coordinate frame name of the channel being viewed, used to warn about misaligned overlays. */
  readonly frame = input<string | undefined>();
  readonly chosen = output<Overlay | null>();

  private readonly api = inject(BossApi);
  private seq = 0;

  protected readonly experiments = signal<string[]>([]);
  protected readonly channels = signal<string[]>([]);
  protected readonly exp = signal('');
  protected readonly chan = signal('');
  protected readonly error = signal('');
  protected readonly overlayFrame = signal<string | undefined>(undefined);
  protected readonly note = signal('');

  protected readonly mismatch = computed(() => {
    const a = this.frame();
    const b = this.overlayFrame();
    return !!a && !!b && a !== b ? `This channel uses coordinate frame "${b}" but the image uses "${a}", so the two may not line up.` : '';
  });

  constructor() {
    effect(() => {
      const c = this.collection();
      untracked(() => void this.reset(c));
    });
  }

  private clear(): void {
    this.exp.set('');
    this.chan.set('');
    this.channels.set([]);
    this.experiments.set([]);
    this.error.set('');
    this.note.set('');
    this.overlayFrame.set(undefined);
    this.chosen.emit(null);
  }

  private async reset(c: string): Promise<void> {
    const id = ++this.seq;
    this.clear();
    try {
      const list = await this.api.experiments(c);
      if (id === this.seq) this.experiments.set(list);
    } catch (e) {
      if (id === this.seq) this.error.set(message(e));
    }
  }

  protected async pickExperiment(e: string): Promise<void> {
    const id = ++this.seq;
    this.exp.set(e);
    this.chan.set('');
    this.channels.set([]);
    this.error.set('');
    this.note.set('');
    this.overlayFrame.set(undefined);
    this.chosen.emit(null);
    if (!e) return;
    try {
      const list = await this.api.channels(this.collection(), e);
      if (id === this.seq) this.channels.set(list);
    } catch (err) {
      if (id === this.seq) this.error.set(message(err));
    }
  }

  protected async pickChannel(h: string): Promise<void> {
    const id = ++this.seq;
    this.chan.set(h);
    this.error.set('');
    this.note.set('');
    this.overlayFrame.set(undefined);
    this.chosen.emit(null);
    if (!h) return;
    const c = this.collection();
    const e = this.exp();
    try {
      const [experiment, channel] = await Promise.all([this.api.experiment(c, e), this.api.channel(c, e, h)]);
      if (id !== this.seq) return;
      if (!capabilitiesOf(channel).blosc) {
        this.error.set(`Cannot read this channel as blosc (datatype ${channel.datatype ?? 'unknown'}).`);
        return;
      }
      this.overlayFrame.set(experiment.coord_frame);
      if (channel.type?.toLowerCase() !== 'annotation') {
        this.note.set(`This is an ${channel.type ?? 'unknown'} channel, not an annotation, so the colours will look noisy.`);
      }
      this.chosen.emit({ ref: { collection: c, experiment: e, channel: h }, datatype: channel.datatype!.toLowerCase(), description: channel.description || undefined });
    } catch (err) {
      if (id === this.seq) this.error.set(message(err));
    }
  }

  protected value(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }
}
