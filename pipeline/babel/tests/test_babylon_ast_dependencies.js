const {assert} = require('../../../utils/assert');
const babylon = require('babylon');
const {babylonAstDependencies, COMMONJS, ES_MODULE} = require('../babylon_ast_dependencies');
const babelGenerator = require('babel-generator').default;

describe('pipeline/babel/babylon_ast_dependencies', () => {
  describe('#babylonAstDependencies', () => {
    describe('##dependencies', () => {
      it('should accept an AST and provide a list of dependencies specified in `require` calls', () => {
        const ast = babylon.parse(`
          var foo = require("foo");
          const bar = require('bar');
          foo(bar);
        `);

        const outcome = babylonAstDependencies(ast);
        assert.deepEqual(
          outcome.dependencies,
          [
            {
              type: COMMONJS,
              identifier: 'foo'
            },
            {
              type: COMMONJS,
              identifier: 'bar'
            }
          ]
        );
      });
      it('should not pull dependencies from `require` calls that are properties of an object', () => {
        const ast = babylon.parse(`
          const foo = {require: function() {}};
          var bar = foo.require('bar');
        `);

        assert.deepEqual(babylonAstDependencies(ast).dependencies, []);
      });
      it('should pull dependencies from es module imports and provide context about specifiers', () => {
        const ast = babylon.parse(
          `
            import foo from "foo";
            import {bar, woz} from "bar";
            import qux, {dux} from "qux";
          `,
          {sourceType: 'module'}
        );

        assert.deepEqual(
          babylonAstDependencies(ast).dependencies,
          [
            {
              type: ES_MODULE,
              identifier: 'foo',
              specifiers: [
                {
                  name: 'foo',
                  isDefault: true
                }
              ]
            },
            {
              type: ES_MODULE,
              identifier: 'bar',
              specifiers: [
                {
                  name: 'bar',
                  isDefault: false
                },
                {
                  name: 'woz',
                  isDefault: false
                }
              ]
            },
            {
              type: ES_MODULE,
              identifier: 'qux',
              specifiers: [
                {
                  name: 'qux',
                  isDefault: true
                },
                {
                  name: 'dux',
                  isDefault: false
                }
              ]
            }
          ]
        );
      });
      it('should identify a dependency if it occurs multiple times', () => {
        const ast = babylon.parse(
          'import foo from "foo"; import {bar} from "foo";',
          {sourceType: 'module'}
        );

        assert.deepEqual(
          babylonAstDependencies(ast).dependencies,
          [
            {
              type: ES_MODULE,
              identifier: 'foo',
              specifiers: [
                {
                  name: 'foo',
                  isDefault: true
                }
              ]
            },
            {
              type: ES_MODULE,
              identifier: 'foo',
              specifiers: [
                {
                  name: 'bar',
                  isDefault: false
                }
              ]
            }
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
          babylonAstDependencies(ast).dependencies,
          [
            {
              type: ES_MODULE,
              identifier: 'foo',
              specifiers: [
                {
                  name: 'foo',
                  isDefault: false
                }
              ]
            }
          ]
        );
      });
    });
    describe('##resolveModuleIdentifier', () => {
      it('should enable dependency source identifiers to be rewritten', () => {
        const input = `
          import foo from "foo";
          import {bar} from "bar";
          const woz1 = require('woz');
          const woz2 = require('woz');
        `;

        const expected = (
          '\nimport foo from "0"; /* foo */\n' +
          'import { bar } from "1"; /* bar */\n' +
          'const woz1 = require("2") /* woz */;\n' +
          'const woz2 = require("2") /* woz */;'
        );

        const ast = babylon.parse(input, {sourceType: 'module'});

        function resolveModuleIdentifier(identifier) {
          if (identifier === 'foo') {
            return '0';
          }
          if (identifier === 'bar') {
            return '1';
          }
          if (identifier === 'woz') {
            return '2';
          }
          throw new Error('Unexpected identifier: ' + identifier);
        }

        const outcome = babylonAstDependencies(ast, {resolveModuleIdentifier});

        assert.deepEqual(
          outcome.dependencies,
          [
            {
              type: ES_MODULE,
              identifier: 'foo',
              specifiers: [
                {
                  name: 'foo',
                  isDefault: true
                }
              ]
            },
            {
              type: ES_MODULE,
              identifier: 'bar',
              specifiers: [
                {
                  name: 'bar',
                  isDefault: false
                }
              ]
            },
            {
              type: COMMONJS,
              identifier: 'woz'
            },
            {
              type: COMMONJS,
              identifier: 'woz'
            }
          ]
        );

        assert.equal(
          babelGenerator(ast, {comments: true}, input).code,
          expected
        );
      });
    });
    describe('##exports', () => {
      it('should describe the specifiers produced in export statements', () => {
        const ast = babylon.parse(`
            export {foo, bar} from 'foo';
            export const woz = 1;
            const qux = 1;
            export default qux;
          `,
          {sourceType: 'module'}
        );

        assert.deepEqual(
          babylonAstDependencies(ast).exports,
          [
            {
              type: ES_MODULE,
              name: 'foo',
              isDefault: false
            },
            {
              type: ES_MODULE,
              name: 'bar',
              isDefault: false
            },
            {
              type: ES_MODULE,
              name: 'woz',
              isDefault: false
            },
            {
              type: ES_MODULE,
              name: null,
              isDefault: true
            }
          ]
        );
      });
    });
    describe('##errors', () => {
      it('should produce errors if `require` calls contain variables', () => {
        const ast = babylon.parse(`
          const foo = 'foo';
          var bar = require(foo);
        `);

        assert.throws(
          () => babylonAstDependencies(ast),
          'require(...) expression at line 3, column 28 cannot be statically analyzed'
        );
      });
      it('should produce errors if `require` calls contain expressions', () => {
        const ast = babylon.parse(`
          const foo = 'foo';
          var bar = require('bar/' + foo);
        `);

        assert.throws(
          () => babylonAstDependencies(ast),
          'require(...) expression at line 3, column 28 cannot be statically analyzed'
        );
      });
      it('should produce errors with a `loc` property', () => {
        const ast = babylon.parse(`
          const foo = 'foo';
          var bar = require('bar/' + foo);
        `);

        try {
          babylonAstDependencies(ast)
        } catch(err) {
          assert.deepEqual(
            err.loc,
            {
              line: 3,
              column: 28
            }
          );
          return;
        }
        throw new Error('Should not reach this point');
      });
    });
  });
});