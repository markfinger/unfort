import {assert} from '../../utils/assert';
import {createMockCache, createMemoryCache} from '../../kv-cache';
import {getCachedData} from '../cache-utils';

describe('dependencies/cache_utils', () => {
  describe('#getCachedData', () => {
    it('should call the compute function if no data is available', (done) => {
      const cache = createMockCache();
      function compute(cb) {
        cb(null, 'foo');
      }
      getCachedData({cache, key: 'test', compute}, (err, data) => {
        assert.isNull(err);
        assert.equal(data, 'foo');
        done();
      });
    });
    it('should not call the compute function if data is available', (done) => {
      const cache = createMemoryCache();
      function compute() {
        throw new Error('should not be called');
      }

      cache.set('test', 'foo', (err) => {
        assert.isNull(err);

        getCachedData({cache, key: 'test', compute}, (err, data) => {
          assert.isNull(err);
          assert.equal(data, 'foo');
          done();
        });
      });
    });
  });
});