import EventEmitter from 'events';
import {generateMurmurHash} from './utils';

export function createMemoryCache(options={}) {
  const {generateHash=generateMurmurHash} = options;

  const cache = Object.create(null);
  const events = new EventEmitter();

  return {
    get(key) {
      key = generateHash(key);

      if (cache[key] === undefined) {
        return Promise.resolve(null);
      }

      const json = cache[key];

      let data;
      try {
        data = JSON.parse(json);
      } catch(err) {
        events.emit('error', err);
        return Promise.reject(err);
      }

      return Promise.resolve(data);
    },
    set(key, value) {
      key = generateHash(key);

      let json;
      try {
        json = JSON.stringify(value);
      } catch(err) {
        events.emit('error', err);
        return Promise.reject(err);
      }

      cache[key] = json;

      return Promise.resolve(value);
    },
    invalidate(key) {
      key = generateHash(key);

      cache[key] = undefined;

      return Promise.resolve(null);
    },
    events,
    _memoryCache: cache
  };
}