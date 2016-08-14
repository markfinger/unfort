"use strict";
const ava_1 = require('ava');
const babylon = require('babylon');
const babylon_ast_dependencies_1 = require('../babylon_ast_dependencies');
ava_1.default('should accept an AST and provide a list of identifiers specified in `require` calls', (t) => {
    const ast = babylon.parse(`
    var foo = require("foo");
    const bar = require('bar');
    foo(bar);
  `);
    const outcome = babylon_ast_dependencies_1.babylonAstDependencies(ast);
    t.deepEqual(outcome.identifiers, ['foo', 'bar']);
});
ava_1.default('should not pull identifiers from `require` calls that are properties of an object', (t) => {
    const ast = babylon.parse(`
    const foo = {require: function() {}};
    var bar = foo.require('bar');
  `);
    t.deepEqual(babylon_ast_dependencies_1.babylonAstDependencies(ast).identifiers, []);
});
ava_1.default('should pull dependencies from es module imports', (t) => {
    const ast = babylon.parse(`
      import foo from "foo";
      import {bar, woz} from "bar";
      import qux, {dux} from "qux";
    `, { sourceType: 'module' });
    t.deepEqual(babylon_ast_dependencies_1.babylonAstDependencies(ast).identifiers, ['foo', 'bar', 'qux']);
});
ava_1.default('should only indicate each dependency once', (t) => {
    const ast = babylon.parse(`
      import foo1 from "foo";
      import foo2 from "foo";
      const foo3 = require('foo');
      const foo4 = require('foo');
    `, { sourceType: 'module' });
    t.deepEqual(babylon_ast_dependencies_1.babylonAstDependencies(ast).identifiers, ['foo']);
});
ava_1.default('should identify dependencies in export ... from \'...\' statements', (t) => {
    const ast = babylon.parse(`
      export {foo} from 'foo';
    `, { sourceType: 'module' });
    t.deepEqual(babylon_ast_dependencies_1.babylonAstDependencies(ast).identifiers, ['foo']);
});
ava_1.default('should produce errors if `require` calls contain variables', (t) => {
    const ast = babylon.parse(`
    const foo = 'foo';
    var bar = require(foo);
  `);
    const err = t.throws(() => babylon_ast_dependencies_1.babylonAstDependencies(ast));
    t.is(err.message, 'require(...) expression at line 3, column 22 cannot be statically analyzed');
});
ava_1.default('should produce errors if `require` calls contain expressions', (t) => {
    const ast = babylon.parse(`
    const foo = 'foo';
    var bar = require('bar/' + foo);
  `);
    const err = t.throws(() => babylon_ast_dependencies_1.babylonAstDependencies(ast));
    t.is(err.message, 'require(...) expression at line 3, column 22 cannot be statically analyzed');
});
ava_1.default('should produce errors with a `loc` property', (t) => {
    const ast = babylon.parse(`
    const foo = 'foo';
    var bar = require('bar/' + foo);
  `);
    const err = t.throws(() => babylon_ast_dependencies_1.babylonAstDependencies(ast));
    t.deepEqual(err.loc, {
        line: 3,
        column: 22
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9iYWJ5bG9uX2FzdF9kZXBlbmRlbmNpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0ZXN0X2JhYnlsb25fYXN0X2RlcGVuZGVuY2llcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsc0JBQWlCLEtBQUssQ0FBQyxDQUFBO0FBQ3ZCLE1BQVksT0FBTyxXQUFNLFNBQVMsQ0FBQyxDQUFBO0FBQ25DLDJDQUFxQyw2QkFBNkIsQ0FBQyxDQUFBO0FBRW5FLGFBQUksQ0FBQyxxRkFBcUYsRUFBRSxDQUFDLENBQUM7SUFDNUYsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQzs7OztHQUl6QixDQUFDLENBQUM7SUFFSCxNQUFNLE9BQU8sR0FBRyxpREFBc0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1QyxDQUFDLENBQUMsU0FBUyxDQUNULE9BQU8sQ0FBQyxXQUFXLEVBQ25CLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUNmLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyxtRkFBbUYsRUFBRSxDQUFDLENBQUM7SUFDMUYsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQzs7O0dBR3pCLENBQUMsQ0FBQztJQUVILENBQUMsQ0FBQyxTQUFTLENBQUMsaURBQXNCLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQzNELENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBSSxDQUFDLGlEQUFpRCxFQUFFLENBQUMsQ0FBQztJQUN4RCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUN2Qjs7OztLQUlDLEVBQ0QsRUFBQyxVQUFVLEVBQUUsUUFBUSxFQUFDLENBQ3ZCLENBQUM7SUFFRixDQUFDLENBQUMsU0FBUyxDQUNULGlEQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFDdkMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUN0QixDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMsMkNBQTJDLEVBQUUsQ0FBQyxDQUFDO0lBQ2xELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQ3ZCOzs7OztLQUtDLEVBQ0QsRUFBQyxVQUFVLEVBQUUsUUFBUSxFQUFDLENBQ3ZCLENBQUM7SUFFRixDQUFDLENBQUMsU0FBUyxDQUNULGlEQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFDdkMsQ0FBQyxLQUFLLENBQUMsQ0FDUixDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMsb0VBQW9FLEVBQUUsQ0FBQyxDQUFDO0lBQzNFLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7O0tBRXZCLEVBQ0QsRUFBQyxVQUFVLEVBQUUsUUFBUSxFQUFDLENBQ3ZCLENBQUM7SUFFRixDQUFDLENBQUMsU0FBUyxDQUNULGlEQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFDdkMsQ0FBQyxLQUFLLENBQUMsQ0FDUixDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMsNERBQTRELEVBQUUsQ0FBQyxDQUFDO0lBQ25FLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7OztHQUd6QixDQUFDLENBQUM7SUFFSCxNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0saURBQXNCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN4RCxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsNEVBQTRFLENBQUMsQ0FBQztBQUNsRyxDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyw4REFBOEQsRUFBRSxDQUFDLENBQUM7SUFDckUsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQzs7O0dBR3pCLENBQUMsQ0FBQztJQUVILE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxpREFBc0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3hELENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSw0RUFBNEUsQ0FBQyxDQUFDO0FBQ2xHLENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBSSxDQUFDLDZDQUE2QyxFQUFFLENBQUMsQ0FBQztJQUNwRCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDOzs7R0FHekIsQ0FBQyxDQUFDO0lBRUgsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLGlEQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDeEQsQ0FBQyxDQUFDLFNBQVMsQ0FDVCxHQUFHLENBQUMsR0FBRyxFQUNQO1FBQ0UsSUFBSSxFQUFFLENBQUM7UUFDUCxNQUFNLEVBQUUsRUFBRTtLQUNYLENBQ0YsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=