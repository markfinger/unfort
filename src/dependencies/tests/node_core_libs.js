import * as path from 'path';
import {assert} from '../../utils/assert';
import {nodeCoreLibs} from '../node_core_libs';

describe('dependencies/node_core_libs', () => {
  describe('#nodeCoreLibs', () => {
    it('should be an object', () => {
      assert.isObject(nodeCoreLibs);
    });
  });
});