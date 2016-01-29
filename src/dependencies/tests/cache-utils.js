import {assert} from '../../utils/assert';
import {createMockCache, createMemoryCache} from '../../kv-cache';
import {getCachedData} from '../cache-utils';

describe('dependencies/cache_utils', () => {
  describe('#getCachedData', () => {
    it('should call the compute function if no data is available', () => {
      const cache = createMockCache();
      function compute() {
        return Promise.resolve('foo');
      }
      return getCachedData({cache, key: 'test', compute})
        .then(data => {
          assert.equal(data, 'foo');
        });
    });
    it('should not call the compute function if data is available', () => {
      const cache = createMemoryCache();
      function compute() {
        throw new Error('should not be called');
      }

      return cache.set('test', 'foo').then(() => {
        return getCachedData({cache, key: 'test', compute}).then(data => {
          assert.equal(data, 'foo');
        });
      });
    });
  });
});