import {isArray} from 'lodash/lang';
import murmur from 'imurmurhash';

export function generateMurmurHash(key) {
  if (!isArray(key)) {
    return String(new murmur(key.toString()).result());
  }

  if (!key.length) {
    throw new Error('Key array does not contain any entries');
  }

  return key
    .map(entry => new murmur(entry.toString()).result())
    .join('_');
}
