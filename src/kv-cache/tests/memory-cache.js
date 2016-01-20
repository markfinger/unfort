import {assert} from '../../utils/assert';
import {createMemoryCache} from '../memory-cache';
import murmur from 'imurmurhash';

describe('memory-cache', () => {
  describe('#createMemoryCache', () => {
    it('should be able to write to the cache', (done) => {
      const cache = createMemoryCache();

      cache.set('test', {bar: 'foo'}, (err) => {
        assert.isNull(err);
        assert.equal(cache._memoryCache[murmur('test').result()], JSON.stringify({bar: 'foo'}));
        done();
      });
    });
    it('should be able to read from the cache', (done) => {
      const cache = createMemoryCache();

      cache.set('test', {bar: 'foo'}, (err) => {
        assert.isNull(err);

        cache.get('test', (err, data) => {
          assert.isNull(err);
          assert.deepEqual(data, {bar: 'foo'});
          done();
        });
      });
    });
    it('should be able to invalidate an entry', (done) => {
      const cache = createMemoryCache();

      cache.set('test', {bar: 'foo'}, (err) => {
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
    it('should accept a `generateHash` option', (done) => {
      const generateHash = () => {
        return 'test'
      };

      const cache = createMemoryCache({generateHash});

      cache.set('foo', 'bar', (err) => {
        assert.isNull(err);

        assert.equal(
          cache._memoryCache['test'],
          '"bar"'
        );
        done();
      });
    });
  });
});