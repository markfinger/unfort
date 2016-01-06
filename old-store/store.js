import {createStore as createReduxStore} from 'redux';
import * as imm from 'immutable';
import {recordsReducer} from './records/reducers';

export function storeReducer(state=imm.Map(), action) {
  return state.merge({
    records: recordsReducer(state.get('records'), action)
  });
}

export function createStore() {
  return createReduxStore(storeReducer);
}