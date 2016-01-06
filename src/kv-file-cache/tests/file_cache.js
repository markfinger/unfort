import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import mkdirp from 'mkdirp';
import {assert} from '../../utils/assert';
import {createFileCache, generateFilenameFromCacheKey} from '../file_cache';

describe('file_cache', () => {
  describe('#generateFilenameFromCacheKey', () => {
    it('should accept a string and return a file named after a hex digest', () => {
      assert.equal(
        generateFilenameFromCacheKey('test'),
        '098f6bcd4621d373cade4e832627b4f6.json'
      );
    });
  });
  describe('#createFileCache', () => {
    const dirname = path.join(__dirname, 'cache_test_dir');
    const TEST_KEY_FILENAME = path.join(dirname, generateFilenameFromCacheKey('test'));

    // Ensure that data does not persist across tests
    function removeDirname(cb) {
      rimraf(dirname, (err) => {
        if (err) return cb(err);
        cb();
      });
    }
    beforeEach(removeDirname);
    after(removeDirname);

    it('should should throw if `dirname` is not specified', () => {
      try {
        createFileCache();
      } catch(err) {
        assert.equal(err.message, 'A `dirname` option must be provided')
      }
    });

    it('should be able to read from a cache directory', (done) => {
      mkdirp.sync(dirname);

      fs.writeFileSync(
        TEST_KEY_FILENAME,
        JSON.stringify({foo: 'bar'})
      );

      const cache = createFileCache({dirname});

      cache.get('test', (err, data) => {
        assert.isNull(err);
        assert.deepEqual(data, {foo: 'bar'});

        cache.get('missing', (err, data) => {
          assert.isNull(err);
          assert.isNull(data);
          done();
        });
      });
    });
    it('should be able to write to a cache directory', (done) => {
      const cache = createFileCache({dirname});

      cache.set('test', {bar: 'foo'}, (err) => {
        assert.isNull(err);

        assert.equal(
          fs.readFileSync(TEST_KEY_FILENAME, 'utf8'),
          JSON.stringify({bar: 'foo'})
        );

        done();
      });
    });
    it('should be able to read and write from the cache', (done) => {
      const cache = createFileCache({dirname});

      cache.get('test', (err, data) => {
        assert.isNull(err);
        assert.isNull(data);

        cache.set('test', {foo: 'bar'}, (err) => {
          assert.isNull(err);

          cache.get('test', (err, data) => {
            assert.isNull(err);
            assert.deepEqual(data, {foo: 'bar'});
            done();
          });
        });
      });
    });
    it('should be able to invalidate an entry in the cache', (done) => {
      const cache = createFileCache({dirname});

      cache.set('test', {foo: 'bar'}, (err) => {
        assert.isNull(err);

        cache.invalidate('test', (err) => {
          assert.isNull(err);

          cache.get('test', (err, data) => {
            assert.isNull(err);
            assert.isNull(data);
            done();
          });
        });
      });
    });
    it('should remove the cache file when invalidating an entry', (done) => {
      const cache = createFileCache({dirname});

      cache.set('test', {foo: 'bar'}, (err) => {
        assert.isNull(err);

        const stat = fs.statSync(TEST_KEY_FILENAME);
        assert.isTrue(stat.isFile());

        cache.invalidate('test', (err) => {
          assert.isNull(err);

          fs.stat(TEST_KEY_FILENAME, (err) => {
            assert.instanceOf(err, Error);
            assert.equal(err.code, 'ENOENT');
            done();
          });
        });
      });
    });
    it('should populate an in-memory cache when setting entries', (done) => {
      const cache = createFileCache({dirname});

      cache.set('test', {foo: 'bar'}, (err) => {
        assert.isNull(err);

        assert.equal(
          cache.cache[TEST_KEY_FILENAME],
          JSON.stringify({foo: 'bar'})
        );
        done();
      });
    });
    it('should fetch from the in-memory cache before hitting the FS', (done) => {
      const cache = createFileCache({dirname});

      cache.cache[TEST_KEY_FILENAME] = '{"test": 1}';

      cache.get('test', (err, data) => {
        assert.isNull(err);
        assert.deepEqual(data, {test: 1});
        done();
      });
    });
    it('should remove entries from the in-memory cache when they are invalidated', (done) => {
      const cache = createFileCache({dirname});

      cache.cache[TEST_KEY_FILENAME] = '{"test": 1}';

      cache.invalidate('test', (err) => {
        assert.isNull(err);
        assert.isUndefined(cache.cache[TEST_KEY_FILENAME]);
        done();
      });
    });
  });
});