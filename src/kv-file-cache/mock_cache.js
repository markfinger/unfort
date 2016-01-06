export function createMockCache() {
  return {
    get(key, cb) {
      cb(null, null);
    },
    set(key, value, cb) {
      cb(null);
    }
  }
}