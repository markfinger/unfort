"use strict";

const {assert} = require('../assert');
const {generateStringHash} = require('../hash');

describe('utils/hash', () => {
  describe('#generateStringHash', () => {
    it('should return the expected murmur hash as a string', () => {
      assert.equal(generateStringHash('test'), '3127628307');
    });
  });
});