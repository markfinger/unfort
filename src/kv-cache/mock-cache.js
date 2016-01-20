import EventEmitter from 'events';

export function createMockCache() {
  const events = new EventEmitter();
  return {
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
    events
  }
}