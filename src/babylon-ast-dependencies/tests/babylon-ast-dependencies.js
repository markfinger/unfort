import * as babylon from 'babylon';
import {assert} from '../../utils/assert';
import {babylonAstDependencies} from '../babylon-ast-dependencies';

describe('babylon-ast-dependencies', () => {
  describe('#babylonAstDependencies', () => {
    it('should accept an AST and provide a list of dependencies specified in `require` calls', () => {
      const ast = babylon.parse(`
        var foo = require("foo");
        const bar = require('bar');
        foo(bar);
      `);

      const dependencies = babylonAstDependencies(ast);
      assert.deepEqual(
        dependencies,
        [
          {source: 'foo'},
          {source: 'bar'}
        ]
      );
    });
    it('should produce errors if `require` calls contain variables', () => {
      const ast = babylon.parse(`
        const foo = 'foo';
        var bar = require(foo);
      `);


      assert.throws(
        () => babylonAstDependencies(ast),
        'Require expression at line 3, column 26 cannot be statically analyzed'
      );
    });
    it('should produce errors if `require` calls contain expressions', () => {
      const ast = babylon.parse(`
        const foo = 'foo';
        var bar = require('bar/' + foo);
      `);

      assert.throws(
        () => babylonAstDependencies(ast),
        'Require expression at line 3, column 26 cannot be statically analyzed'
      );
    });
    it('should not pull dependencies from `require` calls that are properties of an object', () => {
      const ast = babylon.parse(`
        const foo = {require: function() {}};
        var bar = foo.require('bar');
      `);

      assert.deepEqual(babylonAstDependencies(ast), []);
    });
    it('should pull dependencies from es module imports', () => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'bar';`,
        {sourceType: 'module'}
      );

      assert.deepEqual(
        babylonAstDependencies(ast),
        [
          {source: 'foo'},
          {source: 'bar'}
        ]
      );
    });
    it('should only identify a dependency once', () => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'foo';`,
        {sourceType: 'module'}
      );

      assert.deepEqual(
        babylonAstDependencies(ast),
        [
          {source: 'foo'}
        ]
      );
    });
    it('should identify dependencies in export ... from \'...\' statements', () => {
      const ast = babylon.parse(`
          export {foo} from 'foo';

          export const bar = 1;
        `,
        {sourceType: 'module'}
      );

      assert.deepEqual(
        babylonAstDependencies(ast),
        [
          {source: 'foo'}
        ]
      );
    });
  });
});