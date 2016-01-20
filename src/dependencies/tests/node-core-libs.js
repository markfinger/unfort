import * as path from 'path';
import {assert} from '../../utils/assert';
import {nodeCoreLibs} from '../node-core-libs';

describe('dependencies/node-core-libs', () => {
  describe('#nodeCoreLibs', () => {
    it('should be an object', () => {
      assert.isObject(nodeCoreLibs);
    });
  });
});