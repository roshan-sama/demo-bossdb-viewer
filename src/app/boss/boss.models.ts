export type Plane = 'xy' | 'xz' | 'yz';

/** Shapes below follow the BossDB data model (collection > experiment > channel).
 *  Field names are from intern's resource classes; verify against live responses. */
export interface CoordFrame {
  x_start: number; x_stop: number;
  y_start: number; y_stop: number;
  z_start: number; z_stop: number;
  x_voxel_size: number; y_voxel_size: number; z_voxel_size: number;
  voxel_unit?: string;
}

export interface Experiment {
  coord_frame: string;
  num_hierarchy_levels?: number;
  hierarchy_method?: string;
  description?: string;
}

export interface Channel {
  type?: string;
  datatype?: string;
  base_resolution?: number;
  description?: string;
}

export interface ChannelRef { collection: string; experiment: string; channel: string; }
