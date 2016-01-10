import EventEmitter from 'events';
import murmur from 'imurmurhash';

export function createMemoryCache() {
  const cache = Object.create(null);
  const events = new EventEmitter();

  return {
    get(key, cb) {
      key = murmur(key).result();

      if (cache[key] === undefined) {
        return cb(null, null);
      }

      const json = cache[key];

      let data;
      try {
        data = JSON.parse(json);
      } catch(err) {
        events.emit('error', err);
        return cb(err);
      }

      return cb(null, data);
    },
    set(key, value, cb) {
      key = murmur(key).result();

      let json;
      try {
        json = JSON.stringify(value);
      } catch(err) {
        events.emit('error', err);
        if (cb) {
          return cb(err);
        }
      }

      cache[key] = json;

      if (cb) {
        cb(null);
      }
    },
    invalidate(key, cb) {
      key = murmur(key).result();

      cache[key] = undefined;

      if (cb) {
        cb(null);
      }
    },
    events,
    _memoryCache: cache
  }
}