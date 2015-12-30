import * as babylon from 'babylon';
import {cloneDeep} from 'lodash/lang';
import {assert} from '../../utils/assert';
import {discoverDependenciesInBabylonAst} from '../babylon_dependencies';

describe('dependencies/babylon_dependencies', () => {
  describe('#discoverDependenciesInBabylonAst', () => {
    it('should accept an AST and provide a list of dependencies specified in `require` calls', (done) => {
      const ast = babylon.parse(`
        var foo = require("foo");
        const bar = require('bar');
        foo(bar);
      `);

      discoverDependenciesInBabylonAst(ast, (err, dependencies) => {
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

      discoverDependenciesInBabylonAst(ast, (err) => {
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

      discoverDependenciesInBabylonAst(ast, (err) => {
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

      discoverDependenciesInBabylonAst(ast, (err, dependencies) => {
        assert.deepEqual(dependencies, []);
        done();
      });
    });
    it('should pull dependencies from es module imports', (done) => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'bar';`,
        {sourceType: 'module'}
      );

      discoverDependenciesInBabylonAst(ast, (err, dependencies) => {
        assert.deepEqual(dependencies, ['foo', 'bar']);
        done();
      });
    });
    it('should not mutate the ast when resolving dependencies', (done) => {
      const testText = `
        import foo from 'foo';
        import {bar} from 'bar';
        const woz = require('woz');

        const test = (qux) => {
          const testy = 'foo';
          return testy + qux();
        };

        test(foo);

        export default foo;
      `;

      const ast = cloneDeep(
        babylon.parse(
          testText,
          {sourceType: 'module'}
        )
      );

      const clonedAst = cloneDeep(ast);

      assert.notStrictEqual(ast, clonedAst);
      assert.deepEqual(ast, clonedAst);

      discoverDependenciesInBabylonAst(ast, (err, dependencies) => {
        assert.deepEqual(dependencies, ['foo', 'bar', 'woz']);
        assert.deepEqual(ast, clonedAst);
        done();
      });
    });
    it('should only identify a dependency once', (done) => {
      const ast = babylon.parse(
        `import foo from 'foo'; import {bar} from 'foo';`,
        {sourceType: 'module'}
      );

      discoverDependenciesInBabylonAst(ast, (err, dependencies) => {
        assert.deepEqual(dependencies, ['foo']);
        done();
      });
    });
  });
});