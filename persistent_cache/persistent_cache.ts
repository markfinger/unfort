import * as path from 'path';
import { Promise } from 'bluebird';
import * as sqlite3 from 'sqlite3';
import * as mkdirp from 'mkdirp';
import { range } from 'lodash';

/**
 * Creates a key/value wrapper around a persistent SQL store.
 *
 * Changes from `set` or `remove` are synchronously made in memory but
 * are not persisted until the `persistChanges` method is called. This
 * is a workaround for sqlite's blocking writes, which prevent any reads
 * from occurring until the write has finished
 */
export class PersistentCache {
  fileName: string;
  sqlTableName: string;
  memoryCache: Map<string, string | null>;
  pendingInserts: Map<string, string>;
  pendingDeletes: Set<string>;
  _connection: Promise<any>;
  constructor(fileName: string) {
    this.fileName = fileName;
    this.sqlTableName = 'CACHE';
    // An in-memory cache that helps avoid some of the overhead involved with
    // the file system. Note that the memory cache only stores the serialized
    // state of the entries, so there is still a deserialization cost incurred
    // for gets
    this.memoryCache = new Map();
    // Mutable maps (k => v) of the changes that should be persisted
    this.pendingInserts = new Map();
    this.pendingDeletes = new Set();
  }
  createDatabaseConnection() {
    return new Promise((res, rej) => {
      const directory = path.dirname(this.fileName);
      mkdirp(directory, err => {
        if (err) return rej(err);

        const db = new sqlite3.Database(this.fileName, (err) => {
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
          CREATE TABLE IF NOT EXISTS ${this.sqlTableName} (
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
  getConnection() {
    if (!this._connection) {
      this._connection = this.createDatabaseConnection();
    }
    return this._connection;
  }
  /**
   * Any writes to SQLite will block concurrent reads, so we defer
   * all write and delete operations until this method is called
   */
  persistChanges() {
    return this.getConnection()
      .then(db => {
        const insertParams = [];
        for (const [key, value] of this.pendingInserts) {
          if (value !== undefined) {
            insertParams.push(key, value);
          }
        }

        const deleteParams = [];
        for (const key of this.pendingDeletes) {
          deleteParams.push(key);
        }

        if (!insertParams.length && !deleteParams.length) {
          return Promise.resolve();
        }

        // Flush all data from memory before we start the async write
        this.pendingInserts.clear();
        this.pendingDeletes.clear();

        let insertStatement;
        if (insertParams.length) {
          const insertTokens = range(insertParams.length / 2).map(() => '(?, ?)');
          insertStatement = `
            INSERT OR REPLACE INTO ${this.sqlTableName} (key, value) 
            VALUES ${insertTokens.join(',')};
          `;
        }

        let deleteStatement;
        if (deleteParams.length) {
          const deleteTokens = range(deleteParams.length).map(() => 'key = ?');
          deleteStatement = `DELETE FROM ${this.sqlTableName} WHERE ${deleteTokens.join(' OR ')};`;
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
   */
  get(key) {
    if (this.memoryCache.has(key)) {
      const inMemoryValue = this.memoryCache.get(key);
      if (inMemoryValue) {
        return this._deserializeData(inMemoryValue);
      }
      // Handle cases where we've already hit the file system and there
      // is no data available
      return Promise.resolve(null);
    }

    return this.getConnection()
      .then(db => {
        return new Promise((res, rej) => {
          db.get(
            `SELECT value FROM ${this.sqlTableName} WHERE key = ?`,
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
        this.memoryCache.set(key, data);
        if (data) {
          return this._deserializeData(data);
        }
        return null;
      });
  }
  /**
   * Associates a key/value combination in both memory and persistent stores.
   */
  set(key, value) {
    // Note: serializing large JSON structures can block the event loop. We could defer,
    // in an attempt to avoid blocking the event loop, but that opens up a potential
    // world of pain if the objects were ever mutated
    const json = JSON.stringify(value);
    this.memoryCache.set(key, json);
    this._schedulePersistentWrite(key, json);
  }
  /**
   * Removes any value associated with the provided key.
   */
  remove(key) {
    this.memoryCache.set(key, null);
    this._schedulePersistentDelete(key);
  }
  closeDatabaseConnection() {
    return this.getConnection()
      .then(db => {
        return new Promise((res, rej) => {
          db.close(err => {
            if (err) return rej(err);
            return res();
          });
        });
      });
  }
  _schedulePersistentWrite(key, value) {
    this.pendingInserts.set(key, value);
    this.pendingDeletes.delete(key);
  }
  _schedulePersistentDelete(key) {
    this.pendingInserts.delete(key);
    this.pendingDeletes.add(key);
  }
  _deserializeData(json: string) {
    let data;
    try {
      data = JSON.parse(json);
    } catch(err) {
      err.message = `Error deserializing cached data - ${err.message}`;
      return Promise.reject(err);
    }
    return Promise.resolve(data);
  }
}