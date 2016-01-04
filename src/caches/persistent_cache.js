import fs from 'fs';
import path from 'path';
import {createHash} from 'crypto';
import mkdirp from 'mkdirp';
import {isString, isObject} from 'lodash/lang';
import {isFile} from '../fs/utils';

export function generateFilenameFromCacheKey(cacheKey) {
  const md5 = createHash('md5');
  md5.update(cacheKey);
  return md5.digest('hex') + '.json';
}

export function createPersistentCache(options) {
  if (!isObject(options)) {
    options = {};
  }

  const {dirname} = options;

  if (!isString(dirname)) {
    throw new Error(`A \`dirname\` option must be provided: ${JSON.stringify(options)}`);
  }

  let _initError = null;
  let _isReady = false;
  let _onReady = [];

  function onReady(cb) {
    if (_isReady) {
      cb(_initError);
    } else {
      _onReady.push(cb);
    }
  }

  mkdirp(dirname, (err) => {
    _initError = err;
    _isReady = true;

    if (onReady.length) {
      _onReady.forEach(cb => cb(err));
      _onReady = null;
    }
  });

  return {
    get(key, cb) {
      onReady((err) => {
        if (err) return cb(err);

        const filename = path.join(dirname, generateFilenameFromCacheKey(key));

        isFile(filename, (err, isFile) => {
          if (err) return cb(err);

          if (!isFile) {
            return cb(null, null);
          }

          fs.readFile(filename, 'utf8', (err, json) => {
            if (err) return cb(err);

            let data;

            try {
              data = JSON.parse(json);
            } catch(err) {
              cb(err);
            }

            cb(null, data);
          });
        });
      });
    },
    set(key, value, cb) {
      onReady((err) => {
        if (err) return cb(err);

        const filename = path.join(dirname, generateFilenameFromCacheKey(key));

        let data;
        try {
          data = JSON.stringify(value);
        } catch(err) {
          return cb(err);
        }

        fs.writeFile(filename, data, (err) => {
          if (err) return cb(err);

          cb(null);
        });
      });
    }
  }
}