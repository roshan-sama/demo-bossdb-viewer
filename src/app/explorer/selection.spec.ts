import { formatHash, parseHash } from './selection';

describe('selection hash', () => {
  it('round-trips a full selection', () => {
    const s = { c: 'nguyen_thomas2022', e: 'cb2', h: 'em' };
    expect(parseHash(formatHash(s))).toEqual(s);
  });

  it('encodes unusual characters', () => {
    const s = { c: 'a b', e: 'x/y', h: '' };
    expect(formatHash(s)).toBe('#a%20b/x%2Fy');
    expect(parseHash(formatHash(s))).toEqual(s);
  });

  it('gives an empty hash for an empty selection', () => {
    expect(formatHash({ c: '', e: '', h: '' })).toBe('');
    expect(parseHash('')).toEqual({ c: '', e: '', h: '' });
  });
});
