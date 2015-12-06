import nodeLibsBrowser from 'node-libs-browser';
import isNull from 'lodash/lang/isNull';
import mapValues from 'lodash/object/mapValues'
import browserResolve from 'browser-resolve';

export const EMPTY_MODULE = browserResolve.sync('./empty_module', {
  filename: __filename
});

export const nodeCoreModules = mapValues(nodeLibsBrowser, (resolvedPath) => {
  if (isNull(resolvedPath)) {
    return EMPTY_MODULE;
  }

  return resolvedPath;
});