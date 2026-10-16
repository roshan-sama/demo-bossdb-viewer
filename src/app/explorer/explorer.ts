import { Component, computed, inject } from '@angular/core';
import { capabilitiesOf } from '../lib/capabilities';
import { Combobox } from '../ui/combobox';
import { BloscDebug } from '../viewer/blosc-debug';
import { SliceViewer } from '../viewer/slice-viewer';
import { VolumeViewer } from '../viewer/volume-viewer';
import { ExplorerStore } from './explorer.store';
import { MetadataPanel } from './metadata-panel';

@Component({
  selector: 'app-explorer',
  imports: [BloscDebug, Combobox, MetadataPanel, SliceViewer, VolumeViewer],
  providers: [ExplorerStore],
  templateUrl: './explorer.html',
})
export class Explorer {
  protected readonly s = inject(ExplorerStore);

  /** Which viewers can show the selected channel (derived from its type and datatype). */
  protected readonly caps = computed(() => capabilitiesOf(this.s.info().chan));

  constructor() {
    void this.s.init(typeof location === 'undefined' ? '' : location.hash);
  }
}
