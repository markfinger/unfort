import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import mkdirp from 'mkdirp';
import {assert} from '../../utils/assert';
import {murmurFilename} from '../utils';
import {createSqliteCache} from '../sqlite_cache';

describe('sqlite_cache', () => {
  describe('#createSqliteCache', () => {
    const db = path.join(__dirname, 'sqlite.db');
    const TEST_KEY = murmurFilename('test');

    // Ensure that data does not persist across tests
    function removeDB() {
      try {
        fs.unlinkSync(db);
      } catch(err) {
        if (err.code && err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
    beforeEach(removeDB);
    after(removeDB);

    //it('should should throw if `dirname` is not specified', () => {
    //  try {
    //    createFileCache();
    //  } catch(err) {
    //    assert.equal(err.message, 'A `dirname` option must be provided')
    //  }
    //});

    it('should be able to set values', (done) => {
      const cache = createSqliteCache(db);

      cache.set(TEST_KEY, {foo: 'bar'}, (err) => {
        assert.isNull(err);

        cache.get(TEST_KEY, (err, data) => {
          assert.isNull(err);
          assert.deepEqual(data, {foo: 'bar'});
          done();
        })
      });
    });
  });
});