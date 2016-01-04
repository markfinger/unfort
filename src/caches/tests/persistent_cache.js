import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import {assert} from '../../utils/assert';
import {createPersistentCache, generateFilenameFromCacheKey} from '../persistent_cache';

const outputRoot = path.join(__dirname, 'persistent_cache');

describe('caches/persistent_cache', () => {
  describe('#generateFilenameFromCacheKey', () => {
    it('should accept a string and return a file named after a hex digest', () => {
      assert.equal(
        generateFilenameFromCacheKey('test'),
        '098f6bcd4621d373cade4e832627b4f6.json'
      );
    });
  });
  describe('#createPersistentCache', () => {
    it('should should throw if `dirname` is not specified', () => {
      try {
        createPersistentCache();
      } catch(err) {
        assert.equal(err.message, `A \`dirname\` option must be provided: ${JSON.stringify({})}`)
      }
    });
    it('should create a cache directory if it does not exist', (done) => {
      const dirname = path.join(outputRoot, 'directory_creation_test');

      rimraf(dirname, (err) => {
        assert.isNull(err);

        const cache = createPersistentCache({dirname});
        cache.get('test', () => {
          fs.stat(dirname, (err, stat) => {
            assert.isTrue(stat.isDirectory());
            done();
          });
        });
      });
    });
    it('should be able to read from a cache directory', (done) => {
      const dirname = path.join(outputRoot, 'cache_read_test');
      const cache = createPersistentCache({dirname});

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
      const dirname = path.join(outputRoot, 'cache_write_test');

      // Ensure that data does not persist across test runs
      rimraf(dirname, (err) => {

        const cache = createPersistentCache({dirname});

        cache.set('test', {bar: 'foo'}, (err) => {
          assert.isNull(err);

          const json = fs.readFileSync(path.join(dirname, '098f6bcd4621d373cade4e832627b4f6.json'));
          assert.equal(json, JSON.stringify({bar: 'foo'}));

          done();
        });
      });
    });
    it('should be able to read and write from the cache', (done) => {
      const dirname = path.join(outputRoot, 'cache_read_write_test');

      // Ensure that data does not persist across test runs
      rimraf(dirname, (err) => {
        assert.isNull(err);

        const cache = createPersistentCache({dirname});

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
    });
  });
});