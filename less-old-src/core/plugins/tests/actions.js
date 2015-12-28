import {assert} from '../../utils/assert';
import {
  addPlugin, ADD_PLUGIN
} from '../actions';

describe('core/plugins/actions', () => {
  describe('#addPlugin', () => {
    it('should accept a plugin name, initialization function and options object, then return an action', () => {
      const func = () => {};
      const obj = {};
      assert.deepEqual(
        addPlugin('test', func, obj),
        {
          type: ADD_PLUGIN,
          name: 'test',
          plugin: func,
          options: obj
        }
      );
    });
    it('should throw if the plugin name is not a valid string', () => {
      assert.throw(() => addPlugin(''), 'Plugin name "" must be a string');
      assert.throw(() => addPlugin(), 'Plugin name "undefined" must be a string');
      assert.throw(() => addPlugin({}), `Plugin name "[object Object]" must be a string`);
    });
    it('should throw if the initialization function is not a function', () => {
      assert.throw(() => addPlugin('test'), 'Plugin "test" must define an initialization function. Received "undefined"');
      assert.throw(() => addPlugin('test', {}), 'Plugin "test" must define an initialization function. Received "[object Object]"');
    });
    it('should throw if the options object is not an object', () => {
      assert.throw(() => addPlugin('test', () => {}, null), 'Plugin "test" must have an options object defined. Received "null"');
      assert.throw(() => addPlugin('test', () => {}, ''), 'Plugin "test" must have an options object defined. Received ""');
      assert.throw(() => addPlugin('test', () => {}, true), 'Plugin "test" must have an options object defined. Received "true"');
    });
  });
});