import path from 'path';
import rimraf from 'rimraf';
import {assert} from '../../utils/assert';
import {createFileCache} from '../file_cache';
import {createMockCache} from '../mock_cache';

describe('mock_cache', () => {
  describe('#createMockCache', () => {
    it('should return an object with appropriate methods', () => {
      const cache = createMockCache();

      assert.isObject(cache);
      assert.isFunction(cache.get);
      assert.isFunction(cache.set);
    });
    it('should always return nulls for gets', (done) => {
      const cache = createMockCache();

      cache.get('test', (err, value) => {
        assert.isNull(err);
        assert.isNull(value);
        done();
      });
    });
    it('should allow `set` calls', (done) => {
      const cache = createMockCache();

      cache.set('test', {}, (err) => {
        assert.isNull(err);
        done();
      });
    });
    it('should not persist any data', (done) => {
      const cache = createMockCache();

      cache.set('test', {}, (err) => {
        assert.isNull(err);

        cache.get('test', (err, value) => {
          assert.isNull(err);
          assert.isNull(value);
          done();
        });
      });
    });
  });
});