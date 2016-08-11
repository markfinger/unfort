"use strict";

const test = require('ava');
const babylon = require('babylon');
const {babylonAstDependencies, COMMONJS, ES_MODULE} = require('../babylon_ast_dependencies');
const babelGenerator = require('babel-generator').default;

test('should accept an AST and provide a list of dependencies specified in `require` calls', (t) => {
  const ast = babylon.parse(`
    var foo = require("foo");
    const bar = require('bar');
    foo(bar);
  `);

  const outcome = babylonAstDependencies(ast);
  t.deepEqual(
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

test('should not pull dependencies from `require` calls that are properties of an object', (t) => {
  const ast = babylon.parse(`
    const foo = {require: function() {}};
    var bar = foo.require('bar');
  `);

  t.deepEqual(babylonAstDependencies(ast).dependencies, []);
});

test('should pull dependencies from es module imports and provide context about specifiers', (t) => {
  const ast = babylon.parse(
    `
      import foo from "foo";
      import {bar, woz} from "bar";
      import qux, {dux} from "qux";
    `,
    {sourceType: 'module'}
  );

  t.deepEqual(
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

test('should identify a dependency if it occurs multiple times', (t) => {
  const ast = babylon.parse(
    'import foo from "foo"; import {bar} from "foo";',
    {sourceType: 'module'}
  );

  t.deepEqual(
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

test('should identify dependencies in export ... from \'...\' statements', (t) => {
  const ast = babylon.parse(`
      export {foo} from 'foo';

      export const bar = 1;
    `,
    {sourceType: 'module'}
  );

  t.deepEqual(
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

test('babylonAstDependencies should enable dependency source identifiers to be rewritten', (t) => {
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

  t.deepEqual(
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

  t.is(
    babelGenerator(ast, {comments: true}, input).code,
    expected
  );
});

test('should describe the specifiers produced in export statements', (t) => {
  const ast = babylon.parse(`
      export {foo, bar} from 'foo';
      export const woz = 1;
      const qux = 1;
      export default qux;
    `,
    {sourceType: 'module'}
  );

  t.deepEqual(
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

test('should produce errors if `require` calls contain variables', (t) => {
  const ast = babylon.parse(`
    const foo = 'foo';
    var bar = require(foo);
  `);

  const err = t.throws(() => babylonAstDependencies(ast));
  t.is(err.message, 'require(...) expression at line 3, column 22 cannot be statically analyzed');
});

test('should produce errors if `require` calls contain expressions', (t) => {
  const ast = babylon.parse(`
    const foo = 'foo';
    var bar = require('bar/' + foo);
  `);

  const err = t.throws(() => babylonAstDependencies(ast));
  t.is(err.message, 'require(...) expression at line 3, column 22 cannot be statically analyzed');
});

test('should produce errors with a `loc` property', (t) => {
  const ast = babylon.parse(`
    const foo = 'foo';
    var bar = require('bar/' + foo);
  `);

  try {
    babylonAstDependencies(ast);
  } catch(err) {
    t.deepEqual(
      err.loc,
      {
        line: 3,
        column: 22
      }
    );
    return;
  }
  throw new Error('Should not reach this point');
});