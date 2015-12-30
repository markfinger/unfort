import {cloneDeep, isUndefined, isFunction, isArray} from 'lodash/lang';

export function createMockWorkers() {
  return {
    callFunction({filename, name, args}, cb) {
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

      // Prevent mutations of shared memory
      args = cloneDeep(args);
      args.push(cb);

      // Ensure consistent behaviour by suspending the execution
      process.nextTick(() => {
        mod[name].apply(global, args);
      });
    }
  }
}