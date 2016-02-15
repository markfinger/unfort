import EventEmitter from 'events';

export function createMockCache() {
  const events = new EventEmitter();
  return {
    get() {
      return Promise.resolve(null);
    },
    set(_, value) {
      return Promise.resolve(value);
    },
    invalidate() {
      return Promise.resolve(null);
    },
    events
  };
}