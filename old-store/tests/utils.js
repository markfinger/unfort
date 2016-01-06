import * as imm from 'immutable';
import {assert} from '../../utils/assert';
import {getRecordById, getAvailableRecordId, createRecord} from '../utils';
import {addRecord} from '../records/actions';
import {createStore} from '../store';

describe('store/utils', () => {
  describe('#getRecordById', () => {
    it('should accept a store and an id then return a record', () => {
      const store = createStore();
      const id = getAvailableRecordId(store);
      const record = imm.Map({
        recordId: id
      });
      store.dispatch(addRecord(record));

      assert.equal(getRecordById(store, id), record);
    });
    it('should return undefined if the record does not exist', () => {
      const store = createStore();
      assert.equal(getRecordById(store, 1), undefined);
    });
  });
  describe('#getAvailableRecordId', () => {
    it('should accept a store and return a record id', () => {
      const store = createStore();
      const id = getAvailableRecordId(store);
      assert.equal(id, 1);
    });
  });
  describe('#createRecord', () => {
    it('should accept a store and return a record', () => {
      const store = createStore();
      const record = createRecord(store);
      assert.equal(
        record,
        imm.fromJS({
          recordId: 1,
          dependencies: [],
          resolvedDependencies: {}
        })
      );
    });
    it('should accept a store and an object, then return a record including the object', () => {
      const store = createStore();
      const record = createRecord(store, {foo: 'bar'});
      assert.equal(
        record,
        imm.fromJS({
          recordId: 1,
          dependencies: [],
          resolvedDependencies: {},
          foo: 'bar'
        })
      );
    });
  });
});