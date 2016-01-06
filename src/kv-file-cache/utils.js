import murmur from 'imurmurhash';

export function murmurFilename(cacheKey) {
  const hash = murmur(cacheKey).result();
  return hash + '.json';
}
