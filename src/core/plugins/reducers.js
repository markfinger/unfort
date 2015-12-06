import imm from 'immutable';
import {ADD_PLUGIN} from './actions';

export function pluginsReducer(state=imm.List(), action) {
  const type = action.type;

  if (type === ADD_PLUGIN) {
    return state.push(imm.fromJS({
      name: action.name,
      plugin: action.plugin,
      options: action.options
    }));
  }

  return state;
}