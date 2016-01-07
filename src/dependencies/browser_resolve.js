import {isString} from 'lodash/lang';
import {mapValues} from 'lodash/object';
import resolve from 'browser-resolve';
import {nodeCoreLibs} from './node_core_libs';

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
    modules: nodeCoreLibs
  };

  resolve(dependency, resolveOptions, cb);
}