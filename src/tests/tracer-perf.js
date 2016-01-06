import path from 'path';
import async from 'async';
import fs from 'fs';
import * as babylon from 'babylon';
import crypto from 'crypto';
import browserResolve from 'browser-resolve';
import murmur from 'imurmurhash';
import {startsWith} from 'lodash/string';
import {assert} from '../utils/assert';
import {nodeLibs} from '../dependencies/browser_resolve';
import {analyzeBabelAstDependencies} from '../dependencies/babel_ast_dependency_analyzer';
import {createWorkerFarm} from '../workers/worker_farm';
import {createFileCache, createMockCache} from '../kv-file-cache';

const sourceRoot = process.cwd();
const rootPackageJson = path.join(sourceRoot, 'package.json');
const rootNodeModules = path.join(sourceRoot, 'node_modules');

function trace(caches, cb) {
  const tree = Object.create(null);

  function getAst(file, stat, cb) {
    const cache = caches.ast;
    const cacheKey = file + stat.mtime.getTime();

    cache.get(cacheKey, (err, data) => {
      if (err || data) return cb(err, data);

      fs.readFile(file, 'utf8', (err, text) => {
        if (err) return cb(err);

        let ast;
        try {
          ast = babylon.parse(text, {sourceType: 'module'})
        } catch(err) {
          return cb(err);
        }

        cache.set(cacheKey, ast);

        cb(null, ast);
      });
    });
  }

  function getDependencies(file, stat, cb) {
    const cache = caches.dependencies;
    const cacheKey = file + stat.mtime.getTime();

    cache.get(cacheKey, (err, data) => {
      if (err || data) return cb(err, data);

      getAst(file, stat, (err, ast) => {
        if (err) return cb(err);

        let dependencies;
        try {
          dependencies = analyzeBabelAstDependencies(ast);
        } catch(err) {
          return cb(err);
        }

        cache.set(cacheKey, dependencies);

        cb(null, dependencies);
      });
    });
  }

  function getResolvedDependencies(file, stat, cb) {
    const packageResolverCache = caches.packageResolver;
    const moduleResolverCache = caches.moduleResolver;

    // If the file is within the root node_modules, we can aggressively
    // cache its resolved dependencies
    if (startsWith(file, rootNodeModules)) {
      return moduleResolverCache.get(file, (err, data) => {
        if (err || data) return cb(err, data);

        getDependencies(file, stat, (err, deps) => {
          if (err) return cb(err);

          async.map(
            deps,
            (dep, cb) => browserResolveDependency(dep, file, cb),
            (err, data) => {
              if (err) return cb(err);

              moduleResolverCache.set(file, data);

              cb(null, data);
            }
          );
        });
      });
    }

    // If the file does not live in the root node_modules, we need to get the
    // dependency identifiers first, so that we can split based on path-based
    // and package dependencies
    getDependencies(file, stat, (err, deps) => {
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
            (dep, cb) => browserResolveDependency(dep, file, cb),
            cb
          )
        },
        (cb) => {
          const cacheKey = 'packages';
          packageResolverCache.get(cacheKey, (err, data) => {
            if (err) return cb(err);
            if (!data) data = {};

            const resolved = packageDeps.filter(dep => data.hasOwnProperty(dep));
            const unresolved = packageDeps.filter(dep => !data.hasOwnProperty(dep));

            if (unresolved.length === 0) {
              return cb(null, resolved);
            }

            async.map(
              unresolved,
              (dep, cb) => browserResolveDependency(dep, file, cb),
              (err, resolvedPaths) => {
                if (err) return cb(err);

                resolvedPaths.map(resolved, i => {
                  data[unresolved[i]] = resolved;
                });

                packageResolverCache.set(cacheKey, data);

                cb(null, resolved.concat(resolvedPaths));
              }
            )
          });
        }
      ], cb);
    });
  }

  function traceFile(file, cb) {
    tree[file] = [];

    fs.stat(file, (err, stat) => {
      if (err) return cb(err);

      getResolvedDependencies(file, stat, (err, resolved) => {
        if (err) {
          err.message = `File: ${file}\n\n${err.message}`;
          return cb(err);
        }

        tree[file] = resolved;

        const untracedFiles = resolved.filter(file => !tree[file]);

        if (untracedFiles.length) {
          untracedFiles.forEach(file => {
            tree[file] = Object.create(null)
          });

          async.map(
            untracedFiles,
            (file, cb) => traceFile(file, cb),
            cb
          );
        } else {
          cb(null);
        }
      });
    });
  }

  async.parallel([
    (cb) => traceFile(require.resolve('redux'), cb),
    (cb) => traceFile(require.resolve('react'), cb),
    (cb) => traceFile(require.resolve('imurmurhash'), cb),
    (cb) => traceFile(require.resolve('whatwg-fetch'), cb),
    (cb) => traceFile(require.resolve('glob'), cb)
  ], (err) => {
    cb(err, tree);
  });
}

function createFileCaches() {
  const packageJson = fs.readFileSync(rootPackageJson);
  const moduleDirs = fs.readdirSync(rootNodeModules);

  const hash = murmur(packageJson);
  moduleDirs.forEach(dir => hash.hash(dir));
  const packageHash = hash.result();

  return {
    // Used for ASTs parsed from text files
    ast: createFileCache(path.join(__dirname, 'ast_cache')),
    // Used for dependency identifiers extracted form ASTs
    dependencies: createFileCache(path.join(__dirname, 'dependency_cache')),
    // Used for resolving package dependencies
    packageResolver: createFileCache(path.join(__dirname, packageHash + '_package_resolver_cache')),
    // Used for resolving path-based dependencies for files within `rootNodeModules`.
    // Path-based dependencies are denoted by relative (./ or ../) or absolute paths (/)
    moduleResolver: createFileCache(path.join(__dirname, packageHash + '_module_resolver_cache'))
  }
}

function createMockCaches() {
  const mockCache = createMockCache();
  return {
    ast: mockCache,
    dependencies: mockCache,
    packageResolver: mockCache,
    moduleResolver: mockCache
  }
}

function browserResolveDependency(dependency, origin, cb) {
  browserResolve(
    dependency,
    {
      basedir: path.dirname(origin),
      modules: nodeLibs
    },
    cb
  );
}

module.exports = function tracerPerf(useFileCache, cb) {
  const start = (new Date).getTime();

  if (useFileCache) {
    trace(createFileCaches(), (err, tree) => {
      assert.isNull(err);
      assert.isObject(tree);

      const end = (new Date).getTime() - start;
      console.log(`\n\nTraced ${Object.keys(tree).length} records in ${end}ms with file caches`);

      cb();
    });
  } else {
    trace(createMockCaches(), (err, tree) => {
      assert.isNull(err);
      assert.isObject(tree);

      const end = (new Date).getTime() - start;
      console.log(`\n\nTraced ${Object.keys(tree).length} records in ${end}ms with mock caches`);

      cb();
    });
  }
};