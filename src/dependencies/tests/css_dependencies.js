import {assert} from '../../utils/assert';
import postcss from 'postcss';
import {createMockCache, createMemoryCache} from '../../kv-cache';
import {
  buildPostCssAst, getCachedStyleSheetImports, getDependencyIdentifiersFromStyleSheetAst,
  getDependencyIdentifierFromImportRule
} from '../css_dependencies';

describe('dependencies/css_dependencies', () => {
  describe('#buildPostCssAst', () => {
    it('should throw if an import is missing a trailing quotation mark', () => {
      // This is a sanity check, as PostCSS will often try to repair broken css.
      // If this ever starts failing, we should remove this test case and add
      // it as a constraint during analysis of dependency identifiers
      assert.throws(
        () => postcss.parse('@import url("test.css);').first
      );
    });
  });
  describe('#getCachedStyleSheetImports', () => {
    it('should return a list of identifiers', (done) => {
      const cache = createMockCache();

      function getAst(cb) {
        cb(null, postcss.parse('@import url("foo.css");'));
      }

      getCachedStyleSheetImports({cache, key: 'test', getAst}, (err, imports) => {
        assert.isNull(err);
        assert.deepEqual(
          imports,
          ['foo.css']
        );
        done();
      });
    });
    it('should not compute the AST if data is in the cache', (done) => {
      const cache = createMemoryCache();
      const key = 'foo';

      cache.set(key, 'bar', (err) => {
        assert.isNull(err);

        getCachedStyleSheetImports({cache, key}, (err, imports) => {
          assert.isNull(err);
          assert.equal(imports, 'bar');
          done();
        });
      });
    });
  });
  describe('#getDependencyIdentifiersFromStyleSheetAst', () => {
    it('should extract multiple identifiers', (done) => {
      // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples

      const ast = postcss.parse(`
        @import url("fineprint.css") print;
        @import url("bluish.css") projection, tv;
        @import 'custom.css';
        @import url("chrome://communicator/skin/");
        @import "common.css" screen, projection;
        @import url('landscape.css') screen and (orientation:landscape);
      `);

      getDependencyIdentifiersFromStyleSheetAst(ast, (err, identifiers) => {
        assert.isNull(err);

        assert.deepEqual(
          identifiers,
          [
            'fineprint.css',
            'bluish.css',
            'custom.css',
            'chrome://communicator/skin/',
            'common.css',
            'landscape.css'
          ]
        );

        done();
      });
    });
  });
  describe('#getDependencyIdentifierFromImportRule', () => {
    it('should correctly extract identifiers', () => {
      // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples

      let rule = postcss.parse('@import url("fineprint.css") print;').first;
      let identifier = getDependencyIdentifierFromImportRule(rule);
      assert.equal(identifier, 'fineprint.css');

      rule = postcss.parse('@import url("bluish.css") projection, tv;').first;
      identifier = getDependencyIdentifierFromImportRule(rule);
      assert.equal(identifier, 'bluish.css');

      rule = postcss.parse("@import 'custom.css';").first;
      identifier = getDependencyIdentifierFromImportRule(rule);
      assert.equal(identifier, 'custom.css');

      rule = postcss.parse('@import url("chrome://communicator/skin/");').first;
      identifier = getDependencyIdentifierFromImportRule(rule);
      assert.equal(identifier, 'chrome://communicator/skin/');

      rule = postcss.parse('@import "common.css" screen, projection;').first;
      identifier = getDependencyIdentifierFromImportRule(rule);
      assert.equal(identifier, 'common.css');

      rule = postcss.parse("@import url('landscape.css') screen and (orientation:landscape);").first;
      identifier = getDependencyIdentifierFromImportRule(rule);
      assert.equal(identifier, 'landscape.css');
    });
    it('should throw if the import is missing quotation marks', () => {
      let rule = postcss.parse('@import url(test.css);').first;
      assert.throws(
        () => getDependencyIdentifierFromImportRule(rule),
        'Malformed @import cannot resolve identifier'
      );

      rule = postcss.parse('@import test.css;').first;
      assert.throws(
        () => getDependencyIdentifierFromImportRule(rule),
        'Malformed @import cannot resolve identifier'
      );
    });
    it('should throw if the import is empty', () => {
      let rule = postcss.parse('@import url();').first;
      assert.throws(
        () => getDependencyIdentifierFromImportRule(rule),
        'Malformed @import cannot resolve identifier'
      );

      rule = postcss.parse('@import "";').first;
      assert.throws(
        () => getDependencyIdentifierFromImportRule(rule),
        'Malformed @import cannot resolve identifier'
      );
    });
  });
});