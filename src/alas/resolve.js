import path from 'path';
import im from 'immutable';
import nodeLibsBrowser from 'node-libs-browser';
import isNull from 'lodash/lang/isNull';
import mapValues from 'lodash/object/mapValues'
import browserResolve from 'browser-resolve';
import {filenameLogger} from './logger';

const log = filenameLogger(__filename);

const nodeCoreModules = mapValues(nodeLibsBrowser, resolvedPath => {
  if (!isNull(resolvedPath)) {
    return resolvedPath;
  }

  return browserResolve.sync('./empty_module', {
    filename: __filename
  });
});

export function resolveDependencies({filename, dependencies}) {
  log(`Resolving ${dependencies.size} dependencies from ${filename}`);

  const pending = dependencies.map(dependency => {
    return resolveDependency({filename, dependency})
  });

  return Promise.all(pending.toJS())
    .then(resolved => {
      return resolved.reduce(
        (map, resolved) => map.merge(resolved),
        im.Map()
      )
    });
}

export function resolveDependency({filename, dependency}) {
  log(`Resolving ${dependency} from ${filename}`);

  return new Promise((resolve, reject) => {
    browserResolve(
      dependency,
      {
        filename,
        modules: nodeCoreModules
      },
      (err, path) => {
        if (err) {
          log(`Error encountered while trying to resolve ${dependency} from ${filename}...\n ${err.stack}`);
          return reject(err);
        }

        log(`Resolved ${dependency} from ${filename} to ${path}`);
        const resolved = im.Map({[dependency]: path});
        resolve(resolved);
      }
    );
  });
}