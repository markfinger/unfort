import {assert} from '../../utils/assert';
import postcss from 'postcss';
import {createMockCache, createMemoryCache} from '../../kv-cache';
import {buildPostCssAst, getCachedStyleSheetImports} from '../css-dependencies';

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
});