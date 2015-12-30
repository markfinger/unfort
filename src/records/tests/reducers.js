import * as imm from 'immutable';
import {assert} from '../../utils/assert';
import {addRecord, updateRecord} from '../actions';
import {recordsReducer} from '../reducers';

describe('records/reducers', () => {
  describe('#signalsReducer', () => {
    it('should initialize state correctly', () => {
      const initialState = recordsReducer(undefined, {});
      assert.equal(initialState, imm.fromJS({
        availableRecordId: 1,
        recordsById: {},
        records: []
      }));
    });
    describe('{ADD_RECORD}', () => {
      it('should handle adding a record when empty', () => {
        const initialState = imm.fromJS({
          availableRecordId: 1,
          recordsById: {},
          records: []
        });
        const record = imm.Map({recordId: 1});

        const state = recordsReducer(initialState, addRecord(record));
        assert.equal(
          state,
          imm.fromJS({
            availableRecordId: 2,
            recordsById: imm.Map().set(1, record),
            records: [record]
          })
        );
      });
      it('should handle adding a record when other records exist', () => {
        const record1 = imm.Map({recordId: 1});
        const record2 = imm.Map({recordId: 2});
        const record3 = imm.Map({recordId: 3});

        const initialState = imm.fromJS({
          availableRecordId: 3,
          recordsById: imm.Map().set(1, record1).set(2, record2),
          records: [record1, record2]
        });

        const state = recordsReducer(initialState, addRecord(record3));
        assert.equal(
          state,
          imm.fromJS({
            availableRecordId: 4,
            recordsById: imm.Map().set(1, record1).set(2, record2).set(3, record3, 3),
            records: [record1, record2, record3]
          })
        );
      });
      it('should throw if a record with an id not matching the next available id is added', () => {
        const record = imm.Map({recordId: 2});
        const state = imm.fromJS({
          availableRecordId: 1,
          recordsById: {},
          records: []
        });

        const action = addRecord(record);
        assert.throws(
          () => recordsReducer(state, action),
          `The record id "2" used by "${record}" must match the next available record id "1"`
        );
      });
      it('should throw if a record with an id matching a pre-existing record is added', () => {
        const record = imm.Map({recordId: 1});
        const state = imm.fromJS({
          availableRecordId: 1, // note: should have been incremented
          recordsById: imm.Map().set(1, record),
          records: [record]
        });

        const action = addRecord(record);
        assert.throws(
          () => recordsReducer(state, action),
          `The record id "1" used by "${record}" has already been used`
        );
      });
    });
    describe('{UPDATE_RECORD}', () => {
      it('should handle record changes', () => {
        const record = imm.Map({recordId: 1});
        const initialState = imm.fromJS({
          availableRecordId: 2,
          recordsById: imm.Map().set(1, record),
          records: [record]
        });

        const updates = imm.Map({
          foo: 'bar',
          woz: 'qux'
        });

        const state = recordsReducer(initialState, updateRecord(record, updates));
        assert.equal(
          state,
          imm.fromJS({
            availableRecordId: 2,
            recordsById: imm.Map().set(1, imm.Map({recordId: 1, foo: 'bar', woz: 'qux'})),
            records: [imm.Map({recordId: 1, foo: 'bar', woz: 'qux'})]
          })
        );
      });
      it('should throw if a record does not exist', () => {
        const record = imm.Map({recordId: 1});
        const updates = imm.Map({foo: 'bar'});

        const action = updateRecord(record, updates);
        assert.throws(
          () => recordsReducer(undefined, action),
          `The record id "1" used by "${record}" has not been encountered yet`
        );
      });
    });
  });
});