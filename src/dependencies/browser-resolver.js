import {isString} from 'lodash/lang';
import {mapValues} from 'lodash/object';
import resolve from 'browser-resolve';
import {nodeCoreLibs} from './node-core-libs';

export function browserResolver(identifer, basedir, cb) {
  if (!isString(identifer)) {
    return cb(new Error(`An \`identifer\` option must be provided`))
  }
  if (!isString(basedir)) {
    return cb(new Error(`A \`basedir\` option must be provided`))
  }

  const resolveOptions = {
    basedir: basedir,
    modules: nodeCoreLibs
  };

  resolve(identifer, resolveOptions, cb);
}