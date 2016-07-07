"use strict";

const path = require('path');
const {assert} = require('../../utils/assert');
const rimraf = require('rimraf');
const {createPersistentCache} = require('../persistent_cache');

describe('persistent_cache/persistent_cache', () => {
  describe('#createPersistentCache', () => {
    it('should fetch from the memory store, before hitting the db', () => {
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

      return assert.isFulfilled(
        cache.get('test')
          .then(data => assert.equal(data, 'some data'))
      );
    });
    it('should fetch from db, if the memory store is missing data', () => {
      const cache = createPersistentCache({
        createDatabaseConnection() {
          return Promise.resolve({
            get(sql, params, cb) {
              cb(null, {value: JSON.stringify('from the db')});
            }
          });
        }
      });

      return assert.isFulfilled(
        cache.get('test')
          .then(data => assert.equal(data, 'from the db'))
      );
    });
    describe('persistence', () => {
      // Be aware that persistence slows down the test suite, due to the IO
      // overhead of sqlite's initialization. Whenever possible, consolidate
      // persistence tests to keep the test suite performant

      const TEST_DIR = path.join(__dirname, '__test_data__');
      const TEST_DB = path.join(TEST_DIR, 'read_write_test.db');

      after(() => {
        rimraf.sync(TEST_DIR);
      });

      it('should accept a path and create a sqlite db that can read/write data that persists across connections', () => {
        const cache1 = createPersistentCache({
          filename: TEST_DB
        });

        cache1.set('test 1', 'some data');
        cache1.set('test 2', 'some other data');

        const testRead = cache1.persistChanges()
          .then(cache1.closeDatabaseConnection)
          .then(() => {
            const cache2 = createPersistentCache({
              filename: TEST_DB
            });

            return Promise.all([
              cache2.get('test 1'),
              cache2.get('test 2')
            ])
              .then(([data1, data2]) => {
                assert.equal(data1, 'some data');
                assert.equal(data2, 'some other data');

                cache2.remove('test 1');
                cache2.persistChanges()
                  .then(cache2.closeDatabaseConnection)
                  .then(() => {
                    const cache3 = createPersistentCache({
                      filename: TEST_DB
                    });

                    return Promise.all([
                      cache3.get('test 1'),
                      cache3.get('test 2')
                    ])
                      .then(([data1, data2]) => {
                        assert.equal(data1, null);
                        assert.equal(data2, 'some other data');
                      })
                      .then(cache3.closeDatabaseConnection);
                  });
              });
          });

        return assert.isFulfilled(testRead);
      });
    });
  });
});