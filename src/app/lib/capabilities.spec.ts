import { capabilitiesOf } from './capabilities';

describe('capabilitiesOf', () => {
  it('offers both formats for uint8 images', () => {
    expect(capabilitiesOf({ type: 'image', datatype: 'uint8' })).toEqual({ jpeg: true, blosc: true });
  });
  it('offers only blosc for uint16 images and annotations', () => {
    expect(capabilitiesOf({ type: 'image', datatype: 'uint16' })).toEqual({ jpeg: false, blosc: true });
    expect(capabilitiesOf({ type: 'annotation', datatype: 'uint64' })).toEqual({ jpeg: false, blosc: true });
  });
  it('offers nothing for missing or unknown metadata', () => {
    expect(capabilitiesOf(undefined)).toEqual({ jpeg: false, blosc: false });
    expect(capabilitiesOf({ type: 'image', datatype: 'float32' })).toEqual({ jpeg: false, blosc: false });
  });
});
