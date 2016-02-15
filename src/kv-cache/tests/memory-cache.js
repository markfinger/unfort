import {assert} from '../../utils/assert';
import {createMemoryCache} from '../memory-cache';
import murmur from 'imurmurhash';

describe('memory-cache', () => {
  describe('#createMemoryCache', () => {
    it('should be able to write to the cache', () => {
      const cache = createMemoryCache();

      return cache.set('test', {bar: 'foo'}).then(() => {
        assert.equal(cache._memoryCache[murmur('test').result()], JSON.stringify({bar: 'foo'}));
      });
    });
    it('should be able to read from the cache', () => {
      const cache = createMemoryCache();

      return cache.set('test', {bar: 'foo'})
        .then(() => cache.get('test'))
        .then(data => {
          assert.deepEqual(data, {bar: 'foo'});
        });
    });
    it('should be able to invalidate an entry', () => {
      const cache = createMemoryCache();

      return cache.set('test', {bar: 'foo'})
        .then(() => cache.invalidate('test'))
        .then(() => cache.get('test'))
        .then(data => {
          assert.isNull(data);
        });
    });
    it('should accept a `generateHash` option', () => {
      const generateHash = () => {
        return 'test';
      };

      const cache = createMemoryCache({generateHash});

      return cache.set('foo', 'bar').then(value => {
        assert.equal(value, 'bar');
        assert.equal(
          cache._memoryCache.test,
          '"bar"'
        );
      });
    });
  });
});