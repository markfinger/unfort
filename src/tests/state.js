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
        entryPoints: 'test entry points',
        sourceRoot: 'test source root',
        rootNodeModules: 'test root node modules',
        cacheDirectory: 'test cache dir',
        jobCache: 'test job cache'
      });

      assert.equal(state.entryPoints, 'test entry points');
      assert.equal(state.sourceRoot, 'test source root');
      assert.equal(state.rootNodeModules, 'test root node modules');
      assert.equal(state.cacheDirectory, 'test cache dir');
      assert.equal(state.jobCache, 'test job cache');
    });
  });
});