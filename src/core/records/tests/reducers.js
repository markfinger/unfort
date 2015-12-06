import imm from 'immutable';
import {assert} from '../../utils/assert';
import {recordIdTaken, addRecord, updateRecord} from '../actions';
import {recordsReducer} from '../reducers';

describe('core/records/reducers', () => {
  describe('#signalsReducer', () => {
    it('should initialize state correctly', () => {
      const initialState = recordsReducer(undefined, {});
      assert.equal(initialState, imm.fromJS({
        availableRecordId: 1,
        recordsById: {},
        records: []
      }));
    });
    describe('recordIdTaken cases', () => {
      it('should handle the case where a record id is taken', () => {
        let state = recordsReducer(undefined, recordIdTaken(1));
        assert.equal(
          state,
          imm.fromJS({
            availableRecordId: 2,
            recordsById: {},
            records: []
          })
        );

        state = recordsReducer(state, recordIdTaken(2));
        assert.equal(
          state,
          imm.fromJS({
            availableRecordId: 3,
            recordsById: {},
            records: []
          })
        );
      });
      it('should throw if the record id taken is not the available record id', () => {
        assert.throws(
          () => recordsReducer(undefined, recordIdTaken(2)),
          'The record id taken, "2", does not match the currently available id: "1"'
        );
      });
    });
    describe('addRecord cases', () => {
      it('should handle record additions', () => {
        const state1 = recordsReducer(undefined, recordIdTaken(1));

        const record1 = imm.Map({recordId: 1});
        const state2 = recordsReducer(state1, addRecord(record1));
        assert.equal(
          state2,
          imm.fromJS({
            availableRecordId: 2,
            recordsById: imm.Map().set(1, record1),
            records: [record1]
          })
        );

        const state3 = recordsReducer(state2, recordIdTaken(2));

        const record2 = imm.Map({recordId: 2});
        const state4 = recordsReducer(state3, addRecord(record2));
        assert.equal(
          state4,
          imm.fromJS({
            availableRecordId: 3,
            recordsById: imm.Map().set(1, record1).set(2, record2),
            records: [record1, record2]
          })
        );
      });
      it('should throw if a record with a matching id has already been added', () => {
        const state1 = recordsReducer(undefined, recordIdTaken(1));

        const record1 = imm.Map({recordId: 1});
        const state2 = recordsReducer(state1, addRecord(record1));
        assert.equal(
          state2,
          imm.fromJS({
            availableRecordId: 2,
            recordsById: imm.Map().set(1, record1),
            records: [record1]
          })
        );

        const state3 = recordsReducer(state2, recordIdTaken(2));

        const record2 = imm.Map({recordId: 2});
        const state4 = recordsReducer(state3, addRecord(record2));
        assert.equal(
          state4,
          imm.fromJS({
            availableRecordId: 3,
            recordsById: imm.Map().set(1, record1).set(2, record2),
            records: [record1, record2]
          })
        );
      });
    });
  });
});