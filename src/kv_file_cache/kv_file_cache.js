import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import {createHash} from 'crypto';
import mkdirp from 'mkdirp';
import {isString, isObject} from 'lodash/lang';

export function generateFilenameFromCacheKey(cacheKey) {
  const hash = createHash('md5').update(cacheKey).digest('hex');
  return hash + '.json';
}

export function createKVFileCache(options={}) {
  const {dirname} = options;
  if (!isString(dirname)) {
    throw new Error('A `dirname` option must be provided');
  }

  // We create the cache dir in a *synchronous* call so that we don't have
  // to add any ready-state detection to the `set` function
  mkdirp.sync(dirname);

  // An in-memory cache that helps avoid some of the overhead involved with
  // the file system. Note that the cache only stores serialized state of
  // the entries
  const cache = Object.create(null);

  const emitter = new EventEmitter();

  return {
    cache,
    get(key, cb) {
      const filename = path.join(dirname, generateFilenameFromCacheKey(key));

      if (cache[filename]) {
        let data;
        try {
          data = JSON.parse(cache[filename]);
        } catch(err) {
          emitter.emit('error', err);
          return cb(err);
        }
        return cb(null, data);
      }

      fs.readFile(filename, 'utf8', (err, json) => {
        if (err) {
          // Cache misses are represented by missing files
          if (err.code === 'ENOENT') {
            return cb(null, null);
          }

          emitter.emit('error', err);
          return cb(err);
        }

        cache[filename] = json;

        let data;
        try {
          data = JSON.parse(json);
        } catch(err) {
          emitter.emit('error', err);
          return cb(err);
        }

        cb(null, data);
      });
    },
    set(key, value, cb) {
      const filename = path.join(dirname, generateFilenameFromCacheKey(key));

      // Note: serializing large JSON structures can block the event loop. Might be worth
      // investigating deferring this. One issue with deferring is that it may open up the
      // possibility for race conditions to emerge as `get` and `invalidate` assume that
      // the in-memory cache (backed up by the FS) is a canonical source of truth
      let json;
      try {
        json = JSON.stringify(value);
      } catch(err) {
        emitter.emit('error', err);
        if (cb) {
          return cb(err);
        } else {
          return;
        }
      }

      // Ensure that the in-memory cache is fresh
      cache[filename] = json;

      fs.writeFile(filename, json, (err) => {
        if (err) {
          emitter.emit('error', err);
        }

        if (cb) {
          cb(err);
        }
      });
    },
    invalidate(key, cb) {
      const filename = path.join(dirname, generateFilenameFromCacheKey(key));

      // Ensure that the in-memory cache is fresh
      cache[filename] = undefined;

      // Remove the entry's file
      fs.unlink(filename, (err) => {
        if (err) {
          // We can ignore missing files, as it indicates that the entry
          // wasn't in the cache
          if (err.code === 'ENOENT') {
            if (cb) {
              return cb(null);
            }
            return;
          }

          emitter.emit('error', err);
          if (cb) {
            return cb(err);
          }
        }

        if (cb) {
          cb(null);
        }
      });
    },
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.removeListener.bind(emitter)
  }
}