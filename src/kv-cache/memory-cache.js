import EventEmitter from 'events';
import {generateMurmurHash} from './utils';

export function createMemoryCache(options={}) {
  const {generateHash=generateMurmurHash} = options;

  const cache = Object.create(null);
  const events = new EventEmitter();

  return {
    get(key, cb) {
      key = generateHash(key);

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
      key = generateHash(key);

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
      key = generateHash(key);

      cache[key] = undefined;

      if (cb) {
        cb(null);
      }
    },
    events,
    _memoryCache: cache
  }
}