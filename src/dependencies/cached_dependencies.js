import path from 'path';
import * as babylon from 'babylon';
import async from 'async';
import {zip, flatten} from 'lodash/array';
import {analyzeBabelAstDependencies} from './babel_ast_dependency_analyzer'
import {getCachedData} from './cache_utils';


export function getCachedAst({cache, key, getFile}, cb) {
  function compute(cb) {
    getFile((err, text) => {
      if (err) return cb;

      let ast;
      try {
        ast = babylon.parse(text, {sourceType: 'module'});
      } catch(err) {
        return cb(err);
      }

      cb(null, ast);
    });
  }

  getCachedData({cache, key, compute}, cb);
}

export function getCachedDependencyIdentifiers({cache, key, getAst}, cb) {
  function compute(cb) {
    getAst((err, ast) => {
      if (err) return cb(err);

      let identifiers;
      try {
        identifiers = analyzeBabelAstDependencies(ast);
      } catch(err) {
        return cb(err);
      }

      cb(null, identifiers);
    });
  }

  getCachedData({cache, key, compute}, cb);
}

export function getAggressivelyCachedResolvedDependencies({cache, key, getDependencyIdentifiers, resolveIdentifier}, cb) {
  function compute(cb) {
    getDependencyIdentifiers((err, identifiers) => {
      if (err) return cb(err);

      async.map(
        identifiers,
        (identifier, cb) => resolveIdentifier(identifier, cb),
        (err, resolvedIdentifiers) => {
          if (err) return cb(err);

          cb(null, zip(identifiers, resolvedIdentifiers));
        }
      );
    });
  }

  getCachedData({cache, key, compute}, cb);
}

export function getCachedResolvedDependencies({cache, key, getDependencyIdentifiers, resolveIdentifier}, cb) {
  getDependencyIdentifiers((err, identifiers) => {
    if (err) return cb(err);

    const pathIdentifiers = [];
    const packageIdentifiers = [];
    identifiers.forEach(identifier => {
      if (identifier[0] !== '.' && !path.isAbsolute(identifier)) {
        packageIdentifiers.push(identifier);
      } else {
        pathIdentifiers.push(identifier);
      }
    });

    async.parallel([
      // If a dependency identifier is relative (./ ../) or absolute (/), there are
      // edge-cases where caching the resolved path may produce the wrong result.
      // For example: an identifier "./foo" may resolve to either a "./foo.js" or
      // or "./foo/index.js". Detecting these cases is problematic, so we avoid the
      // problem by ensuring that the resolver always inspects the file system for
      // path-based identifiers
      (cb) => {
        async.map(
          pathIdentifiers,
          (identifier, cb) => resolveIdentifier(identifier, cb),
          (err, resolvedIdentifiers) => {
            if (err) return cb(err);

            cb(null, zip(pathIdentifiers, resolvedIdentifiers));
          }
        )
      },
      // If a dependency identifier refers to a package (eg: is not a path-based identifier),
      // we can cache the resolved path and leave higher levels to perform cache invalidation
      (cb) => {
        function compute(cb) {
          async.map(
            packageIdentifiers,
            (identifier, cb) => resolveIdentifier(identifier, cb),
            (err, resolvedIdentifiers) => {
              if (err) return cb(err);

              cb(null, zip(packageIdentifiers, resolvedIdentifiers));
            }
          );
        }

        getCachedData({cache, key, compute}, cb);
      }
    ], (err, data) => {
      if (err) return cb(err);

      cb(null, flatten(data));
    });
  });
}