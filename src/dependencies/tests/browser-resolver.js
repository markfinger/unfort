import * as path from 'path';
import {assert} from '../../utils/assert';
import {nodeCoreLibs} from '../node-core-libs';
import {browserResolver} from '../browser-resolver';

describe('dependencies/browser-resolver', () => {
  describe('#browserResolver', () => {
    it('should correctly resolve `browser` dependencies', () => {
      return browserResolver('__resolve_test_case__', __dirname).then(resolved => {
        assert.equal(
          resolved,
          path.join(__dirname, 'node_modules', '__resolve_test_case__', 'browser.js')
        );
      });
    });
    it('should map to packages that replace node core libraries', () => {
      return browserResolver('path', __dirname).then(resolved => {
        assert.equal(resolved, nodeCoreLibs.path);
      });
    });
    it('should provide helpful error messages for failed lookups', () => {
      return browserResolver('__non_existent_package__', __dirname).catch(err => {
        assert.instanceOf(err, Error);
        assert.include(err.message, '__non_existent_package');
        assert.include(err.message, __dirname);
      });
    });
  });
});