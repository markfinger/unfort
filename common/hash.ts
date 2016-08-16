const Murmur = require('imurmurhash');

export function generateStringHash(str: string): string {
  const murmur = new Murmur(str).result();
  return murmur.toString();
}

export class IncrementalStringHash {
  _murmur: any;
  constructor(initialStr: string) {
    this._murmur = new Murmur(String(initialStr));
  }
  add(str: string) {
    this._murmur.hash(String(str));
  }
  generateHash(): string {
    return this._murmur.result().toString();
  }
}