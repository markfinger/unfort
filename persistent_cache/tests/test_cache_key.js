"use strict";

const {assert} = require('../../utils/assert');
const {generateCacheKey} = require('../cache_key');

describe('persistent_cache/cache_key', () => {
  describe('#generateCacheKey', () => {
    it('should accept a string and produce a hash', () => {
      assert.equal(
        generateCacheKey('test'),
        '3127628307'
      );
    });
    it('should produce a stable cache key', () => {
      assert.equal(
        generateCacheKey('test'),
        '3127628307'
      );
      assert.equal(
        generateCacheKey('test'),
        '3127628307'
      );
    });
    it('should accept an array of values and generate a hash', () => {
      assert.equal(
        generateCacheKey(['test', 'test']),
        '3127628307_3127628307'
      );
      assert.equal(
        generateCacheKey([11, 10]),
        '2560416690_2263091519'
      );
    });
  });
});