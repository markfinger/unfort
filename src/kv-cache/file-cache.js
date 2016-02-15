import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import mkdirp from 'mkdirp';
import promisify from 'promisify-node';
import {isString} from 'lodash/lang';
import {generateMurmurHash} from './utils';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

export function createFileCache(dirname, options={}) {
  if (!isString(dirname)) {
    throw new Error('A `dirname` option must be provided');
  }

  const {generateHash=generateMurmurHash} = options;

  // We create the cache dir in a *synchronous* call so that we don't have
  // to add any ready-state detection to the `set` function
  mkdirp.sync(dirname);

  // An in-memory cache that helps avoid some of the overhead involved with
  // the file system. Note that the cache only stores serialized state of
  // the entries
  const cache = Object.create(null);

  const events = new EventEmitter();

  /**
   * Given a key, returns a promise resolving to either an associated value
   * or null.
   *
   * @param {String} key
   * @returns {Promise}
   */
  function get(key) {
    const file = path.join(dirname, generateHash(key) + '.json');

    if (cache[file]) {
      let data;
      try {
        data = JSON.parse(cache[file]);
      } catch(err) {
        err.message = `Error reading cache file: ${file} - ${err.message}`;
        events.emit('error', err);
        return Promise.reject(err);
      }
      return Promise.resolve(data);
    }

    return readFile(file, 'utf8')
      .then(json => {
        cache[file] = json;

        return JSON.parse(json);
      })
      .catch(err => {
        if (err.code === 'ENOENT') {
          // Missing files represent cache misses so we can safely ignore this
          return null;
        }

        err.message = `Error reading cache file: ${file} - ${err.message}`;

        return Promise.reject(err);
      });
  }

  /**
   * Associates a key/value combination in memory and the filesystem.
   *
   * Note: writes to memory are synchronous, writes to disk are asynchronous.
   *
   * @param {String} key
   * @param {*} value
   * @returns {Promise}
   */
  function set(key, value) {
    const filename = path.join(dirname, generateHash(key) + '.json');

    // Note: serializing large JSON structures can block the event loop. We could defer,
    // in an attempt to avoid blocking the event loop, but there are a couple of issues
    // that emerge:
    //
    // - Deferring opens up the possibility for race conditions to emerge as `get` and
    //   `invalidate` assume that the in-memory cache (backed up by the file system) is
    //   a canonical source of truth.
    //
    // - It removes any guarantee that the provided value wont be mutated before we start
    //   serializing it.
    let json;
    try {
      json = JSON.stringify(value);
    } catch(err) {
      events.emit('error', err);
      return Promise.reject(err);
    }

    // Ensure that the in-memory cache is updated
    cache[filename] = json;

    return writeFile(filename, json, 'utf8')
      .catch(err => {
        events.emit(err);
        return Promise.reject(err);
      })
      .then(() => value);
  }

  /**
   * Removes any value associated with the provided key.
   *
   * Note: writes to memory are synchronous, writes to disk are asynchronous.
   *
   * @param {String} key
   */
  function invalidate(key) {
    const filename = path.join(dirname, generateHash(key) + '.json');

    // Ensure that the in-memory cache is fresh
    cache[filename] = undefined;

    return unlink(filename).catch(err => {
      // We can ignore missing files, as it indicates that the entry
      // wasn't in the cache
      if (err.code === 'ENOENT') {
        return;
      }

      events.emit('error', err);
      return Promise.resolve(err);
    });
  }

  return {
    get,
    set,
    invalidate,
    events,
    _memoryCache: cache
  };
}