import {assert} from '../../utils/assert';
import {createMockCache} from '../mock-cache';

describe('mock-cache', () => {
  describe('#createMockCache', () => {
    it('should return an object with appropriate methods', () => {
      const cache = createMockCache();

      assert.isObject(cache);
      assert.isFunction(cache.get);
      assert.isFunction(cache.set);
    });
    it('should always return nulls for gets', () => {
      const cache = createMockCache();

      return cache.get('test')
        .then(value => {
          assert.isNull(value);
        });
    });
    it('should allow `set` calls', () => {
      const cache = createMockCache();
      const value = {};

      cache.set('test', value).then(_value => {
        assert.strictEqual(_value, value);
      });
    });
    it('should not persist any data', () => {
      const cache = createMockCache();

      cache.set('test', {})
        .then(() => cache.get('test'))
        .then(value => {
          assert.isNull(value);
        });
    });
  });
});