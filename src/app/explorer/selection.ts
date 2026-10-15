export interface Selection {
  c: string; // collection
  e: string; // experiment
  h: string; // channel
}

export const EMPTY_SELECTION: Selection = { c: '', e: '', h: '' };

/** "#collection/experiment/channel", or '' when nothing is selected. */
export function formatHash(s: Selection): string {
  const parts = [s.c, s.e, s.h].filter(Boolean).map(encodeURIComponent);
  return parts.length ? '#' + parts.join('/') : '';
}

export function parseHash(hash: string): Selection {
  const [c = '', e = '', h = ''] = hash.replace(/^#/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { c, e, h };
}
