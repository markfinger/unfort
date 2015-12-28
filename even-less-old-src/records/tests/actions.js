import {assert} from '../../utils/assert';
import {
  addSignal, ADD_SIGNAL, addSignalHandler, ADD_SIGNAL_HANDLER
} from '../actions';

describe('core/signals/actions', () => {
  describe('#addSignal', () => {
    it('should accept a signal name and return an action', () => {
      assert.deepEqual(
        addSignal('test'),
        {
          type: ADD_SIGNAL,
          name: 'test'
        }
      );
    });
    it('should throw if the signal name is not a valid string', () => {
      assert.throw(() => addSignal(''), 'Signal "" must be a string');
      assert.throw(() => addSignal(), 'Signal "undefined" must be a string');
      assert.throw(() => addSignal({}), `Signal "[object Object]" must be a string`);
    });
  });
  describe('#addSignalHandler', () => {
    it('should accept a signal name and return an action', () => {
      const func = () => {};
      assert.deepEqual(
        addSignalHandler('test', func),
        {
          type: ADD_SIGNAL_HANDLER,
          name: 'test',
          handler: func
        }
      );
    });
    it('should throw if the signal name is not a valid string or the handler is not a valid function', () => {
      assert.throw(() => addSignalHandler('', () => {}), 'Signal "" must be a string');
      assert.throw(() => addSignalHandler(), 'Signal "undefined" must be a string');
      assert.throw(() => addSignalHandler(null, null), 'Signal "null" must be a string');
      assert.throw(() => addSignalHandler('test'), 'Signal handlers must be functions. Received "undefined" for signal "test"');
    });
  });
});