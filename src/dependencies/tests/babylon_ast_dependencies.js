import * as babylon from 'babylon';
import {assert} from '../../utils/assert';
import {analyzeBabelAstDependencies} from '../babel_ast_dependency_analyzer';

describe('dependencies/babylon_ast_dependencies', () => {
  describe('#analyzeBabelAstDependencies', () => {
    it('should accept an AST and provide a list of dependencies specified in `require` calls', () => {
      const ast = babylon.parse(`
        var foo = require("foo");
        const bar = require('bar');
        foo(bar);
      `);

      const dependencies = analyzeBabelAstDependencies(ast);
      assert.deepEqual(dependencies, ['foo', 'bar']);
    });
    it('should produce errors if `require` calls contain variables', () => {
      const ast = babylon.parse(`
        const foo = 'foo';
        var bar = require(foo);
      `);


      assert.throws(
        () => analyzeBabelAstDependencies(ast),
        'Non-literal (Identifier) passed to \`require\` call at line 3, column 26'
      );
    });
    it('should produce errors if `require` calls contain expressions', () => {
      const ast = babylon.parse(`
        const foo = 'foo';
        var bar = require('bar/' + foo);
      `);

      assert.throws(
        () => analyzeBabelAstDependencies(ast),
        'Non-literal (BinaryExpression) passed to \`require\` call at line 3, column 26'
      );
    });
    it('should not pull dependencies from `require` calls that are properties of an object', () => {
      const ast = babylon.parse(`
        const foo = {require: function() {}};
        var bar = foo.require('bar');
      `);

      assert.deepEqual(analyzeBabelAstDependencies(ast), []);
    });
    it('should pull dependencies from es module imports', () => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'bar';`,
        {sourceType: 'module'}
      );

      assert.deepEqual(analyzeBabelAstDependencies(ast), ['foo', 'bar']);
    });
    it('should only identify a dependency once', () => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'foo';`,
        {sourceType: 'module'}
      );

      assert.deepEqual(analyzeBabelAstDependencies(ast), ['foo']);
    });
  });
});