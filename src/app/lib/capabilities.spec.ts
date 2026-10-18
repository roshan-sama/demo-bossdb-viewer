import { capabilitiesOf, sliceFormatOf } from './capabilities';

describe('sliceFormatOf', () => {
  it('uses JPEG for uint8 images, as before', () => {
    expect(sliceFormatOf({ type: 'image', datatype: 'uint8' })).toBe('jpeg');
    expect(sliceFormatOf({ type: 'Image', datatype: 'UINT8' })).toBe('jpeg');
  });
  it('falls back to blosc for other image channels it can decode', () => {
    expect(sliceFormatOf({ type: 'image', datatype: 'uint16' })).toBe('blosc');
    expect(sliceFormatOf({ type: 'IMAGE', datatype: 'UINT16' })).toBe('blosc');
  });
  it('does not draw annotation channels as the base image', () => {
    expect(sliceFormatOf({ type: 'annotation', datatype: 'uint64' })).toBeNull();
    expect(sliceFormatOf({ type: 'annotation', datatype: 'uint8' })).toBeNull();
  });
  it('cannot draw what blosc cannot decode, or a channel with no metadata', () => {
    expect(sliceFormatOf({ type: 'image', datatype: 'float32' })).toBeNull();
    expect(sliceFormatOf({ type: 'image', datatype: undefined })).toBeNull();
    expect(sliceFormatOf({ type: undefined, datatype: 'uint16' })).toBeNull();
    expect(sliceFormatOf(undefined)).toBeNull();
  });
});

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
