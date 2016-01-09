import path from 'path';
import async from 'async';
import fs from 'fs';
import * as babylon from 'babylon';
import crypto from 'crypto';
import murmur from 'imurmurhash';
import {startsWith} from 'lodash/string';
import {assert} from '../utils/assert';
import {nodeCoreLibs} from '../dependencies/node_core_libs';
import {analyzeBabelAstDependencies} from '../dependencies/babel_ast_dependency_analyzer';
import {createWorkerFarm} from '../workers/worker_farm';
import {createFileCache, createMockCache} from '../kv-cache';
import {hashNpmDependencyTree} from '../hash-npm-dependency-tree';
import {browserResolver} from '../dependencies/browser_resolver';

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

      const untracedFiles = resolved.filter(file => !tree[file]);

      if (untracedFiles.length) {
        untracedFiles.forEach(file => {
          tree[file] = [];
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
  // If the file is within the root node_modules, we can aggressively
  // cache its resolved dependencies
  if (startsWith(file, rootNodeModules)) {
    const cacheKey = file + stat.mtime.getTime();
    return caches.moduleResolver.get(cacheKey, (err, data) => {
      if (err || data) return cb(err, data);

      getDependencies(file, stat, caches, (err, deps) => {
        if (err) return cb(err);

        async.map(
          deps,
          (dep, cb) => browserResolver(dep, file, cb),
          (err, data) => {
            if (err) return cb(err);

            caches.moduleResolver.set(cacheKey, data);

            cb(null, data);
          }
        );
      });
    });
  }

  // If the file does not live in the root node_modules, we need to get the
  // dependency identifiers first, so that we can split based on path-based
  // and package dependencies
  getDependencies(file, stat, caches, (err, deps) => {
    if (err) return cb(err);

    const pathDeps = deps.filter(dep => dep[0] === '.' || dep[0] === '/');
    const packageDeps = deps.filter(dep => dep[0] !== '.' && dep[0] !== '/');

    // If a dependency identifier is relative (./ ../) or absolute (/), there are
    // edge-cases where caching the resolved path may produce the wrong result.
    // The simplest example is an identifier that may resolve to either a directory
    // or a file. Detecting these cases is problematic, so we always run the resolver
    // for path-based dependency identifiers.
    //
    // If a dependency identifier is a package (does not start with a period or slash),
    // we can aggressively cache the resolved path.
    async.parallel([
      (cb) => {
        async.map(
          pathDeps,
          (dep, cb) => browserResolver(dep, file, cb),
          cb
        )
      },
      (cb) => {
        const cacheKey = 'packages';
        caches.packageResolver.get(cacheKey, (err, data) => {
          if (err) return cb(err);

          if (!data) {
            data = {};
          }

          const resolved = packageDeps.filter(dep => data.hasOwnProperty(dep));
          const unresolved = packageDeps.filter(dep => !data.hasOwnProperty(dep));

          if (unresolved.length === 0) {
            return cb(null, resolved);
          }

          async.map(
            unresolved,
            (dep, cb) => browserResolver(dep, file, cb),
            (err, resolvedPaths) => {
              if (err) return cb(err);

              resolvedPaths.forEach(resolved, i => {
                data[unresolved[i]] = resolved;
              });

              caches.packageResolver.set(cacheKey, data);

              cb(null, resolved.concat(resolvedPaths));
            }
          )
        });
      }
    ], cb);
  });
}

export function getDependencies(file, stat, caches, cb) {
  const cacheKey = file + stat.mtime.getTime();

  caches.dependencies.get(cacheKey, (err, data) => {
    if (err || data) return cb(err, data);

    getAst(file, stat, caches, (err, ast) => {
      if (err) return cb(err);

      let dependencies;
      try {
        dependencies = analyzeBabelAstDependencies(ast);
      } catch(err) {
        return cb(err);
      }

      caches.dependencies.set(cacheKey, dependencies);

      cb(null, dependencies);
    });
  });
}

export function getAst(file, stat, caches, cb) {
  const cacheKey = file + stat.mtime.getTime();

  caches.ast.get(cacheKey, (err, data) => {
    if (err || data) return cb(err, data);

    fs.readFile(file, 'utf8', (err, text) => {
      if (err) return cb(err);

      let ast;
      try {
        ast = babylon.parse(text, {sourceType: 'module'})
      } catch(err) {
        return cb(err);
      }

      caches.ast.set(cacheKey, ast);

      cb(null, ast);
    });
  });
}

export function createFileCaches(npmDependencyTreeHash) {
  function dirname(name) {
    return path.join(__dirname, name, npmDependencyTreeHash.toString());
  }

  return {
    // Used for ASTs parsed from text files
    ast: createFileCache(dirname('ast_cache')),
    // Used for dependency identifiers extracted form ASTs
    dependencies: createFileCache(dirname('dependency_cache')),
    // Used for resolving package dependencies
    packageResolver: createFileCache(dirname('package_resolver_cache')),
    // Used for resolving path-based dependencies for files within `rootNodeModules`.
    // Path-based dependencies are denoted by relative (./ or ../) or absolute paths (/)
    moduleResolver: createFileCache(dirname('module_resolver_cache'))
  }
}

export function createMockCaches() {
  const mockCache = createMockCache();
  return {
    ast: mockCache,
    dependencies: mockCache,
    packageResolver: mockCache,
    moduleResolver: mockCache
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