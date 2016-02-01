import {assert} from '../../utils/assert';
import {
  isIntercept, isRecordInvalidIntercept, isRecordRemovedIntercept, Intercept,
  RecordInvalidatedDuringProcessing, RecordRemovedDuringProcessing
} from '../intercept';

describe('record-store/intercept', () => {
  describe('#isIntercept', () => {
    it('should indicate if an object is an instance of an intercept class', () => {
      assert.isTrue(isIntercept(new Intercept()));
      assert.isTrue(isIntercept(new RecordInvalidatedDuringProcessing()));
      assert.isTrue(isIntercept(new RecordRemovedDuringProcessing()));
      assert.isFalse(isIntercept(new Error()));
      assert.isFalse(isIntercept({}));
      assert.isFalse(isIntercept());
    });
  });
  describe('#isRecordInvalidIntercept', () => {
    it('should indicate if an object is an instance of an intercept class', () => {
      assert.isFalse(isRecordInvalidIntercept(new Intercept()));
      assert.isTrue(isRecordInvalidIntercept(new RecordInvalidatedDuringProcessing()));
      assert.isFalse(isRecordInvalidIntercept(new RecordRemovedDuringProcessing()));
      assert.isFalse(isRecordInvalidIntercept(new Error()));
      assert.isFalse(isRecordInvalidIntercept({}));
      assert.isFalse(isRecordInvalidIntercept());
    });
  });
  describe('#isRecordRemovedIntercept', () => {
    it('should indicate if an object is an instance of an intercept class', () => {
      assert.isFalse(isRecordRemovedIntercept(new Intercept()));
      assert.isFalse(isRecordRemovedIntercept(new RecordInvalidatedDuringProcessing()));
      assert.isTrue(isRecordRemovedIntercept(new RecordRemovedDuringProcessing()));
      assert.isFalse(isRecordRemovedIntercept(new Error()));
      assert.isFalse(isRecordRemovedIntercept({}));
      assert.isFalse(isRecordRemovedIntercept());
    });
  });
});