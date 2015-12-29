export function createMockCache() {
  return {
    get(options, cb) {
      cb(null, null);
    },
    set(options, value, cb) {
      cb(null);
    }
  }
}