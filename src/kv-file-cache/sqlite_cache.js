import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import mkdirp from 'mkdirp';
import {isString, isObject} from 'lodash/lang';
import murmur from 'imurmurhash';

export function createSqliteCache(file) {
  const createSql = `
    CREATE TABLE IF NOT EXISTS bucket (
      key INTEGER PRIMARY KEY,
      val BLOB
    )
  `;
  const getSql = 'SELECT val FROM bucket WHERE key = ?';
  const deleteSql = 'DELETE FROM bucket WHERE key = ?';
  const replaceSql = 'REPLACE INTO bucket (key, val) VALUES (?, ?)';
  const insertSql = 'INSERT INTO bucket (key, val) VALUES (?, ?)';
  const upsertSql = 'INSERT OR REPLACE INTO bucket (key, val) VALUES (?, ?)';

  let isReady = false;
  let _onReady = [];
  let initErr;
  function onReady(cb) {
    if (isReady || initErr) {
      return cb(initErr);
    }
    _onReady.push(cb);
  }

  const db = new sqlite3.Database(file, (err) => {
    if (err) {
      initErr = err;
      if (_onReady.length) {
        _onReady.map(cb => cb(initErr));
      }
      return;
    }

    db.run(createSql, (err) => {
      if (err) {
        initErr = err;
      }
      if (_onReady.length) {
        _onReady.map(cb => cb(initErr));
      }
      isReady = true;
    });
  });

  return {
    get(key, cb) {
      key = murmur(key).result();

      onReady(err => {
        if (err) return cb(err);

        db.get(getSql, key, (err, row) => {
          if (err) return cb(err);
          if (!row) return cb(null, null);

          const data = JSON.parse(row.val);
          cb(null, data);
        });
      });
    },
    set(key, value, cb) {
      key = murmur(key).result();
      const json = JSON.stringify(value);

      onReady(err => {
        if (err) return cb(err);

        db.run(upsertSql, key, json, (err) => {
          if (err) return cb(err);
          if (cb) cb(null);
        });
      });
    }
  }
}