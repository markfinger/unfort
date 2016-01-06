import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import mkdirp from 'mkdirp';
import {isString, isObject} from 'lodash/lang';
import {murmurFilename} from './utils';

export function createFileCache(dirname, options={}) {
  if (!isString(dirname)) {
    throw new Error('A `dirname` option must be provided');
  }

  const {generateFilename=murmurFilename} = options;

  // We create the cache dir in a *synchronous* call so that we don't have
  // to add any ready-state detection to the `set` function
  mkdirp.sync(dirname);

  // An in-memory cache that helps avoid some of the overhead involved with
  // the file system. Note that the cache only stores serialized state of
  // the entries
  const cache = Object.create(null);

  const emitter = new EventEmitter();

  return {
    get,
    set,
    invalidate,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.removeListener.bind(emitter),
    dirname,
    generateFilename,
    cache
  };

  /**
   * Given a key and a callback, an associated value (if any) will be provided
   * to the callback.
   *
   * If no value is associated with the key, null is provided.
   *
   * @param {String} key
   * @param {Function} cb - a callback function accepting err & data args
   */
  function get(key, cb) {
    const filename = path.join(dirname, generateFilename(key));

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
  }

  /**
   * Associates a key/value combination in the cache.
   *
   * Accepts an optional callback which will be called either when an error
   * is encountered, or when the changes have been been persisted to the
   * file system.
   *
   * @param {String} key
   * @param {*} value
   * @param {Function} [cb]
   * @returns {*}
   */
  function set(key, value, cb) {
    const filename = path.join(dirname, generateFilename(key));

    // Note: serializing large JSON structures can block the event loop. Might be worth
    // investigating deferring this.
    //
    // One issue with deferring is that it may open up the possibility for race conditions
    // to emerge as `get` and `invalidate` assume that the in-memory cache (backed up by
    // the file system) is a canonical source of truth.
    //
    // Another issue is that it removes any guarantee that the provided value wont be
    // mutated before we start serializing it.
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
  }

  /**
   * Removes any value associated with the provided key.
   *
   * Accepts an optional callback which will be called either when an error
   * is encountered, or when the changes have been been persisted to the
   * file system.
   *
   * @param {String} key
   * @param {Function} [cb]
   */
  function invalidate(key, cb) {
    const filename = path.join(dirname, generateFilename(key));

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
  }
}