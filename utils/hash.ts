const Murmur = require('imurmurhash');

export function generateStringHash(str: string): string {
  const murmur = new Murmur(str).result();
  return murmur.toString();
}