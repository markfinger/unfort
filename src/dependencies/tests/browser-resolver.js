import * as path from 'path';
import {assert} from '../../utils/assert';
import {nodeCoreLibs} from '../node-core-libs';
import {browserResolver} from '../browser-resolver';

describe('dependencies/browser-resolver', () => {
  describe('#browserResolver', () => {
    it('should correctly resolve `browser` dependencies', (done) => {
      browserResolver('__resolve_test_case__', __dirname, (err, resolved) => {
        assert.isNull(err);
        assert.equal(
          resolved,
          path.join(__dirname, 'node_modules', '__resolve_test_case__', 'browser.js')
        );
        done();
      });
    });
    it('should map to packages that replace node core libraries', (done) => {
      browserResolver('path', __dirname, (err, resolved) => {
        assert.isNull(err);
        assert.equal(resolved, nodeCoreLibs.path);
        done();
      });
    });
    it('should provide helpful error messages for failed lookups', (done) => {
      browserResolver('__non_existent_package__', __dirname, (err) => {
        assert.instanceOf(err, Error);
        assert.include(err.message, '__non_existent_package');
        assert.include(err.message, __dirname);
        done();
      });
    });
  });
});