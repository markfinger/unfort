import EventEmitter from 'events';

export function createMockCache() {
  const events = new EventEmitter();
  return {
    get(key) {
      return Promise.resolve(null);
    },
    set(key, value) {
      return Promise.resolve(value);
    },
    invalidate(key) {
      return Promise.resolve(null);
    },
    events
  };
}