import {assert} from '../../utils/assert';
import {createRecordStore} from '../record-store';
import {RecordInvalidatedDuringProcessing, RecordRemovedDuringProcessing} from '../intercept';

describe('record-store/record-store', () => {
  describe('#createRecordStore', () => {
    it('should accept an object and expose the functions defined', () => {
      const store = createRecordStore({
        foo: () => {}
      });

      assert.isFunction(store.foo);
    });
    it('should return a promise from the specified function', () => {
      const store = createRecordStore({
        foo: () => Promise.resolve('bar')
      });

      store.create('test');

      return store.foo('test').then(value => assert.equal(value, 'bar'));
    });
    it('should provide a file and store object to the functions specified', () => {
      const store = createRecordStore({
        foo: (ref, store) => {
          assert.isObject(ref);
          assert.equal(ref.name, 'test');
          assert.isObject(store);
        }
      });

      store.create('test');

      return store.foo('test');
    });
    it('should allow store functions to call other store functions', () => {
      const store = createRecordStore({
        foo: (ref, store) => store.bar(ref),
        bar: () => 'bar'
      });

      store.create('test');

      return store.foo('test')
        .then(val => assert.equal(val, 'bar'));
    });
    it('should preserve the values generated for each record', () => {
      let count = 0;

      const store = createRecordStore({
        counter: () => count += 1
      });

      store.create('1');
      store.create('2');

      return store.counter('1')
        .then(val => assert.equal(val, 1))
        .then(() => store.counter('1'))
        .then(val => assert.equal(val, 1))
        .then(() => store.counter('2'))
        .then(val => assert.equal(val, 2))
        .then(() => store.counter('2'))
        .then(val => assert.equal(val, 2));
    });
    it('should reject jobs if a file is invalidated during processing', () => {
      const store = createRecordStore({
        foo: () => {}
      });

      store.create('test');

      const promise = store.foo('test')
        .then(() => {throw new Error('should not be reached')})
        .catch(err => {
          assert.instanceOf(err, RecordInvalidatedDuringProcessing);
          assert.isTrue(store.isRecordInvalidIntercept(err));
        });

      store.remove('test');
      store.create('test');

      return promise;
    });
    it('should reject jobs if a file was removed during processing', () => {
      const store = createRecordStore({
        foo: () => {}
      });

      store.create('test');

      const promise = store.foo('test')
        .then(() => {throw new Error('should not be reached')})
        .catch(err => {
          assert.instanceOf(err, RecordRemovedDuringProcessing);
          assert.isTrue(store.isRecordRemovedIntercept(err));
        });

      store.remove('test');

      return promise;
    });
  });
});