import {assert} from '../../utils/assert';
import callOnceAfterTick from '../call-once-after-tick';

describe('call-once-after-tick', () => {
  describe('#callOnceAfterTick', () => {
    it('should accept a function and only call it once per tick', (done) => {
      let count = 0;
      const fn = callOnceAfterTick(() => count++);

      fn();
      fn();
      fn();
      fn();

      assert.equal(count, 0);

      process.nextTick(() => {
        assert.equal(count, 1);

        fn();
        fn();
        fn();
        fn();
        fn();

        assert.equal(count, 1);

        process.nextTick(() => {
          assert.equal(count, 2);
          done();
        });
      });
    });
  });
});