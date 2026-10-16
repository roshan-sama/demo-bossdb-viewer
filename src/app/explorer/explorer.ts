import { Component, computed, inject, signal } from '@angular/core';
import { Overlay } from '../boss/boss.models';
import { capabilitiesOf } from '../lib/capabilities';
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

  protected readonly overlay = signal<Overlay | null>(null);

  constructor() {
    void this.s.init(typeof location === 'undefined' ? '' : location.hash);
  }
}
