'use strict';

const Promise = require('bluebird');

/**
 * Hacky implementation of a lazily executed Promise.
 *
 * In effect, it waits until the first `then` or `catch` call before
 * evaluating the function provided.
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
    // Allow memory reclamation by clearing any references
    this._evaluationFunction = null;
    this._evaluated = new Promise(func);
  }
}

module.exports = {
  LazyPromise
};