"use strict";

const test = require('ava');
const {createPersistentCache} = require('../persistent_cache');

test('should fetch from the memory store, before hitting the db', (t) => {
  const cache = createPersistentCache({
    createDatabaseConnection() {
      return Promise.resolve({
        get() {
          throw new Error('should not be called');
        }
      });
    }
  });

  cache.set('test', 'some data');

  return cache.get('test')
    .then(data => t.is(data, 'some data'));
});

test('should fetch from db, if the memory store is missing data', (t) => {
  const cache = createPersistentCache({
    createDatabaseConnection() {
      return Promise.resolve({
        get(sql, params, cb) {
          cb(null, {value: JSON.stringify('from the db')});
        }
      });
    }
  });

  return cache.get('test')
    .then(data => t.is(data, 'from the db'));
});