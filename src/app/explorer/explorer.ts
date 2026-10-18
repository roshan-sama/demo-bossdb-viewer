import { Component, computed, effect, inject, signal } from '@angular/core';
import { Overlay } from '../boss/boss.models';
import { capabilitiesOf, sliceFormatOf } from '../lib/capabilities';
import { Combobox } from '../ui/combobox';
import { BloscDebug } from '../viewer/blosc-debug';
import { OverlayPicker } from '../viewer/overlay-picker';
import { SliceViewer } from '../viewer/slice-viewer';
import { VolumeViewer } from '../viewer/volume-viewer';
import { ExplorerStore } from './explorer.store';
import { MetadataPanel } from './metadata-panel';

@Component({
  selector: 'app-explorer',
  imports: [BloscDebug, OverlayPicker, Combobox, MetadataPanel, SliceViewer, VolumeViewer],
  providers: [ExplorerStore],
  templateUrl: './explorer.html',
})
export class Explorer {
  protected readonly s = inject(ExplorerStore);

  /** Which viewers can show the selected channel (derived from its type and datatype). */
  protected readonly caps = computed(() => capabilitiesOf(this.s.info().chan));
  /** How the slice viewer fetches this channel (JPEG, or blosc when JPEG is not served), or null when it cannot show it. */
  protected readonly sliceFormat = computed(() => sliceFormatOf(this.s.info().chan));
  protected readonly datatype = computed(() => this.s.info().chan?.datatype?.toLowerCase() ?? '');
  protected readonly isAnnotation = computed(() => this.s.info().chan?.type?.toLowerCase() === 'annotation');

  protected readonly overlay = signal<Overlay | null>(null);

  /** The selection box starts open and folds away once a channel is chosen; the person can reopen it. */
  protected readonly pickerOpen = signal(true);
  private readonly channel = computed(() => this.s.sel().h);
  /** "collection / experiment / channel", shown in the folded header so the choice stays visible. */
  protected readonly crumb = computed(() => {
    const { c, e, h } = this.s.sel();
    return [c, e, h].filter(Boolean).join(' / ');
  });

  constructor() {
    effect(() => {
      if (this.channel()) this.pickerOpen.set(false);
    });
    void this.s.init(typeof location === 'undefined' ? '' : location.hash);
  }

  protected onPickerToggle(e: Event): void {
    this.pickerOpen.set((e.target as HTMLDetailsElement).open);
  }
}
