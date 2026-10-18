import { Channel } from '../boss/boss.models';
import { isKnownDatatype } from './blosc';

export interface Capabilities {
  /** `image/jpeg` cutouts: the Boss only serves these for uint8 image channels. */
  jpeg: boolean;
  /** `application/blosc` cutouts: any datatype. */
  blosc: boolean;
}

/** How the slice viewer fetches an image: as JPEG, or as blosc for datatypes the Boss will not serve as JPEG. */
export type SliceFormat = 'jpeg' | 'blosc';

/**
 * How the slice viewer can draw a channel as its base image, or null when it cannot. uint8 images come as JPEG, the
 * smaller and cheaper download; other image channels (uint16, say) come as blosc. Annotation channels are not
 * drawn as the base image: they are drawn over one, as a label overlay.
 */
export function sliceFormatOf(chan: Pick<Channel, 'type' | 'datatype'> | undefined): SliceFormat | null {
  const caps = capabilitiesOf(chan);
  if (caps.jpeg) return 'jpeg';
  return caps.blosc && chan?.type?.toLowerCase() === 'image' ? 'blosc' : null;
}

/**
 * The channel metadata does not list response formats, so availability is derived from its
 * `type` and `datatype`, following the cutout docs.
 */
export function capabilitiesOf(chan: Pick<Channel, 'type' | 'datatype'> | undefined): Capabilities {
  if (!chan) return { jpeg: false, blosc: false };
  const dt = chan.datatype?.toLowerCase();
  return {
    jpeg: chan.type?.toLowerCase() === 'image' && dt === 'uint8',
    blosc: isKnownDatatype(dt),
  };
}
