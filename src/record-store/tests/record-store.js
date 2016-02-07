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

      return assert.becomes(
        store.foo('test'),
        'bar'
      );
    });
    it('should provide a file and store object to the functions specified', () => {
      const store = createRecordStore({
        foo: (ref, store) => {
          assert.isObject(ref);
          assert.equal(ref.name, 'foo.bar');
          assert.equal(ref.ext, '.bar');
          assert.isObject(store);
          return 'woz'
        }
      });

      store.create('foo.bar');

      return assert.becomes(
        store.foo('foo.bar'),
        'woz'
      );
    });
    it('should allow store functions to call other store functions', () => {
      const store = createRecordStore({
        foo: (ref, store) => store.bar(ref),
        bar: () => 'bar'
      });

      store.create('test');

      return assert.becomes(
        store.foo('test'),
        'bar'
      );
    });
    it('should preserve the values generated for each record', () => {
      let count = 0;

      const store = createRecordStore({
        counter: () => count += 1
      });

      store.create('1');
      store.create('2');

      return assert.isFulfilled(
        Promise.resolve()
          .then(() => assert.becomes(store.counter('1'), 1))
          .then(() => assert.becomes(store.counter('1'), 1))
          .then(() => assert.becomes(store.counter('2'), 2))
          .then(() => assert.becomes(store.counter('2'), 2))
      );
    });
    it('should reject jobs if a file is invalidated during processing', () => {
      const store = createRecordStore({
        foo: () => {}
      });

      store.create('test');

      const promise = assert.isRejected(
        store.foo('test'),
        RecordInvalidatedDuringProcessing
      );

      store.remove('test');
      store.create('test');

      return promise;
    });
    it('should reject jobs if a file was removed during processing', () => {
      const store = createRecordStore({
        foo: () => {}
      });

      store.create('test');

      const promise = assert.isRejected(
        store.foo('test'),
        RecordRemovedDuringProcessing
      );

      store.remove('test');

      return promise;
    });
    it('should indicate if a job triggers a rejection', () => {
      const store = createRecordStore({
        foo: () => {
          throw new Error('test error');
        }
      });

      store.create('test');

      return assert.isRejected(
        store.foo('test'),
        /test error/
      );
    });
    it('should throw if a job name conflicts with the store\'s API', () => {
      const store = createRecordStore();
      assert.isFunction(store.create);

      assert.throws(
        () => createRecordStore({create(){}}),
        `Property name "create" conflicts with the record store's API`
      );
    });
    it('should reject if a job does not return a value', () => {
      const store = createRecordStore({
        foo: () => {}
      });

      store.create('bar');

      return assert.isRejected(
        store.foo('bar'),
        /Job "foo" returned undefined for file "bar"/
      )
    });
  });
});