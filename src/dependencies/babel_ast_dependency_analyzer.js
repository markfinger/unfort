import {uniq} from 'lodash/array';
import {isObject} from 'lodash/lang';
import traverse from 'babel-traverse';
import * as types from 'babel-types';
import {cloneDeepOmitPrivateProps} from '../utils/clone';

export function createBabelAstDependencyAnalyzer() {
  return function babelAstDependencyAnalyzer(options, pipeline, cb) {
    const {ast} = options;

    if (!isObject(ast)) {
      return cb(new Error(`An \`ast\` option must be provided: ${JSON.stringify(options)}`))
    }

    const dependencies = [];
    const errors = [];

    // Ensure that any mutations to the traversed AST are not applied
    // to the provided AST
    const clonedAst = cloneDeepOmitPrivateProps(ast);

    traverse(clonedAst, {
      ImportDeclaration(node) {
        dependencies.push(node.node.source.value);
      },
      CallExpression(node) {
        const callNode = node.node;
        if (callNode.callee.name === 'require') {
          const arg = callNode.arguments[0];
          if (types.isLiteral(arg)) {
            dependencies.push(arg.value);
          } else {
            let err = `Non-literal (${arg.type}) passed to \`require\` call`;
            if (arg.loc && arg.loc.start) {
              err += ` at line ${arg.loc.start.line}, column ${arg.loc.start.column}`
            }
            errors.push(err);
          }
        }
      }
    });

    if (errors.length) {
      const err = new Error(errors.join('\n\n'));
      return cb(err);
    }

    // Ensure that dependencies are only identified once
    const uniqueDependencies = uniq(dependencies);
    cb(null, uniqueDependencies);
  };
}
