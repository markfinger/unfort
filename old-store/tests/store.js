import * as imm from 'immutable';
import {assert} from '../../utils/assert';
import {createStore, storeReducer} from '../store';
import {addRecord} from '../records/actions';

describe('store/store', () => {
  describe('#createStore', () => {
    it('should produce an initial state object', () => {
      const store = createStore();
      const state = store.getState();
      assert.equal(state, storeReducer(undefined, {type: null}));
    });
    it('should handle creation of records', () => {
      const store = createStore();
      const state = store.getState();

      const record = imm.Map({
        recordId: state.get('records').get('availableRecordId'),
        foo: 'bar'
      });
      store.dispatch(addRecord(record));

      const records = store.getState().get('records');
      assert.equal(
        records.get('recordsById').get(record.get('recordId')),
        record
      );
      assert.equal(
        records.get('records'),
        imm.List([record])
      );
    });
    it('should handle creation of records', () => {
      const store = createStore();
      const state = store.getState();

      const record = imm.Map({
        recordId: state.get('records').get('availableRecordId')
      });
      store.dispatch(addRecord(record));

      const records = store.getState().get('records');
      assert.equal(
        records.get('recordsById').get(record.get('recordId')),
        record
      );
      assert.equal(
        records.get('records'),
        imm.List([record])
      );
    });
  });
});