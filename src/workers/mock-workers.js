import {isUndefined, isFunction, isArray} from 'lodash/lang';

export function createMockWorkers() {
  return {
    callFunction(options, cb) {
      const {filename, name, args} = options;

      if (isUndefined(filename)) {
        return cb(new Error('The `filename` property has not been defined'));
      }

      let mod;
      try {
        mod = require(filename);
      } catch(err) {
        return cb(err);
      }

      if (!isFunction(mod[name])) {
        return cb(new Error(`Module ${filename} does not export a function named ${name}`));
      }

      if (!isArray(args)) {
        return cb(new Error(`\`args\` option ${args} must be an array`));
      }

      args.push(cb);

      mod[name].apply(global, args);
    }
  }
}