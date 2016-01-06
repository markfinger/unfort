import {murmurFilename} from './utils';

export function createMockCache({dirname}={}) {
  return {
    dirname,
    cache: Object.create(null),
    generateFilename: murmurFilename,
    get(key, cb) {
      cb(null, null);
    },
    set(key, value, cb) {
      if (cb) {
        cb(null);
      }
    },
    invalidate(key, cb) {
      if (cb) {
        cb(null);
      }
    },
    on: () => {},
    once: () => {},
    off: () => {}
  }
}