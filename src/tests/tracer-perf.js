import path from 'path';
import async from 'async';
import fs from 'fs';
import * as babylon from 'babylon';
import crypto from 'crypto';
import browserResolve from 'browser-resolve';
import {assert} from '../utils/assert';
import {nodeLibs} from '../dependencies/browser_resolve';
import {analyzeBabelAstDependencies} from '../dependencies/babel_ast_dependency_analyzer';
import {createWorkerFarm} from '../workers/worker_farm';
import {createFileCache, createMockCache} from '../kv-file-cache';

const sourceRoot = process.cwd();
const rootPackage = path.join(sourceRoot, 'package.json');
const packageHash = fs.readFileSync(rootPackage);
const rootNodeModules = path.join(sourceRoot, 'node_modules');

function trace(caches, cb) {
  const tree = Object.create(null);

  function getAst(file, cb) {
    caches.ast.get(file, (err, data) => {
      if (err || data) return cb(err, data);

      fs.readFile(file, 'utf8', (err, text) => {
        if (err) return cb(err);

        let ast;
        try {
          ast = babylon.parse(text, {sourceType: 'module'})
        } catch(err) {
          return cb(err);
        }

        caches.ast.set(file, ast);
        cb(null, ast);
      });
    });
  }

  function getDependencies(file, cb) {
    caches.dependencies.get(file, (err, data) => {
      if (err || data) return cb(err, data);

      getAst(file, (err, ast) => {
        if (err) return cb(err);

        let dependencies;
        try {
          dependencies = analyzeBabelAstDependencies(ast);
        } catch(err) {
          return cb(err);
        }

        caches.dependencies.set(file, dependencies);
        cb(null, dependencies);
      });
    });
  }

  function getResolvedDependencies(file, cb) {
    caches.resolver.get(file, (err, data) => {
      if (err || data) return cb(err, data);

      getDependencies(file, (err, deps) => {
        if (err) return cb(err);

        async.map(
          deps,
          (dependency, cb) => {
            browserResolve(
              dependency,
              {
                basedir: path.dirname(file),
                modules: nodeLibs
              },
              cb
            );
          },
          (err, resolved) => {
            if (err) return cb(err);
            caches.resolver.set(file, resolved);
            cb(null, resolved);
          }
        );
      });
    });
  }

  function traceFile(file, cb) {
    tree[file] = [];

    getResolvedDependencies(file, (err, resolved) => {
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
  }

  async.parallel([
    (cb) => traceFile(require.resolve('redux'), cb),
    (cb) => traceFile(require.resolve('react'), cb),
    (cb) => traceFile(require.resolve('babylon'), cb)
  ], (err) => {
    cb(err, tree);
  });
}

function createMockCaches() {
  const mockCache = createMockCache();
  return {
    ast: mockCache,
    dependencies: mockCache,
    resolver: mockCache
  }
}

function createFileCaches() {
  return {
    ast: createFileCache({dirname: path.join(__dirname, 'ast_cache')}),
    dependencies: createFileCache({dirname: path.join(__dirname, 'dependency_cache')}),
    resolver: createFileCache({dirname: path.join(__dirname, 'resolver_cache')})
  }
}

module.exports = function tracerPerf(cb) {
  const start = (new Date).getTime();

  trace(createMockCaches(), (err, tree) => {
    assert.isNull(err);
    assert.isObject(tree);

    const end = (new Date).getTime() - start;
    console.log(`\n\nTraced ${Object.keys(tree).length} records in ${end}ms with mock caches`);

    cb();
  });


  //trace(createFileCaches(), (err, tree) => {
  //  assert.isNull(err);
  //  assert.isObject(tree);
  //
  //  const end = (new Date).getTime() - start;
  //  console.log(`\n\nTraced ${Object.keys(tree).length} records in ${end}ms with file caches`);
  //
  //  cb();
  //});
};