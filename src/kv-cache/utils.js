import {isArray} from 'lodash/lang';
import Murmur from 'imurmurhash';

export function generateMurmurHash(key) {
  if (!isArray(key)) {
    return String(new Murmur(key.toString()).result());
  }

  if (!key.length) {
    throw new Error('Key array does not contain any entries');
  }

  return key
    .map(entry => new Murmur(entry.toString()).result())
    .join('_');
}
