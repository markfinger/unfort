export function createMockCache() {
  return {
    get(options, cb) {
      cb(null, null);
    },
    set(options, cb) {
      cb(null);
    }
  }
}