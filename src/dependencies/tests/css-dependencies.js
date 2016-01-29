import {assert} from '../../utils/assert';
import postcss from 'postcss';
import {createMockCache, createMemoryCache} from '../../kv-cache';
import {
  buildPostCssAst, getCachedStyleSheetImports, getDependencyIdentifiersFromStyleSheetAst,
  getDependencyIdentifierFromImportRule
} from '../css-dependencies';

describe('dependencies/css-dependencies', () => {
  describe('#buildPostCssAst', () => {
    it('should be able to build a PostCSS AST', () => {
      return buildPostCssAst({name: 'test.css', text: '@import "foo.css"'})
        .then(ast => {
          assert.equal(
            ast.first.type,
            'atrule'
          );
        });
    });
    it('should produce an error, if an import is missing a trailing quotation mark', () => {
      // This is a sanity check, as PostCSS will often try to repair broken css.
      // If this ever starts failing, we should remove this test case and add
      // it as a constraint during analysis of dependency identifiers
      return buildPostCssAst({name: 'foo.css', text: '@import url("test.css);'})
        .then(
          () => {throw new Error('should not reach this')},
          err => {
            assert.isString(err.message);
            assert.isString(err.stack);
          });
    });
    it('should indicate the filename for parse errors', () => {
      return buildPostCssAst({name: 'foo.css', text: 'bo}d:y}{"'})
        .then(
          () => {throw new Error('should not reach this')},
          err => {assert.throws(() => {throw err}, 'foo.css')}
        );
    });
  });
  describe('#getCachedStyleSheetImports', () => {
    it('should return a list of identifiers', () => {
      const cache = createMockCache();

      function getAst() {
        return Promise.resolve(postcss.parse('@import url("foo.css");'));
      }

      return getCachedStyleSheetImports({cache, key: 'test', getAst})
        .then(imports => {
          assert.deepEqual(
            imports,
            [
              {source: 'foo.css'}
            ]
          )
        });
    });
    it('should not compute the AST if data is in the cache', () => {
      const cache = createMemoryCache();
      const key = 'foo';

      return cache.set(key, 'bar')
        .then(() => {
          return getCachedStyleSheetImports({cache, key}).then(imports => {
            assert.equal(imports, 'bar');
          });
        });
    });
  });
  describe('#getDependencyIdentifiersFromStyleSheetAst', () => {
    it('should extract multiple identifiers', () => {
      // Test data sourced from https://developer.mozilla.org/en/docs/Web/CSS/@import#Examples

      const ast = postcss.parse(`
        @import url("fineprint.css") print;
        @import url("bluish.css") projection, tv;
        @import 'custom.css';
        @import url("chrome://communicator/skin/");
        @import "common.css" screen, projection;
        @import url('landscape.css') screen and (orientation:landscape);
      `);

      return getDependencyIdentifiersFromStyleSheetAst(ast).then(identifiers => {
        assert.deepEqual(
          identifiers,
          [
            {source: 'fineprint.css'},
            {source: 'bluish.css'},
            {source: 'custom.css'},
            {source: 'chrome://communicator/skin/'},
            {source: 'common.css'},
            {source: 'landscape.css'}
          ]
        );
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