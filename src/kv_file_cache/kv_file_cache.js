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

  const emitter = new EventEmitter();

  let isReady = false;
  let _onceReady = [];

  mkdirp(dirname, (err) => {
    isReady = true;

    emitter.emit('ready');

    if (err) {
      emitter.emit('error', err);
    } else {
      _onceReady.forEach(cb => cb());
    }
  });

  function onceReady(cb) {
    if (isReady) {
      cb();
    } else {
      _onceReady.push(cb);
    }
  }

  return {
    get(key, cb) {
      const filename = path.join(dirname, generateFilenameFromCacheKey(key));

      onceReady(() => {
        fs.readFile(filename, 'utf8', (err, json) => {
          if (err) {
            // Cache misses are represented by missing files
            if (err.code === 'ENOENT') {
              return cb(null, null);
            }

            emitter.emit('error', err);
            return cb(err);
          }

          let data;
          try {
            data = JSON.parse(json);
          } catch(err) {
            emitter.emit('error', err);
            return cb(err);
          }

          cb(null, data);
        });
      });
    },
    set(key, value, cb) {
      const filename = path.join(dirname, generateFilenameFromCacheKey(key));
      const data = JSON.stringify(value);

      onceReady(() => {
        fs.writeFile(filename, data, (err) => {
          if (err) {
            emitter.emit('error', err);
          }

          if (cb) {
            cb(err);
          }
        });
      });
    },
    invalidate(key, cb) {
      const filename = path.join(dirname, generateFilenameFromCacheKey(key));

      onceReady(() => {
        fs.unlink(filename, (err) => {
          if (err) {
            // Cache misses are represented by missing files, so we can ignore this
            if (err.code === 'ENOENT') {
              if (cb) {
                return cb(null)
              }
              return;
            }
            emitter.emit('error', err);
          }

          if (cb) {
            cb(err);
          }
        });
      });
    },
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.removeListener.bind(emitter)
  }
}