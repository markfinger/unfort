"use strict";

const path = require('path');
const Promise = require('bluebird');
const sqlite3 = require('sqlite3');
const mkdirp = require('mkdirp');
const {forEach} = require('lodash/collection');
const {range} = require('lodash/util');

const DB_TABLE_NAME = 'CACHE';

/**
 * Creates a key/value wrapper around a persistent SQL store.
 *
 * Changes from `set` or `remove` are synchronously made in memory but
 * are not persisted until the `persistChanges` method is called. This
 * is a workaround for sqlite's blocking writes, which prevent any reads
 * from occurring until the write has finished
 */
function createPersistentCache({createDatabaseConnection, filename, memoryCache}={}) {
  if (!createDatabaseConnection) {
    if (!filename) {
      throw new Error('A `filename` option must be provided');
    }
    createDatabaseConnection = () => {
      return createSqlite3Database(filename);
    };
  }

  const connection = createDatabaseConnection();

  // An in-memory cache that helps avoid some of the overhead involved with
  // the file system. Note that the memory cache only stores the serialized
  // state of the entries, so there is still a deserialization cost incurred
  // for gets
  memoryCache = createMemoryCache();

  // Mutable maps (k => v) of the changes that should be persisted
  let pendingInserts = Object.create(null);
  let pendingDeletes = Object.create(null);

  function schedulePersistentWrite(key, value) {
    if (pendingDeletes[key]) {
      pendingDeletes[key] = undefined;
    }
    return pendingInserts[key] = value;
  }

  function schedulePersistentDelete(key) {
    if (pendingInserts[key]) {
      pendingInserts[key] = undefined;
    }
    return pendingDeletes[key] = true;
  }

  /**
   * Any writes to SQLite will block concurrent reads, so we defer
   * all write and delete operations until this method is called
   */
  function persistChanges() {
    return connection
      .then(db => {
        const _pendingInserts = pendingInserts;
        pendingInserts = Object.create(null);
        const insertParams = [];
        forEach(_pendingInserts, (value, key) => {
          if (value !== undefined) {
            insertParams.push(key, value);
          }
        });

        const _pendingDeletes = pendingDeletes;
        pendingDeletes = Object.create(null);
        const deleteParams = [];
        forEach(_pendingDeletes, (value, key) => {
          if (value !== undefined) {
            deleteParams.push(key);
          }
        });

        if (!insertParams.length && !deleteParams.length) {
          return Promise.resolve();
        }

        let insertStatement;
        if (insertParams.length) {
          const insertTokens = range(insertParams.length / 2).map(() => '(?, ?)');
          insertStatement = `
            INSERT OR REPLACE INTO ${DB_TABLE_NAME} (key, value) 
            VALUES ${insertTokens.join(',')};
          `;
        }

        let deleteStatement;
        if (deleteParams.length) {
          const deleteTokens = range(deleteParams.length).map(() => 'key = ?');
          deleteStatement = `DELETE FROM ${DB_TABLE_NAME} WHERE ${deleteTokens.join(' OR ')};`;
        }

        // Flush the changes to disk
        return new Promise((res, rej) => {
          function applyInserts(cb) {
            db.run(insertStatement, insertParams, err => {
              if (err) return rej(err);
              cb();
            });
          }

          function applyDeletes(cb) {
            db.run(deleteStatement, deleteParams, err => {
              if (err) return rej(err);
              cb();
            });
          }

          if (insertStatement && deleteStatement) {
            applyInserts(() => applyDeletes(res));
          } else if (insertStatement) {
            applyInserts(res);
          } else if (deleteStatement) {
            applyDeletes(res);
          }
        });
      });
  }

  /**
   * Given a key, returns a promise resolving to either an associated value
   * or null.
   *
   * @param {String} key
   * @returns {Promise}
   */
  function get(key) {
    const inMemoryValue = memoryCache.get(key);
    if (inMemoryValue) {
      return deserializeData(inMemoryValue);
    }

    return connection
      .then(db => {
        return new Promise((res, rej) => {
          db.get(
            `SELECT value FROM ${DB_TABLE_NAME} WHERE key = ?`,
            [key],
            (err, data) => {
              if (err) return rej(err);
              if (!data) return res(null);
              res(data.value);
            }
          );
        });
      })
      .then(data => {
        memoryCache.set(key, data);
        if (data) {
          return deserializeData(data);
        }
        return null;
      });
  }

  /**
   * Associates a key/value combination in both memory and persistent stores.
   *
   * @param {String} key
   * @param {*} value
   * @returns {Promise}
   */
  function set(key, value) {
    // Note: serializing large JSON structures can block the event loop. We could defer,
    // in an attempt to avoid blocking the event loop, but that opens up a potential
    // world of pain if the objects were ever mutated
    const json = JSON.stringify(value);
    memoryCache.set(key, json);
    schedulePersistentWrite(key, json);
  }

  /**
   * Removes any value associated with the provided key.
   *
   * @param {String} key
   */
  function remove(key) {
    memoryCache.remove(key);
    schedulePersistentDelete(key);
  }

  function closeDatabaseConnection() {
    return connection
      .then(db => {
        return new Promise((res, rej) => {
          db.close(err => {
            if (err) return rej(err);
            return res();
          });
        });
      });
  }

  return {
    get,
    set,
    remove,
    persistChanges,
    closeDatabaseConnection
  };
}

/**
 * Simple k/v store that operates in memory
 *
 * @returns {Object}
 */
function createMemoryCache() {
  const cache = Object.create(null);
  return {
    get(key) {
      return cache[key] || null;
    },
    set(key, value) {
      cache[key] = value;
    },
    remove(key) {
      cache[key] = null;
    }
  };
}

function createSqlite3Database(filename) {
  return new Promise((res, rej) => {
    const directory = path.dirname(filename);
    mkdirp(directory, err => {
      if (err) return rej(err);

      const db = new sqlite3.Database(filename, (err) => {
        if (err) return rej(err);

        /*
         TODO: textual keys allegedly have poor selection performance

         Possible solutions:
         - A more contextual method with multiple fields: path, mtime, etc?
         - Use int ids for more performant selections?
           Would require a key => id map to be maintained, which means more moving parts
         */
        db.run(
          `
            CREATE TABLE IF NOT EXISTS ${DB_TABLE_NAME} (
              key TEXT PRIMARY KEY NOT NULL,
              value TEXT
            );
          `,
          (err) => {
            if (err) return rej(err);
            res(db);
          }
        );
      });
    });
  });
}

function deserializeData(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch(err) {
    err.message = `Error deserializing cached data - ${err.message}`;
    return Promise.reject(err);
  }
  return Promise.resolve(data);
}

module.exports = {
  createPersistentCache,
  createMemoryCache,
  createSqlite3Database
};