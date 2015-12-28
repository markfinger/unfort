import {mapValues} from 'lodash/object';
import resolve from 'browser-resolve';
import nodeLibsBrowser from 'node-libs-browser';

export const emptyMock = require.resolve('node-libs-browser/mock/empty');

export const nodeLibs = mapValues(nodeLibsBrowser, (filename, dep) => {
  if (filename) {
    return filename;
  }

  try {
    return resolve.sync(`node-libs-browser/mock/${dep}`);
  } catch(err) {
    return emptyMock;
  }
});

export function browserResolver(dependency, origin, cb) {
  const options = {
    filename: origin,
    modules: nodeLibs
  };

  resolve(dependency, options, (err, path) => {
    if (err) {
      err.message = `${err.message}`;
    }

    cb(err, path);
  });
}