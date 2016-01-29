import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import mkdirp from 'mkdirp';
import {assert} from '../../utils/assert';
import {createFileCache} from '../file-cache';
import {generateMurmurHash} from '../utils';

describe('file-cache', () => {
  describe('#createFileCache', () => {
    const dirname = path.join(__dirname, 'cache_test_dir');
    const TEST_KEY_FILENAME = path.join(dirname, generateMurmurHash('test') + '.json');

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

    it('should be able to read from a cache directory', () => {
      mkdirp.sync(dirname);

      fs.writeFileSync(
        TEST_KEY_FILENAME,
        JSON.stringify({foo: 'bar'})
      );

      const cache = createFileCache(dirname);

      return cache.get('test').then(data => {
        assert.deepEqual(data, {foo: 'bar'});

        return cache.get('missing').then(data => {
          assert.isNull(data);
        });
      });
    });
    it('should be able to write to a cache directory', () => {
      const cache = createFileCache(dirname);

      return cache.set('test', {bar: 'foo'}).then(() => {
        assert.equal(
          fs.readFileSync(TEST_KEY_FILENAME, 'utf8'),
          JSON.stringify({bar: 'foo'})
        );
      });
    });
    it('should be able to read and write from the cache', () => {
      const cache = createFileCache(dirname);

      return cache.get('test').then(data => {
        assert.isNull(data);

        return cache.set('test', {foo: 'bar'}).then(() => {
          return cache.get('test').then(data => {
            assert.deepEqual(data, {foo: 'bar'});
          });
        });
      });
    });
    it('should be able to invalidate an entry in the cache', () => {
      const cache = createFileCache(dirname);

      return cache.set('test', {foo: 'bar'})
        .then(() => cache.invalidate('test'))
        .then(() => cache.get('test'))
        .then(data => {
          assert.isNull(data);
        });
    });
    it('should remove the cache file when invalidating an entry', (done) => {
      const cache = createFileCache(dirname);

      return cache.set('test', {foo: 'bar'})
        .then(() => {
          const stat = fs.statSync(TEST_KEY_FILENAME);
          assert.isTrue(stat.isFile());
        })
        .then(() => cache.invalidate('test'))
        .then(() => {
          fs.stat(TEST_KEY_FILENAME, (err) => {
            assert.instanceOf(err, Error);
            assert.equal(err.code, 'ENOENT');
            done();
          });
        });
    });
    it('should populate an in-memory cache when setting entries', () => {
      const cache = createFileCache(dirname);

      return cache.set('test', {foo: 'bar'})
        .then(() => {
          assert.equal(
            cache._memoryCache[TEST_KEY_FILENAME],
            JSON.stringify({foo: 'bar'})
          );
        });
    });
    it('should fetch from the in-memory cache before hitting the FS', () => {
      const cache = createFileCache(dirname);

      cache._memoryCache[TEST_KEY_FILENAME] = '{"test": 1}';

      return cache.get('test').then(data => {
        assert.deepEqual(data, {test: 1});
      });
    });
    it('should remove entries from the in-memory cache when they are invalidated', () => {
      const cache = createFileCache(dirname);

      cache._memoryCache[TEST_KEY_FILENAME] = '{"test": 1}';

      return cache.invalidate('test').then(() => {
        assert.isUndefined(cache._memoryCache[TEST_KEY_FILENAME]);
      });
    });
    it('should accept a `generateHash` option', () => {
      const generateHash = () => {
        return 'test'
      };

      const cache = createFileCache(dirname, {generateHash});

      return cache.set('foo', 'bar').then(value => {
        assert.equal(value, 'bar');
        assert.equal(
          fs.readFileSync(path.join(dirname, 'test.json'), 'utf8'),
          '"bar"'
        );
      });
    });
  });
});