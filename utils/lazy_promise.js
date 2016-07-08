'use strict';

const Promise = require('bluebird');

/**
 * Hacky implementation of a lazily executed Promise.
 *
 * Waits until the first `then` or `catch` call before
 * evaluating the function provided and wrapping the
 * returned (or thrown) value in a promise.
 *
 * Note that execution is synchronous, but the promise
 * will resolve asynchronously. This is an implementation
 * detail that may change at a future point
 */
class LazyPromise {
  constructor(evaluationFunction) {
    this._evaluated = null;
    this._evaluationFunction = evaluationFunction;
  }
  then(val) {
    if (this._evaluated === null) {
      this._evaluateFunction();
    }
    return this._evaluated.then(val);
  }
  catch(val) {
    if (this._evaluated === null) {
      this._evaluateFunction();
    }
    return this._evaluated.catch(val);
  }
  _evaluateFunction() {
    const func = this._evaluationFunction;
    // Ensure memory reclamation by clearing any references
    this._evaluationFunction = null;
    let val;
    try {
      val = func();
    } catch(err) {
      this._evaluated = Promise.reject(err);
      return;
    }
    this._evaluated = Promise.resolve(val);
  }
}

module.exports = {
  LazyPromise
};