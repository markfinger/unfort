import imm from 'immutable';
import {ADD_RECORD, UPDATE_RECORD} from './actions';

const initialState = imm.fromJS({
  availableRecordId: 1,
  recordsById: {},
  records: []
});

export function recordsReducer(state=initialState, action) {
  const type = action.type;

  if (type === ADD_RECORD) {
    const record = action.record;

    const recordId = record.get('recordId');
    const availableRecordId = state.get('availableRecordId');
    if (availableRecordId !== recordId) {
      throw new Error(
        `The record id "${recordId}" used by "${record}" must match the next available record id "${availableRecordId}"`
      );
    }

    const recordsById = state.get('recordsById');
    if (recordsById.has(recordId)) {
      throw new Error(`The record id "${recordId}" used by "${record}" has already been used`);
    }

    return state.merge({
      availableRecordId: availableRecordId + 1,
      recordsById: recordsById.set(recordId, record),
      records: state.get('records').push(record)
    });
  }

  if (type === UPDATE_RECORD) {
    const record = action.record;
    const updatedRecord = record.merge(action.updates);

    const recordId = record.get('recordId');
    const recordsById = state.get('recordsById');
    if (!recordsById.has(recordId)) {
      throw new Error(`The record id "${recordId}" used by "${record}" has not been encountered yet`);
    }

    const records = state.get('records');
    const recordIndex = records.indexOf(record);
    if (recordIndex === -1) { // If this ever happens, it suggests that `recordsById` and `records` are out of sync
      throw new Error(`Record "${record}" was not found in the records list`);
    }

    return state.merge({
      recordsById: recordsById.set(recordId, updatedRecord),
      records: records.set(recordIndex, updatedRecord)
    });
  }

  return state;
}