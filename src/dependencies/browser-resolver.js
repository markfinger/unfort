import {isString} from 'lodash/lang';
import {mapValues} from 'lodash/object';
import resolve from 'browser-resolve';
import {nodeCoreLibs} from './node-core-libs';

export function browserResolver(identifer, basedir) {
  if (!isString(identifer)) {
    return Promise.reject(new Error(`An \`identifer\` option must be provided`));
  }
  if (!isString(basedir)) {
    return Promise.reject(new Error(`A \`basedir\` option must be provided`));
  }

  const resolveOptions = {
    basedir: basedir,
    modules: nodeCoreLibs
  };

  return new Promise((res, rej) => {
    resolve(identifer, resolveOptions, (err, resolved) => {
      if (err) return rej(err);
      res(resolved);
    });
  });
}