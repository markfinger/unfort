import {assert} from '../../utils/assert';
import {createMockWorkers} from '../mock_workers';

export function testFunction(testArg, cb) {
  cb(null, testArg);
}

describe('workers/mock_workers', () => {
  describe('#createMockWorkers', () => {
    it('should expose a method to invoke a module in a module', (done) => {
      const workers = createMockWorkers();

      workers.callFunction({
        filename: __filename,
        name: 'testFunction',
        args: ['test']
      }, (err, result) => {
        assert.isNull(err);
        assert.equal(result, 'test');
        done();
      });
    });
    it('should indicate if a module is missing an exported function', (done) => {
      const workers = createMockWorkers();

      workers.callFunction({
        filename: __filename,
        name: 'missingFunction',
        args: []
      }, (err) => {
        assert.instanceOf(err, Error);
        assert.include(err.message, `Module ${__filename} does not export a function named missingFunction`);
        done();
      });
    });
  });
});