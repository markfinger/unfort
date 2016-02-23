import path from 'path';
import {assert} from './assert';
import {createState} from '../state';

describe('unfort/state', () => {
  describe('#createState', () => {
    it('should produce a record with sane defaults', () => {
      const state = createState();

      assert.deepEqual(state.entryPoints, []);
      assert.equal(state.sourceRoot, process.cwd());
      assert.equal(state.rootNodeModules, path.join(process.cwd(), 'node_modules'));
      assert.equal(state.cacheDirectory, path.join(process.cwd(), '.unfort'));
    });
    it('should allow values to be defined', () => {
      const state = createState({
        entryPoints: 'hello'
      });

      assert.equal(state.entryPoints, 'hello');
    });
  });
});