import { Component, inject } from '@angular/core';
import { Combobox } from '../ui/combobox';
import { SliceViewer } from '../viewer/slice-viewer';
import { ExplorerStore } from './explorer.store';
import { MetadataPanel } from './metadata-panel';

@Component({
  selector: 'app-explorer',
  imports: [Combobox, MetadataPanel, SliceViewer],
  providers: [ExplorerStore],
  templateUrl: './explorer.html',
})
export class Explorer {
  protected readonly s = inject(ExplorerStore);

  constructor() {
    void this.s.init(typeof location === 'undefined' ? '' : location.hash);
  }
}
