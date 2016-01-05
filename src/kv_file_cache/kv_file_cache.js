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
    throw new Error(`A \`dirname\` option must be provided`);
  }

  mkdirp.sync(dirname);

  const emitter = new EventEmitter();
  const cache = Object.create(null);

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

      // We serialize the data as late as possible to avoid blocking the event loop
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
      cache[filename] = undefined;

      fs.unlink(filename, (err) => {
        if (err) {
          // Cache misses are represented by missing files, so we can ignore this
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