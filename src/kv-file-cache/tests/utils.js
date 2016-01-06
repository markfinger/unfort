import {assert} from '../../utils/assert';
import {murmurFilename} from '../utils';

describe('utils', () => {
  describe('#murmurFilename', () => {
    it('should accept a string and return a filename reflecting a hash of the cache key', () => {
      assert.equal(
        murmurFilename('test'),
        '3127628307.json'
      );
    });
  });
});