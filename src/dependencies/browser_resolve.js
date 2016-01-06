import {isString} from 'lodash/lang';
import {mapValues} from 'lodash/object';
import resolve from 'browser-resolve';
import * as nodeLibsBrowser from 'node-libs-browser';

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

export function browserResolver(options, cb) {
  const {dependency, basedir} = options;

  if (!isString(dependency)) {
    return cb(new Error(`A \`dependency\` option must be provided`))
  }
  if (!isString(basedir)) {
    return cb(new Error(`A \`basedir\` option must be provided`))
  }

  const resolveOptions = {
    basedir: basedir,
    modules: nodeLibs
  };

  resolve(dependency, resolveOptions, cb);
}