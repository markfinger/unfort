"use strict";
const path = require('path');
const bluebird_1 = require('bluebird');
const sqlite3 = require('sqlite3');
const mkdirp = require('mkdirp');
const lodash_1 = require('lodash');
/**
 * Creates a key/value wrapper around a persistent SQL store.
 *
 * Changes from `set` or `remove` are synchronously made in memory but
 * are not persisted until the `persistChanges` method is called. This
 * is a workaround for sqlite's blocking writes, which prevent any reads
 * from occurring until the write has finished
 */
class PersistentCache {
    constructor(fileName) {
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
        return new bluebird_1.Promise((res, rej) => {
            const directory = path.dirname(this.fileName);
            mkdirp(directory, err => {
                if (err)
                    return rej(err);
                const db = new sqlite3.Database(this.fileName, (err) => {
                    if (err)
                        return rej(err);
                    /*
                     TODO: textual keys allegedly have poor selection performance
          
                     Possible solutions:
                     - A more contextual method with multiple fields: path, mtime, etc?
                     - Use int ids for more performant selections?
                     Would require a key => id map to be maintained, which means more moving parts
                     */
                    db.run(`
          CREATE TABLE IF NOT EXISTS ${this.sqlTableName} (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT
          );
        `, (err) => {
                        if (err)
                            return rej(err);
                        res(db);
                    });
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
                return bluebird_1.Promise.resolve();
            }
            // Flush all data from memory before we start the async write
            this.pendingInserts.clear();
            this.pendingDeletes.clear();
            let insertStatement;
            if (insertParams.length) {
                const insertTokens = lodash_1.range(insertParams.length / 2).map(() => '(?, ?)');
                insertStatement = `
            INSERT OR REPLACE INTO ${this.sqlTableName} (key, value) 
            VALUES ${insertTokens.join(',')};
          `;
            }
            let deleteStatement;
            if (deleteParams.length) {
                const deleteTokens = lodash_1.range(deleteParams.length).map(() => 'key = ?');
                deleteStatement = `DELETE FROM ${this.sqlTableName} WHERE ${deleteTokens.join(' OR ')};`;
            }
            // Flush the changes to disk
            return new bluebird_1.Promise((res, rej) => {
                function applyInserts(cb) {
                    db.run(insertStatement, insertParams, err => {
                        if (err)
                            return rej(err);
                        cb();
                    });
                }
                function applyDeletes(cb) {
                    db.run(deleteStatement, deleteParams, err => {
                        if (err)
                            return rej(err);
                        cb();
                    });
                }
                if (insertStatement && deleteStatement) {
                    applyInserts(() => applyDeletes(res));
                }
                else if (insertStatement) {
                    applyInserts(res);
                }
                else if (deleteStatement) {
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
            return bluebird_1.Promise.resolve(null);
        }
        return this.getConnection()
            .then(db => {
            return new bluebird_1.Promise((res, rej) => {
                db.get(`SELECT value FROM ${this.sqlTableName} WHERE key = ?`, [key], (err, data) => {
                    if (err)
                        return rej(err);
                    if (!data)
                        return res(null);
                    res(data.value);
                });
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
            return new bluebird_1.Promise((res, rej) => {
                db.close(err => {
                    if (err)
                        return rej(err);
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
    _deserializeData(json) {
        let data;
        try {
            data = JSON.parse(json);
        }
        catch (err) {
            err.message = `Error deserializing cached data - ${err.message}`;
            return bluebird_1.Promise.reject(err);
        }
        return bluebird_1.Promise.resolve(data);
    }
}
exports.PersistentCache = PersistentCache;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc2lzdGVudF9jYWNoZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBlcnNpc3RlbnRfY2FjaGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLDJCQUF3QixVQUFVLENBQUMsQ0FBQTtBQUNuQyxNQUFZLE9BQU8sV0FBTSxTQUFTLENBQUMsQ0FBQTtBQUNuQyxNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyx5QkFBc0IsUUFBUSxDQUFDLENBQUE7QUFFL0I7Ozs7Ozs7R0FPRztBQUNIO0lBT0UsWUFBWSxRQUFnQjtRQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQztRQUM1Qix5RUFBeUU7UUFDekUseUVBQXlFO1FBQ3pFLDBFQUEwRTtRQUMxRSxXQUFXO1FBQ1gsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzdCLGdFQUFnRTtRQUNoRSxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFDRCx3QkFBd0I7UUFDdEIsTUFBTSxDQUFDLElBQUksa0JBQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHO1lBQzFCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzlDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRztnQkFDbkIsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDO29CQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRXpCLE1BQU0sRUFBRSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFF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