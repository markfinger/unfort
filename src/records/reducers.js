import imm from 'immutable';
import {ADD_SIGNAL, ADD_SIGNAL_HANDLER} from './actions';

export function signalsReducer(state=imm.Map(), action) {
  const type = action.type;

  if (type === ADD_SIGNAL) {
    const name = action.name;

    if (state.has(name)) {
      throw new Error(`Signal "${name}" has already been added`);
    }

    return state.set(name, imm.List());
  }

  if (type === ADD_SIGNAL_HANDLER) {
    const {name, handler} = action;

    if (!state.has(name)) {
      throw new Error(`Signal "${name}" has not been defined`);
    }

    const handlers = state.get(name);
    return state.set(name, handlers.push(handler));

  }

  return state;
}