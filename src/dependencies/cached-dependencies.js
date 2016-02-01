import path from 'path';
import * as babylon from 'babylon';
import async from 'async';
import {assign} from 'lodash/object';
import {babylonAstDependencies} from '../babylon-ast-dependencies';
import {getCachedData} from './cache-utils';


export function getCachedAst({cache, key, getFile}) {
  function compute() {
    return getFile().then(text => {
      let ast;
      try {
        ast = babylon.parse(text, {sourceType: 'module'});
      } catch(err) {
        return Promise.reject(err);
      }

      return Promise.resolve(ast);
    });
  }

  return getCachedData({cache, key, compute});
}

export function getCachedDependencyIdentifiers({cache, key, getAst}) {
  function compute() {
    return getAst().then(ast => {
      let identifiers;
      try {
        identifiers = babylonAstDependencies(ast);
      } catch(err) {
        return Promise.reject(err);
      }

      return Promise.resolve(identifiers);
    });
  }

  return getCachedData({cache, key, compute});
}

function createObjectFromArrays(array1, array2) {
  const obj = {};
  array1.forEach((key, i) => {
    obj[key] = array2[i];
  });
  return obj;
}

export function getAggressivelyCachedResolvedDependencies({cache, key, getDependencyIdentifiers, resolveIdentifier}) {
  function compute() {
    return getDependencyIdentifiers().then(identifiers => {
      return Promise.all(
        identifiers.map(identifier => resolveIdentifier(identifier))
      ).then(resolved => {
        return createObjectFromArrays(identifiers, resolved);
      });
    });
  }

  return getCachedData({cache, key, compute});
}

export function getCachedResolvedDependencies({cache, key, getDependencyIdentifiers, resolveIdentifier}) {
  return getDependencyIdentifiers().then(identifiers => {
    const pathIdentifiers = [];
    const packageIdentifiers = [];
    identifiers.forEach(identifier => {
      if (identifier[0] !== '.' && !path.isAbsolute(identifier)) {
        packageIdentifiers.push(identifier);
      } else {
        pathIdentifiers.push(identifier);
      }
    });

    return Promise.all([
      // If a dependency identifier is relative (./ ../) or absolute (/), there are
      // edge-cases where caching the resolved path may produce the wrong result.
      // For example: an identifier "./foo" may resolve to either a "./foo.js" or
      // or "./foo/index.js". Detecting these cases is problematic, so we avoid the
      // problem by ensuring that the resolver always inspects the file system for
      // path-based identifiers
      Promise.all(
        pathIdentifiers.map(identifier => resolveIdentifier(identifier))
      ).then(
        resolved => createObjectFromArrays(pathIdentifiers, resolved)
      ),

      // If a dependency identifier refers to a package (eg: is not a path-based identifier),
      // we can cache the resolved path and leave higher levels to perform cache invalidation
      Promise.resolve().then(() => {
        function compute() {
          return Promise.all(
            packageIdentifiers.map(identifier => resolveIdentifier(identifier))
          ).then(resolved => {
            return createObjectFromArrays(packageIdentifiers, resolved);
          });
        }

        return getCachedData({cache, key, compute});
      })
    ]).then(([resolvedPathIdentifiers, resolvedPackageIdentifiers]) => {
      return assign(resolvedPathIdentifiers, resolvedPackageIdentifiers);
    });
  });
}