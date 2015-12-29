import {assert} from '../../utils/assert';
import {cloneDeepOmitPrivateProps} from '../clone';

describe('utils/clone', () => {
  describe('#cloneDeepOmitPrivateProps', () => {
    it('should clone an object and remove any props starting with `_`', () => {
      const original = {
        foo: {
          foo: {
            foo: ['bar', '_bar'],
            _foo: ['bar']
          },
          _foo: {
            foo: ['bar'],
            _foo: ['bar']
          },
          __bar: 'woz'
        },
        bar: 'woz'
      };

      const clone = cloneDeepOmitPrivateProps(original);
      assert.deepEqual(clone, {
        foo: {
          foo: {
            foo: ['bar', '_bar']
          }
        },
        bar: 'woz'
      });

      assert.notStrictEqual(clone, original);
      assert.notStrictEqual(clone.foo, original.foo);
      assert.notStrictEqual(clone.foo.foo, original.foo.foo);
    });
  });
});