import {assert} from '../../utils/assert';
import {generateMurmurHash} from '../utils';

describe('utils', () => {
  describe('#generateMurmurHash', () => {
    it('should produce a hash of a string', () => {
      assert.equal(
        generateMurmurHash('test'),
        '3127628307'
      );
    });
    it('should produce a hash of an array', () => {
      assert.equal(
        generateMurmurHash(['foo', 'bar']),
        '4138058784_1158584717'
      );
    });
    it('should throw if the array does not contain any entries', () => {
      assert.throws(
        () => generateMurmurHash([]),
        'Key array does not contain any entries'
      );
    });
    it('should produce a hash of a non-string value', () => {
      assert.equal(
        generateMurmurHash(10),
        '2263091519'
      );
    });
    it('should accept an array that contains non-strings', () => {
      assert.equal(
        generateMurmurHash([10, {}, [], false]),
        '2263091519_1515928286_0_3579944471'
      );
    });
  });
});