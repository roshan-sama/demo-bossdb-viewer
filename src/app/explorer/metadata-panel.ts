import { JsonPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { voxelRange, voxelSize } from '../lib/format';
import { Info } from './explorer.store';
import { Selection } from './selection';

interface Section {
  title: string;
  rows: [string, string][];
}

const rows = (pairs: [string, unknown][]): [string, string][] =>
  pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]);

@Component({
  selector: 'app-metadata-panel',
  imports: [JsonPipe],
  templateUrl: './metadata-panel.html',
})
export class MetadataPanel {
  readonly sel = input.required<Selection>();
  readonly info = input.required<Info>();

  protected readonly uri = computed(() => [this.sel().c, this.sel().e, this.sel().h].filter(Boolean).join('/'));

  protected readonly sections = computed<Section[]>(() => {
    const { exp, coord, chan } = this.info();
    const out: Section[] = [];
    if (exp) {
      out.push({
        title: 'Experiment',
        rows: rows([
          ['Coordinate frame', exp.coord_frame],
          ['Hierarchy levels', exp.num_hierarchy_levels],
          ['Hierarchy method', exp.hierarchy_method],
          ['Description', exp.description],
        ]),
      });
    }
    if (coord) {
      out.push({
        title: 'Coordinate frame',
        rows: rows([
          ['X range', voxelRange(coord.x_start, coord.x_stop)],
          ['Y range', voxelRange(coord.y_start, coord.y_stop)],
          ['Z range', voxelRange(coord.z_start, coord.z_stop)],
          ['Voxel size', voxelSize(coord)],
        ]),
      });
    }
    if (chan) {
      out.push({
        title: 'Channel',
        rows: rows([
          ['Type', chan.type],
          ['Datatype', chan.datatype],
          ['Base resolution', chan.base_resolution],
          ['Description', chan.description],
        ]),
      });
    }
    return out;
  });

  protected readonly raw = computed(() => {
    const { exp, coord, chan } = this.info();
    return { experiment: exp, coord_frame: coord, channel: chan };
  });
}
