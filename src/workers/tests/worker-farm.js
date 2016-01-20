import {assert} from '../../utils/assert';
import {createWorkerFarm} from '../worker-farm';

const workerEntry = require.resolve('./worker-farm/worker-entry');

describe('workers/worker-farm', () => {
  describe('#createWorkerFarm', () => {
    it('should expose a method to invoke a module in a module', (done) => {
      const workers = createWorkerFarm();

      workers.callFunction({
        filename: workerEntry,
        name: 'testFunction',
        args: ['foo', 'bar']
      }, (err, result) => {
        assert.isNull(err);
        assert.equal(result, 'foo bar');
        done();
      });
    });
    it('should indicate if a module is missing an exported function', (done) => {
      const workers = createWorkerFarm();

      workers.callFunction({
        filename: workerEntry,
        name: 'missingFunction',
        args: []
      }, (err) => {
        assert.instanceOf(err, Error);
        assert.include(err.message, `Module ${workerEntry} does not export a function named missingFunction`);
        done();
      });
    });
  });
});