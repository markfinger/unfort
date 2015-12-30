import {isUndefined, isString, isObject, isArray} from 'lodash/lang';
import {forEach} from 'lodash/collection';
import {startsWith} from 'lodash/string';

// Deeply clones an object, but omits any properties
// that begin with an underscore
export function cloneDeepOmitPrivateProps(obj) {
  let accumulator;
  if (isArray(obj)) {
    accumulator = [];
  } else {
    accumulator = {};
  }

  forEach(obj, function(value, key) {
    if (!startsWith(key, '_')) {
      if (isObject(value)) {
        accumulator[key] = cloneDeepOmitPrivateProps(value);
      } else {
        accumulator[key] = value;
      }
    }
  });

  return accumulator;
}