import imm from 'immutable';
import {assert} from '../../utils/assert';
import {addPlugin} from '../actions';
import {pluginsReducer} from '../reducers';

describe('core/plugins/reducers', () => {
  describe('#pluginsReducer', () => {
    it('should initialize state correctly', () => {
      const initialState = pluginsReducer(undefined, {});
      assert.equal(initialState, imm.List());
    });
    it('should handle plugin additions', () => {
      const func1 = () => {};
      const obj1 = {};
      let state = pluginsReducer(undefined, addPlugin('test', func1, obj1));
      assert.equal(
        state,
        imm.fromJS([
          {
            name: 'test',
            plugin: func1,
            options: obj1
          }
        ])
      );

      const func2 = () => {};
      const obj2 = {};
      state = pluginsReducer(state, addPlugin('another', func2, obj2));
      assert.equal(
        state,
        imm.fromJS([
          {
            name: 'test',
            plugin: func1,
            options: obj1
          },
          {
            name: 'another',
            plugin: func2,
            options: obj2
          }
        ])
      );
    });
  });
});