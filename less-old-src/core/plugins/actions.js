import {isString, isFunction, isObject} from 'lodash/lang';

export const ADD_PLUGIN = 'ADD_PLUGIN';

export function addPlugin(name, plugin, options) {
  if (!name || !isString(name)) {
    throw new Error(`Plugin name "${name}" must be a string`);
  }

  if (!plugin || !isFunction(plugin)) {
    throw new Error(`Plugin "${name}" must define an initialization function. Received "${plugin}"`);
  }

  if (!options || !isObject(options)) {
    throw new Error(`Plugin "${name}" must have an options object defined. Received "${options}"`);
  }

  return {
    type: ADD_PLUGIN,
    name,
    plugin,
    options
  }
}
