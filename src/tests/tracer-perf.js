import path from 'path';
import async from 'async';
import fs from 'fs';
import * as babylon from 'babylon';
import crypto from 'crypto';
import murmur from 'imurmurhash';
import {startsWith} from 'lodash/string';
import {assert} from '../utils/assert';
import {createFileCache, createMockCache} from '../kv-cache';
import {hashNpmDependencyTree} from '../env-hash';
import {
  getAggressivelyCachedResolvedDependencies, getCachedResolvedDependencies, getCachedAst,
  getCachedDependencyIdentifiers
} from '../dependencies/cached-dependencies';
import {browserResolver} from '../dependencies/browser-resolver';

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');

export function traceFile(file, tree, caches, cb) {
  tree[file] = [];

  fs.stat(file, (err, stat) => {
    if (err) return cb(err);

    getResolvedDependencies(file, stat, caches, (err, resolved) => {
      if (err) {
        err.message = `File: ${file}\n\n${err.message}`;
        return cb(err);
      }

      tree[file] = resolved;

      const untracedFiles = [];

      resolved.forEach(dep => {
        const filename = dep[1];
        if (!tree[filename]) {
          untracedFiles.push(filename);
        }
      });

      if (untracedFiles.length) {
        untracedFiles.forEach(file => {
          tree[file] = {};
        });

        async.map(
          untracedFiles,
          (file, cb) => traceFile(file, tree, caches, cb),
          cb
        );
      } else {
        cb(null);
      }
    });
  });
}

export function getResolvedDependencies(file, stat, caches, cb) {
  const key = file + stat.mtime.getTime();

  function getFile(cb) {
    fs.readFile(file, 'utf8', cb);
  }

  function getAst(cb) {
    getCachedAst({cache: caches.ast, key, getFile}, cb);
  }

  function getDependencyIdentifiers(cb) {
    getCachedDependencyIdentifiers({cache: caches.dependencyIdentifiers, key, getAst}, cb)
  }

  function resolveIdentifier(identifier, cb) {
    browserResolver(identifier, path.dirname(file), cb);
  }

  const resolvedDepsOptions = {
    cache: caches.resolvedDependencies,
    key,
    getDependencyIdentifiers,
    resolveIdentifier
  };

  // If the file is within the root node_modules, we can aggressively
  // cache its resolved dependencies
  if (startsWith(file, rootNodeModules)) {
    getAggressivelyCachedResolvedDependencies(resolvedDepsOptions, cb);
  } else {
    getCachedResolvedDependencies(resolvedDepsOptions, cb);
  }
}

export function createFileCaches(npmDependencyTreeHash) {
  function dirname(name) {
    return path.join(__dirname, name, npmDependencyTreeHash.toString());
  }

  function onFileCacheError(err) {
    throw err;
  }

  // Used for ASTs parsed from text files
  const ast = createFileCache(dirname('ast-cache'));

  // Used for dependency identifiers extracted from ASTs
  const dependencyIdentifiers = createFileCache(dirname('dependency-cache'));
  // Used for resolving package dependencies
  const resolvedDependencies = createFileCache(dirname('package-resolver-cache'));

  ast.events.on('error', onFileCacheError);
  dependencyIdentifiers.events.on('error', onFileCacheError);
  resolvedDependencies.events.on('error', onFileCacheError);

  return {
    ast,
    dependencyIdentifiers,
    resolvedDependencies
  }
}

export function createMockCaches() {
  const mockCache = createMockCache();
  return {
    ast: mockCache,
    dependencyIdentifiers: mockCache,
    resolvedDependencies: mockCache
  }
}

export function _tracerPerf(caches, cb) {
  const tree = Object.create(null);

  async.parallel([
    (cb) => traceFile(require.resolve('redux'), tree, caches, cb),
    (cb) => traceFile(require.resolve('react'), tree, caches, cb),
    (cb) => traceFile(require.resolve('imurmurhash'), tree, caches, cb),
    (cb) => traceFile(require.resolve('whatwg-fetch'), tree, caches, cb),
    (cb) => traceFile(require.resolve('glob'), tree, caches, cb)
  ], (err) => {
    cb(err, tree);
  });
}

export function tracerPerf(useFileCache, cb) {
  const start = (new Date).getTime();

  if (useFileCache) {
    hashNpmDependencyTree(sourceRoot, (err, npmDependencyTreeHash) => {
      if (err) return cb(err);

      _tracerPerf(createFileCaches(npmDependencyTreeHash), (err, tree) => {
        assert.isNull(err);
        assert.isObject(tree);

        const end = (new Date).getTime() - start;
        console.log(`Traced ${Object.keys(tree).length} records in ${end}ms with file caches`);

        cb();
      });
    });
  } else {
    _tracerPerf(createMockCaches(), (err, tree) => {
      assert.isNull(err);
      assert.isObject(tree);

      const end = (new Date).getTime() - start;
      console.log(`Traced ${Object.keys(tree).length} records in ${end}ms with mock caches`);

      cb();
    });
  }
}