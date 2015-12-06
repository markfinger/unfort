import {contains} from 'lodash/collection';
import {pairs} from 'lodash/object';
import {isArray, isFunction, isObject, isString} from 'lodash/lang';

/**
 * Validate the received options and return a state object
 *
 * @param {Array} actions
 * @param {Array} handlers
 * @returns {Array} containing an error or a new state object
 */
export function createState({actions, handlers}) {
  const actionErr = validateActions({actions});
  if (actionErr) {
    return [actionErr, null];
  }

  const handlerErr = validateHandlers({actions, handlers});
  if (handlerErr) {
    return [handlerErr, null];
  }

  return [null, {
    actions,
    handlers,
    records: [],
    pendingActions: []
  }];
}

/**
 * Ensure that the provided `actions` object and its members conform
 * to the expected types and structures.
 *
 * @param {Array} actions
 * @returns {Error|null}
 */
export function validateActions({actions}) {
  if (!isArray(actions)) {
    return new Error(`${actions} is not an Array`);
  }

  const checksFailed = actions.map((action, i) => {
    if (!isObject(action)) {
      return `Index ${i} of ${JSON.stringify(actions)} is not an object`;
    }

    if (!action.name) {
      return `${JSON.stringify(action)} does not have a "name" defined`;
    }
    if (!isString(action.name)) {
      return `${JSON.stringify(action)} should have a string as the "name" property`;
    }

    if (action.validateData && !isFunction(action.validateData)) {
      return `${JSON.stringify(action)} should have a function as the "validateData" property`;
    }
  }).filter(_ => _);

  if (checksFailed.length) {
    return new Error(checksFailed.join('\n\n'));
  }

  return null;
}

/**
 * Ensure that the provided `handlers` object and its members conform
 * to the expected types, structures and actions.
 *
 * @param {Array} actions
 * @param {Array} handlers
 * @returns {Error|null}
 */
export function validateHandlers({actions, handlers}) {
  if (!isArray(handlers)) {
    return new Error(`${handlers} is not an Array`);
  }

  const availableActions = actions.map(action => action.name);

  const checksFailed = handlers.map((handler, i) => {
    if (!isObject(handler)) {
      return `Index ${i} of ${JSON.stringify(handler)} is not an object`;
    }

    if (!handler.name) {
      return `${JSON.stringify(handler)} does not have a "name" property`;
    }
    if (!isString(handler.name)) {
      return `${JSON.stringify(handler)} should have a string as the "name" property`;
    }

    if (!handler.actions) {
      return `${JSON.stringify(handler)} does not have an "actions" property`;
    }
    if (!isObject(handler.actions)) {
      return `${JSON.stringify(handler)} should have an object as the "actions" property`;
    }
    const actionChecksFailed = pairs(handler.actions).map(([name, handler]) => {
      if (!contains(availableActions, name)) {
        return `${JSON.stringify(handler)} references an unknown action "${name}" with a handler "${handler}"`;
      }
      if (!isFunction(handler)) {
        return `${JSON.stringify(handler)} points to a a handler for "${name}" which is not a function: "${handler}"`;
      }
    }).filter(_ => _);
    if (actionChecksFailed.length) {
      return new Error(actionChecksFailed.join('\n\n'));
    }

  }).filter(_ => _);

  if (checksFailed.length) {
    return new Error(checksFailed.join('\n\n'));
  }

  return null;
}