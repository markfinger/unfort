import * as path from 'path';
import * as imm from 'immutable';
import {assert} from '../../utils/assert';
import {createPipeline} from '../../pipeline/pipeline';
import {createBrowserResolver, nodeLibs} from '../browser_resolve';

describe('dependencies/browser_resolve', () => {
  describe('#browserResolver', () => {
    it('should correctly resolve `browser` dependencies', (done) => {
      const browserResolver = createBrowserResolver();
      const pipeline = createPipeline();

      browserResolver({dependency: '__resolve_test_case__', basedir: __dirname}, pipeline, (err, resolved) => {
        assert.isNull(err);
        assert.equal(
          resolved,
          path.join(__dirname, 'node_modules', '__resolve_test_case__', 'browser.js')
        );
        done();
      });
    });
    it('should map to packages that replace node core libraries', (done) => {
      const browserResolver = createBrowserResolver();
      const pipeline = createPipeline();

      browserResolver({dependency: 'path', basedir: __dirname}, pipeline, (err, resolved) => {
        assert.isNull(err);
        assert.equal(resolved, nodeLibs.path);
        done();
      });
    });
    it('should provide helpful error messages for failed lookups', (done) => {
      const browserResolver = createBrowserResolver();
      const pipeline = createPipeline();

      browserResolver({dependency: '__non_existent_package__', basedir: __dirname}, pipeline, (err) => {
        assert.instanceOf(err, Error);
        assert.include(err.message, '__non_existent_package');
        assert.include(err.message, __dirname);
        done();
      });
    });
  });
});