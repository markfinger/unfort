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
import promisify from 'promisify-node';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');

export function getResolvedDependencies(file, stat, caches) {
  const key = file + stat.mtime.getTime();

  function getFile() {
    return readFile(file, 'utf8');
  }

  function getAst() {
    return getCachedAst({cache: caches.ast, key, getFile});
  }

  function getDependencyIdentifiers() {
    return getCachedDependencyIdentifiers({
      cache: caches.dependencyIdentifiers,
      key,
      getAst
    }).then(identifiers => {
      return identifiers.map(identifier => identifier.source);
    });
  }

  function resolveIdentifier(identifier) {
    return browserResolver(identifier, path.dirname(file));
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
    return getAggressivelyCachedResolvedDependencies(resolvedDepsOptions);
  } else {
    return getCachedResolvedDependencies(resolvedDepsOptions);
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

export function tracerPerf(useFileCache) {
  const start = (new Date).getTime();

  const entryPoints = [
    require.resolve('redux'),
    require.resolve('react'),
    require.resolve('imurmurhash'),
    require.resolve('whatwg-fetch'),
    require.resolve('glob')
  ];

  return envHash({root: sourceRoot}).then(hash => {
    let caches;
    if (useFileCache) {
      caches = createFileCaches(hash);
    } else {
      caches = createMockCaches();
    }

    const graph = createGraph({
      getDependencies(file) {
        return stat(file)
          .then(stat => getResolvedDependencies(file, stat, caches))
          .then(resolved => values(resolved));
      }
    });

    return new Promise((res) => {
      graph.events.on('error', ({node, error}) => {
        error.message = `Node: ${node} - ${error.message}`;
        throw error;
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

        res();
      });

      entryPoints.forEach(file => graph.traceFromNode(file));
    });
  });
}