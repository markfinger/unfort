import fs from 'fs';
import path from 'path';
import * as babylon from 'babylon';
import {assert} from '../../utils/assert';
import {createMockCache, createMemoryCache} from '../../kv-cache'
import {
  getCachedData, getCachedAst, getCachedDependencyIdentifiers, getAggressivelyCachedResolvedDependencies,
  getCachedResolvedDependencies
} from '../cached_dependencies';

describe('dependencies/cached_dependencies', () => {
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
      function compute(cb) {
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
  describe('#getCachedAst', () => {
    it('should return a babylon AST', (done) => {
      const cache = createMockCache();
      const file = require.resolve('./cached_dependencies/parse_test');
      getCachedAst({cache, file, key: 'test'}, (err, ast) => {
        assert.isNull(err);
        assert.deepEqual(
          ast,
          babylon.parse(fs.readFileSync(file, 'utf8'), {sourceType: 'module'})
        );
        done();
      });
    });
    it('should not compute the AST if data is in the cache', (done) => {
      const cache = createMemoryCache();
      const file = require.resolve('./cached_dependencies/parse_test');
      const key = 'foo';

      cache.set(key, 'bar', (err) => {
        assert.isNull(err);

        getCachedAst({cache, file, key}, (err, ast) => {
          assert.isNull(err);
          assert.equal(ast, 'bar');
          done();
        });
      });
    });
  });
  describe('#getCachedDependencyIdentifiers', () => {
    it('should return an array of dependency identifiers', (done) => {
      const cache = createMockCache();
      const file = require.resolve('./cached_dependencies/parse_test');

      getCachedDependencyIdentifiers({file, cache, astCache: cache, key: 'test'}, (err, identifiers) => {
        assert.isNull(err);
        assert.deepEqual(
          ['foo', 'bar', 'test'],
          identifiers
        );
        done();
      });
    });
    it('should not compute the dependency identifiers if data is in the cache', (done) => {
      const cache = createMemoryCache();
      const file = require.resolve('./cached_dependencies/parse_test');
      const key = 'foo';

      cache.set(key, 'bar', (err) => {
        assert.isNull(err);

        getCachedDependencyIdentifiers({cache, file, key}, (err, identifiers) => {
          assert.isNull(err);
          assert.equal(identifiers, 'bar');
          done();
        });
      });
    });
  });
  describe('#getAggressivelyCachedResolvedDependencies', () => {
    it('should return an array of arrays, each containing an identifier and a resolved path', (done) => {
      const cache = createMockCache();
      const file = require.resolve('./cached_dependencies/resolve_test');

      getAggressivelyCachedResolvedDependencies({
        cache,
        key: 'test',
        file,
        dependencyIdentifierCache: cache,
        astCache: cache
      }, (err, resolved) => {
        assert.isNull(err);

        assert.deepEqual(
          resolved,
          [
            ['./foo', require.resolve('./cached_dependencies/foo.js')],
            ['bar', require.resolve('./cached_dependencies/node_modules/bar/browser.js')]
          ]
        );

        done();
      });
    });
    it('should not compute the resolved identifiers if data is in the cache', (done) => {
      const cache = createMemoryCache();
      const file = require.resolve('./cached_dependencies/resolve_test');
      const key = 'test';

      cache.set(key, 'foo', (err) => {
        assert.isNull(err);

        getAggressivelyCachedResolvedDependencies({cache, key, file}, (err, resolved) => {
          assert.isNull(err);
          assert.equal(resolved, 'foo');
          done();
        });
      });
    });
  });
  describe('#getCachedResolvedDependencies', () => {
    it('should return an array of arrays, each containing an identifier and a resolved path', (done) => {
      const cache = createMockCache();
      const file = require.resolve('./cached_dependencies/resolve_test');

      getCachedResolvedDependencies({
        cache,
        key: 'test',
        file,
        dependencyIdentifierCache: cache,
        astCache: cache
      }, (err, resolved) => {
        assert.isNull(err);

        assert.deepEqual(
          resolved,
          [
            ['./foo', require.resolve('./cached_dependencies/foo.js')],
            ['bar', require.resolve('./cached_dependencies/node_modules/bar/browser.js')]
          ]
        );

        done();
      });
    });
    it('should not compute package identifiers if data is in the cache', (done) => {
      const cache = createMemoryCache();
      const file = require.resolve('./cached_dependencies/resolve_test');
      const key = 'test';

      cache.set(key, [['bar', 'test']], (err) => {
        assert.isNull(err);

        getCachedResolvedDependencies({
          cache,
          key: 'test',
          file,
          dependencyIdentifierCache: createMockCache(),
          astCache: createMockCache()
        }, (err, resolved) => {
          assert.isNull(err);

          assert.deepEqual(
            resolved,
            [
              ['./foo', require.resolve('./cached_dependencies/foo.js')],
              ['bar', 'test']
            ]
          );

          done();
        });
      });
    });
  });
});