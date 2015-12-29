import {isUndefined, isFunction, isArray} from 'lodash/lang';

export function createMockWorkers() {
  return {
    callFunction({filename, name, args}, cb) {
      let mod;
      try {
        mod = require(filename);
      } catch(err) {
        return cb(err);
      }

      if (isUndefined(mod[name]) || !isFunction(mod[name])) {
        return cb(new Error(`Module ${filename} does not export a function named ${name}`));
      }

      if (!isArray(args)) {
        return cb(new Error(`\`args\` option ${args} must be an array`));
      }

      mod[name].apply(global, args.concat([cb]));
    }
  }
}