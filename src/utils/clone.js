import {isUndefined, isString, isObject, isArray} from 'lodash/lang';
import {forEach} from 'lodash/collection';
import {startsWith} from 'lodash/string';

/**
 * Deeply clones an object, but omits any properties that begin with
 * an underscore.
 *
 * Babel likes to annotate ASTs with "private" properties that are used
 * during traversal, so this method is useful for:
 *
 * - Preventing mutations from persisting to an AST object
 * - Ensuring that ASTs are serializable (babel's "private" properties
 *   often contain circular structures that cannot be serialized)
 *
 * Be aware that any circular structures in properties that do not begin
 * with an underscore will cause this function to blow either your memory
 * or stack limits. Unless you are handling an AST, you should probably
 * use a deep cloning method that is designed to handle circular
 * structures.
 *
 * @param {Object} obj
 * @returns {Object}
 */
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