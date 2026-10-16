import { Channel } from '../boss/boss.models';
import { isKnownDatatype } from './blosc';

export interface Capabilities {
  /** `image/jpeg` cutouts: the Boss only serves these for uint8 image channels. */
  jpeg: boolean;
  /** `application/blosc` cutouts: any datatype. */
  blosc: boolean;
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
