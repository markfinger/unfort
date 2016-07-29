"use strict";

const test = require('ava');
const tmp = require('tmp');
const {createPersistentCache} = require('../persistent_cache');

// Be aware that persistence slows down the test suite, due to the IO
// overhead of sqlite's initialization. Whenever possible, consolidate
// persistence tests to keep the test suite performant

const TEST_DB = tmp.fileSync().name;

test('should accept a path and create a sqlite db that can read/write data that persists across connections', (t) => {
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
          t.is(data1, 'some data');
          t.is(data2, 'some other data');

          cache2.remove('test 1');
          return cache2.persistChanges()
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
                  t.is(data1, null);
                  t.is(data2, 'some other data');
                })
                .then(cache3.closeDatabaseConnection)
                .then(() => 'test complete');
            });
        });
    });

  return testRead
    .then(output => t.is(output, 'test complete'));
});