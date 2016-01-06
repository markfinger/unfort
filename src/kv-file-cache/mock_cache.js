import {murmurFilename} from './utils';

export function createMockCache(dirname, options={}) {
  const {generateFilename=murmurFilename} = options;

  return {
    dirname,
    cache: Object.create(null),
    generateFilename: generateFilename,
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