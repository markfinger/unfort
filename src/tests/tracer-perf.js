import path from 'path';
import async from 'async';
import fs from 'fs';
import * as babylon from 'babylon';
import crypto from 'crypto';
import murmur from 'imurmurhash';
import {startsWith} from 'lodash/string';
import {values} from 'lodash/object';
import {assert} from '../utils/assert';
import {createFileCache, createMockCache} from '../kv-cache';
import {envHash} from '../env-hash';
import {
  getAggressivelyCachedResolvedDependencies, getCachedResolvedDependencies, getCachedAst,
  getCachedDependencyIdentifiers
} from '../dependencies/cached-dependencies';
import {browserResolver} from '../dependencies/browser-resolver';
import {createGraph} from '../cyclic-dependency-graph';

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');

export function getResolvedDependencies(file, stat, caches, cb) {
  const key = file + stat.mtime.getTime();

  function getFile(cb) {
    fs.readFile(file, 'utf8', cb);
  }

  function getAst(cb) {
    getCachedAst({cache: caches.ast, key, getFile}, cb);
  }

  function getDependencyIdentifiers(cb) {
    getCachedDependencyIdentifiers(
      {cache: caches.dependencyIdentifiers, key, getAst},
      (err, identifiers) => {
        if (err) return cb;
        cb(null, identifiers.map(identifier => identifier.source));
      }
    );
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

export function tracerPerf(useFileCache, cb) {
  const start = (new Date).getTime();

  const entryPoints = [
    require.resolve('redux'),
    require.resolve('react'),
    require.resolve('imurmurhash'),
    require.resolve('whatwg-fetch'),
    require.resolve('glob')
  ];

  envHash({root: sourceRoot}).then(hash => {
    let caches;
    if (useFileCache) {
      caches = createFileCaches(hash);
    } else {
      caches = createMockCaches();
    }

    const graph = createGraph({
      getDependencies(file, cb) {
        fs.stat(file, (err, stat) => {
          if (err) return cb(err);

          getResolvedDependencies(file, stat, caches, (err, resolved) => {
            if (err) {
              return cb(err);
            }

            cb(null, values(resolved));
          });
        });
      }
    });

    graph.events.on('error', ({node, error}) => {
      console.error(`Error while tracing ${node}\n\n${error.message}\n\n${error.stack}`);
    });

    graph.events.on('traced', () => process.stdout.write('.'));

    graph.events.on('completed', ({errors, diff}) => {
      process.stdout.write('\n');

      if (errors.length) {
        console.error('Errors while tracing');
      }

      const nodes = diff.to.keySeq().toArray();
      const cacheDescription = useFileCache ? 'file' : 'mock';
      const end = (new Date).getTime() - start;

      console.log(`Traced ${nodes.length} records in ${end}ms with ${cacheDescription} caches`);

      cb();
    });

    entryPoints.forEach(file => graph.traceFromNode(file));
  });
}