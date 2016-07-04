'use strict';

const {assert} = require('../assert');
const {LazyPromise} = require('../lazy_promise');

describe('utils/lazy_promise', () => {
  describe('#LazyPromise', () => {
    it('should not evaluate until `.then` is called', () => {
      let evaluated = false;
      const promise = new LazyPromise(res => {
        evaluated = true;
        res('test res');
      });
      assert.isFalse(evaluated);
      return assert.isFulfilled(
        Promise.resolve().then(() => {
          assert.isFalse(evaluated);
          return promise.then(val => {
            assert.isTrue(evaluated);
            assert.equal(val, 'test res');
          })
        })
      );
    });
    it('should not evaluate until `.catch` is called', () => {
      let evaluated = false;
      const promise = new LazyPromise((res, rej) => {
        evaluated = true;
        rej('test rej');
      });
      assert.isFalse(evaluated);
      return assert.isFulfilled(
        Promise.resolve().then(() => {
          assert.isFalse(evaluated);
          return promise.catch(err => {
            assert.isTrue(evaluated);
            assert.equal(err, 'test rej');
          });
        })
      );
    });
  });
});