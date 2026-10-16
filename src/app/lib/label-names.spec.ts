import { labelText, schemeFor } from './label-names';

describe('label names', () => {
  it('finds a scheme by channel, ignoring case', () => {
    expect(schemeFor({ collection: 'Prasad', experiment: 'prasad2020', channel: 'region_of_interest' })).toBeDefined();
    expect(schemeFor({ collection: 'other', experiment: 'x', channel: 'y' })).toBeUndefined();
  });

  it('writes the short and full form', () => {
    const s = schemeFor({ collection: 'prasad', experiment: 'prasad2020', channel: 'region_of_interest' });
    expect(labelText(s, '4')).toBe('VP (ventral posterior thalamus)');
    expect(labelText(s, '3')).toBe('TRN (thalamic reticular nucleus)');
    expect(labelText(s, '0')).toBe('no label');
    expect(labelText(s, '99')).toBeUndefined();
    expect(labelText(undefined, '1')).toBeUndefined();
  });
});
