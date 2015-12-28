import {isString, isFunction} from 'lodash/lang';

export const ADD_SIGNAL = 'ADD_SIGNAL';
export const ADD_SIGNAL_HANDLER = 'ADD_SIGNAL_HANDLER';

export function addSignal(name) {
  if (!name || !isString(name)) {
    throw new Error(`Signal "${name}" must be a string`);
  }

  return {
    type: ADD_SIGNAL,
    name
  }
}

export function addSignalHandler(name, handler) {
  if (!name || !isString(name)) {
    throw new Error(`Signal "${name}" must be a string`);
  }

  if (!handler || !isFunction(handler)) {
    throw new Error(`Signal handlers must be functions. Received "${handler}" for signal "${name}"`);
  }

  return {
    type: ADD_SIGNAL_HANDLER,
    name,
    handler
  };
}