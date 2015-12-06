import imm from 'immutable';
import {RECORD_ID_TAKEN, ADD_RECORD, UPDATE_RECORD} from './actions';

const initialState = imm.fromJS({
  availableRecordId: 1,
  recordsById: {},
  records: []
});

export function recordsReducer(state=initialState, action) {
  const type = action.type;

  if (type === RECORD_ID_TAKEN) {
    const recordId = action.recordId;
    const availableRecordId = state.get('availableRecordId');

    if (availableRecordId !== recordId) {
      throw new Error(`The record id taken, "${recordId}", does not match the currently available id: "${availableRecordId}"`);
    }

    return state.set('availableRecordId', availableRecordId + 1);
  }

  if (type === ADD_RECORD) {
    const record = action.record;

    const recordId = record.get('recordId');
    const availableRecordId = state.get('availableRecordId');
    if (availableRecordId === recordId) {
      throw new Error(
        `The record id "${recordId}" used by "${record}" should not match the available record id: ${availableRecordId}`
      );
    }

    const recordsById = state.get('recordsById');
    if (recordsById.has(recordId)) {
      throw new Error(`The record id "${recordId}" used by "${record}" has already been used`);
    }

    return state
      .set(
        'recordsById',
        recordsById.set(recordId, record)
      ).set(
        'records',
        state.get('records').push(record)
      );
  }

  if (type === UPDATE_RECORD) {
    const record = action;
    const updatedRecord = record.merge(action.updates);

    const recordId = record.get('recordId');
    const recordsById = state.get('recordsById');
    if (!recordsById.has(recordId)) {
      throw new Error(`The record id "${recordId}" used by "${record}" has not been encountered yet`);
    }

    const records = state.get('records');
    const recordIndex = records.indexOf('records');
    if (recordIndex === -1) {
      // If this happens, it suggests that `recordsById` and `records` are out of sync
      throw new Error(`Record "${record}" was not found in the records list`);
    }

    return state
      .set(
        'recordsById',
        recordsById.set(recordId, updatedRecord)
      )
      .set(
        'records',
        records.set(recordIndex, updatedRecord)
      );
  }

  return state;
}