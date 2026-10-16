import { ChannelRef } from '../boss/boss.models';

export interface LabelName {
  short: string;
  full: string;
}

export interface LabelScheme {
  /** Where the names come from, shown next to the legend. */
  source: string;
  names: Record<string, LabelName>;
}

const PRASAD_2020 = 'Prasad et al. 2020, Scientific Data (doi:10.1038/s41597-020-00692-y)';

/** Brain-region labels as defined in the dataset paper. Full names for TRN and VP are standard neuroanatomy, not quoted from it. */
const PRASAD_REGIONS: LabelScheme = {
  source: `${PRASAD_2020}. Check the ids against this channel: the MTNeuro benchmark uses a different 0-3 numbering.`,
  names: {
    '0': { short: 'no label', full: 'no label (background)' },
    '1': { short: 'CTX', full: 'somatosensory cortex' },
    '2': { short: 'STR', full: 'striatum' },
    '3': { short: 'TRN', full: 'thalamic reticular nucleus' },
    '4': { short: 'VP', full: 'ventral posterior thalamus' },
    '5': { short: 'ZI', full: 'zona incerta' },
    '6': { short: 'IC', full: 'internal capsule' },
    '7': { short: 'HYP', full: 'hypothalamus' },
    '8': { short: 'CC', full: 'corpus callosum' },
  },
};

/** Microstructure labels; the dataset paper and MTNeuro give the same values. */
const PRASAD_PIXELS: LabelScheme = {
  source: `${PRASAD_2020}; MTNeuro (arXiv:2301.00345)`,
  names: {
    '0': { short: 'no label', full: 'no label (background)' },
    '1': { short: 'vessel', full: 'blood vessel' },
    '2': { short: 'cell', full: 'cell body' },
    '3': { short: 'axon', full: 'myelinated axon' },
  },
};

/**
 * Known label names by channel. BossDB channel metadata has only a free-text description, so these
 * are curated from papers. See SOURCES.md for how far each entry can be trusted.
 */
const SCHEMES: Record<string, LabelScheme> = {
  'prasad/prasad2020/region_of_interest': PRASAD_REGIONS,
  'prasad/prasad_analysis/roi_labels': PRASAD_REGIONS,
  'prasad/prasad2020/pixel_annotation': PRASAD_PIXELS,
  'prasad/prasad_analysis/pixel_labels': PRASAD_PIXELS,
};

export function schemeFor(ref: ChannelRef): LabelScheme | undefined {
  return SCHEMES[`${ref.collection}/${ref.experiment}/${ref.channel}`.toLowerCase()];
}

/** "VP (ventral posterior thalamus)" for a known id, or undefined. */
export function labelText(scheme: LabelScheme | undefined, id: string): string | undefined {
  const n = scheme?.names[id];
  if (!n) return undefined;
  return n.short === n.full || n.full.startsWith('no label') ? n.short : `${n.short} (${n.full})`;
}
