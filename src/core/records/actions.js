import {isObject, isUndefined} from 'lodash/lang';
import imm from 'immutable';

export const RECORD_ID_TAKEN = 'RECORD_ID_TAKEN';
export const ADD_RECORD = 'ADD_RECORD';
export const UPDATE_RECORD = 'UPDATE_RECORD';

export function recordIdTaken(recordId) {
  if (!recordId) {
    throw new Error(`Record id "${recordId}" is not a truthy value`);
  }

  return {
    type: RECORD_ID_TAKEN,
    recordId
  }
}

export function addRecord(record) {
  _validateRecord(record);

  return {
    type: ADD_RECORD,
    record
  };
}

export function updateRecord(record, updates) {
  _validateRecord(record);

  if (!imm.Map.isMap(updates)) {
    throw new Error(`Updates object "${updates}" is not an immutable Map`);
  }

  if (!isUndefined(updates.get('recordId'))) {
    throw new Error(`Updates object "${updates}" should not contain a "recordId" property`);
  }

  return {
    type: UPDATE_RECORD,
    record,
    updates
  };
}

function _validateRecord(record) {
  if (!imm.Map.isMap(record)) {
    throw new Error(`Record "${record}" is not an immutable Map`);
  }

  if (!record.has('recordId')) {
    throw new Error(`Record "${record}" does not have a "recordId" property defined`);
  }
}