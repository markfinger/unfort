import fs from 'fs';
import path from 'path';
import * as babylon from 'babylon';
import promisify from 'promisify-node';
import {assert} from '../../utils/assert';
import {createMockCache, createMemoryCache} from '../../kv-cache';
import {browserResolver} from '../browser-resolver';
import {
  getCachedAst, getCachedDependencyIdentifiers, getAggressivelyCachedResolvedDependencies,
  getCachedResolvedDependencies
} from '../cached-dependencies';


const readFile = promisify(fs.readFile);

describe('dependencies/cached-dependencies', () => {
  describe('#getCachedAst', () => {
    it('should return a babylon AST', () => {
      const cache = createMockCache();
      const file = require.resolve('./cached-dependencies/parse-test');

      function getFile() {
        return readFile(file, 'utf8');
      }

      return getCachedAst({cache, key: 'test', getFile}).then(ast => {
        assert.deepEqual(
          ast,
          babylon.parse(fs.readFileSync(file, 'utf8'), {sourceType: 'module'})
        );
      });
    });
    it('should not compute the AST if data is in the cache', () => {
      const cache = createMemoryCache();
      const key = 'foo';

      return cache.set(key, 'bar').then(() => {
        return getCachedAst({cache, key}).then(ast => {
          assert.equal(ast, 'bar');
        });
      });
    });
  });
  describe('#getCachedDependencyIdentifiers', () => {
    it('should return an array of dependency identifiers', () => {
      const cache = createMockCache();
      const file = require.resolve('./cached-dependencies/parse-test');

      function getFile() {
        return readFile(file, 'utf8');
      }

      function getAst() {
        return getCachedAst({cache, key: 'test', getFile});
      }

      return getCachedDependencyIdentifiers({file, cache, key: 'test', getAst}).then(identifiers => {
        assert.deepEqual(
          identifiers,
          [
            {source: 'foo'},
            {source: 'bar'},
            {source: 'test'}
          ]
        );
      });
    });
    it('should not compute the dependency identifiers if data is in the cache', () => {
      const cache = createMemoryCache();
      const key = 'foo';

      return cache.set(key, 'bar').then(() => {
        return getCachedDependencyIdentifiers({cache, key}).then(identifiers => {
          assert.equal(identifiers, 'bar');
        });
      });
    });
  });
  describe('#getAggressivelyCachedResolvedDependencies', () => {
    it('should return an array of arrays, each containing an identifier and a resolved path', () => {
      const cache = createMockCache();
      const file = require.resolve('./cached-dependencies/resolve-test');

      function getFile() {
        return readFile(file, 'utf8');
      }

      function getAst() {
        return getCachedAst({cache, key: 'test', getFile});
      }

      function getDependencyIdentifiers() {
        return getCachedDependencyIdentifiers({cache, key: 'test', getAst})
          .then(identifiers => {
            return identifiers.map(identifier => identifier.source);
          });
      }

      function resolveIdentifier(identifier) {
        return browserResolver(identifier, path.dirname(file));
      }

      return getAggressivelyCachedResolvedDependencies({
        cache,
        key: 'test',
        getDependencyIdentifiers,
        resolveIdentifier
      }).then(resolved => {
        assert.deepEqual(
          resolved,
          {
            './foo': require.resolve('./cached-dependencies/foo.js'),
            'bar': require.resolve('./cached-dependencies/node_modules/bar/browser.js')
          }
        );
      });
    });
    it('should not compute the resolved identifiers if data is in the cache', () => {
      const cache = createMemoryCache();
      const key = 'test';

      return cache.set(key, 'foo').then(() => {
        return getAggressivelyCachedResolvedDependencies({cache, key})
          .then(resolved => {
            assert.equal(resolved, 'foo');
          });
      });
    });
  });
  describe('#getCachedResolvedDependencies', () => {
    it('should return an array of arrays, each containing an identifier and a resolved path', () => {
      const cache = createMockCache();
      const file = require.resolve('./cached-dependencies/resolve-test');

      function getFile() {
        return readFile(file, 'utf8');
      }

      function getAst() {
        return getCachedAst({cache, key: 'test', getFile});
      }

      function getDependencyIdentifiers() {
        return getCachedDependencyIdentifiers({cache, key: 'test', getAst})
          .then(identifiers => {
            return identifiers.map(identifier => identifier.source);
          });
      }

      function resolveIdentifier(identifier) {
        return browserResolver(identifier, path.dirname(file));
      }

      return getCachedResolvedDependencies({
        cache,
        key: 'test',
        getDependencyIdentifiers,
        resolveIdentifier
      }).then(resolved => {
        assert.deepEqual(
          resolved,
          {
            './foo': require.resolve('./cached-dependencies/foo.js'),
            bar: require.resolve('./cached-dependencies/node_modules/bar/browser.js')
          }
        );
      });
    });
    it('should compute path-based identifiers and use cached data for package identifiers, if data is in the cache', () => {
      const cache = createMemoryCache();
      const file = require.resolve('./cached-dependencies/resolve-test');
      const key = 'test';

      cache.set(key, {'bar': 'test'}, (err) => {
        assert.isNull(err);

        function getFile(cb) {
          fs.readFile(file, 'utf8', cb);
        }

        function getAst(cb) {
          getCachedAst({cache: createMockCache(), key: 'test', getFile}, cb);
        }

        function getDependencyIdentifiers(cb) {
          getCachedDependencyIdentifiers(
            {cache: createMockCache(), key: 'test', getAst},
            (err, identifiers) => {
              if (err) return cb(err);
              cb(null, identifiers.map(identifier => identifier.source));
            }
          );
        }

        function resolveIdentifier(identifier, cb) {
          browserResolver(identifier, path.dirname(file), cb);
        }

        getCachedResolvedDependencies({
          cache,
          key,
          getDependencyIdentifiers,
          resolveIdentifier
        }, (err, resolved) => {
          assert.isNull(err);

          assert.deepEqual(
            resolved,
            {
              './foo': require.resolve('./cached-dependencies/foo.js'),
              'bar': 'test'
            }
          );

          done();
        });
      });
    });
  });
});