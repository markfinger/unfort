import * as babylon from 'babylon';
import {cloneDeep} from 'lodash/lang';
import {assert} from '../../utils/assert';
import {createPipeline} from '../../pipeline/pipeline';
import {createBabelAstDependencyAnalyzer} from '../babel_ast_dependency_analyzer';

describe('dependencies/babylon_ast_dependencies', () => {
  describe('#babelAstDependencyAnalyzer', () => {
    it('should accept an AST and provide a list of dependencies specified in `require` calls', (done) => {
      const ast = babylon.parse(`
        var foo = require("foo");
        const bar = require('bar');
        foo(bar);
      `);

      const pipeline = createPipeline();
      const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();

      babelAstDependencyAnalyzer({ast, file: 'test'}, pipeline, (err, dependencies) => {
        assert.isNull(err);
        assert.deepEqual(dependencies, ['foo', 'bar']);
        done();
      });
    });
    it('should produce errors if `require` calls contain variables', (done) => {
      const ast = babylon.parse(`
        const foo = 'foo';
        var bar = require(foo);
      `);

      const pipeline = createPipeline();
      const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();

      babelAstDependencyAnalyzer({ast, file: 'test'}, pipeline, (err) => {
        assert.instanceOf(err, Error);
        assert.equal(
          err.message,
          'Non-literal (Identifier) passed to \`require\` call at line 3, column 26'
        );
        done();
      });
    });
    it('should produce errors if `require` calls contain expressions', (done) => {
      const ast = babylon.parse(`
        const foo = 'foo';
        var bar = require('bar/' + foo);
      `);

      const pipeline = createPipeline();
      const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();
      
      babelAstDependencyAnalyzer({ast, file: 'test'}, pipeline, (err) => {
        assert.instanceOf(err, Error);
        assert.equal(
          err.message,
          'Non-literal (BinaryExpression) passed to \`require\` call at line 3, column 26'
        );
        done();
      });
    });
    it('should not pull dependencies from `require` calls that are properties of an object', (done) => {
      const ast = babylon.parse(`
        const foo = {require: function() {}};
        var bar = foo.require('bar');
      `);

      const pipeline = createPipeline();
      const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();

      babelAstDependencyAnalyzer({ast, file: 'test'}, pipeline, (err, dependencies) => {
        assert.deepEqual(dependencies, []);
        done();
      });
    });
    it('should pull dependencies from es module imports', (done) => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'bar';`,
        {sourceType: 'module'}
      );

      const pipeline = createPipeline();
      const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();

      babelAstDependencyAnalyzer({ast, file: 'test'}, pipeline, (err, dependencies) => {
        assert.deepEqual(dependencies, ['foo', 'bar']);
        done();
      });
    });
    it('should only identify a dependency once', (done) => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'foo';`,
        {sourceType: 'module'}
      );

      const pipeline = createPipeline();
      const babelAstDependencyAnalyzer = createBabelAstDependencyAnalyzer();

      babelAstDependencyAnalyzer({ast, file: 'test'}, pipeline, (err, dependencies) => {
        assert.deepEqual(dependencies, ['foo']);
        done();
      });
    });
  });
});