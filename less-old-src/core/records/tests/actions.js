import imm from 'immutable';
import {assert} from '../../utils/assert';
import {
  addRecord, ADD_RECORD, updateRecord, UPDATE_RECORD
} from '../actions';

describe('core/records/actions', () => {
  describe('#addRecord', () => {
    it('should accept a record and return an action', () => {
      const record = imm.Map({recordId: 'test'});
      assert.deepEqual(
        addRecord(record),
        {
          type: ADD_RECORD,
          record: record
        }
      );
    });
    it('should throw if the record id is not defined', () => {
      const record = imm.Map({});
      assert.throw(() => addRecord(imm.Map({})), `Record "${record}" does not have a "recordId" property defined`);
    });
  });
  describe('#updateRecord', () => {
    it('should accept a record object and an updates object, then return an action', () => {
      const record = imm.Map({
        recordId: 'test'
      });
      const updates = imm.fromJS({
        foo: 'bar'
      });
      assert.deepEqual(
        updateRecord(record, updates),
        {
          type: UPDATE_RECORD,
          record: record,
          updates: updates
        }
      );
    });
    it('should throw if the record object is not a map', () => {
      assert.throw(() => updateRecord({}), 'Record "[object Object]" is not an immutable Map');
      assert.throw(() => updateRecord(), 'Record "undefined" is not an immutable Map');
    });
    it('should throw if the record object does not have an "id" property', () => {
      const record = imm.Map({foo: 'bar'});
      assert.throw(() => updateRecord(record), `Record "${record}" does not have a "recordId" property defined`);
    });
    it('should throw if the updates object is not a map', () => {
      assert.throw(() => updateRecord(imm.Map({recordId: 'test'}), {}), 'Updates object "[object Object]" is not an immutable Map');
      assert.throw(() => updateRecord(imm.Map({recordId: 'test'})), 'Updates object "undefined" is not an immutable Map');
    });
    it('should throw if the updates object contains an id', () => {
      const update = imm.Map({recordId: 'foo'});
      assert.throw(
        () => updateRecord(imm.Map({recordId: 'test'}), update),
        `Updates object "${update}" should not contain a "recordId" property`
      );
    });
  });
});