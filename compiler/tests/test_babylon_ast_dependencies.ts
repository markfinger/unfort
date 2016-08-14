import test from 'ava';
import * as babylon from 'babylon';
import {babylonAstDependencies} from '../babylon_ast_dependencies';

test('should accept an AST and provide a list of identifiers specified in `require` calls', (t) => {
  const ast = babylon.parse(`
    var foo = require("foo");
    const bar = require('bar');
    foo(bar);
  `);

  const outcome = babylonAstDependencies(ast);
  t.deepEqual(
    outcome.identifiers,
    ['foo', 'bar']
  );
});

test('should not pull identifiers from `require` calls that are properties of an object', (t) => {
  const ast = babylon.parse(`
    const foo = {require: function() {}};
    var bar = foo.require('bar');
  `);

  t.deepEqual(babylonAstDependencies(ast).identifiers, []);
});

test('should pull dependencies from es module imports', (t) => {
  const ast = babylon.parse(
    `
      import foo from "foo";
      import {bar, woz} from "bar";
      import qux, {dux} from "qux";
    `,
    {sourceType: 'module'}
  );

  t.deepEqual(
    babylonAstDependencies(ast).identifiers,
    ['foo', 'bar', 'qux']
  );
});

test('should only indicate each dependency once', (t) => {
  const ast = babylon.parse(
    `
      import foo1 from "foo";
      import foo2 from "foo";
      const foo3 = require('foo');
      const foo4 = require('foo');
    `,
    {sourceType: 'module'}
  );

  t.deepEqual(
    babylonAstDependencies(ast).identifiers,
    ['foo']
  );
});

test('should identify dependencies in export ... from \'...\' statements', (t) => {
  const ast = babylon.parse(`
      export {foo} from 'foo';
    `,
    {sourceType: 'module'}
  );

  t.deepEqual(
    babylonAstDependencies(ast).identifiers,
    ['foo']
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

  const err = t.throws(() => babylonAstDependencies(ast));
  t.deepEqual(
    err.loc,
    {
      line: 3,
      column: 22
    }
  );
});