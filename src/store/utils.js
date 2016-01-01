import * as imm from 'immutable';
import {updateRecord} from './records/actions';


export function getRecordById(store, recordId) {
  const state = store.getState();
  return state.getIn(['records', 'recordsById', recordId]);
}

export function getLatestRecordState(store, record) {
  const recordId = record.get('recordId');
  return getRecordById(store, recordId);
}

export function getAvailableRecordId(store) {
  const state = store.getState();
  return state.getIn(['records', 'availableRecordId']);
}

export function createRecord(store, data={}) {
  const recordId = getAvailableRecordId(store);

  return imm.fromJS({
    recordId: recordId,
    dependencies: [],
    resolvedDependencies: {},
    ...data
  });
}

export function patchRecord(store, record, updates) {
  const action = updateRecord(record, imm.fromJS(updates));
  store.dispatch(action);
  return getLatestRecordState(store, record);
}