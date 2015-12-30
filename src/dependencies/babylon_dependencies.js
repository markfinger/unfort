import traverse from 'babel-traverse';
import * as types from 'babel-types';
import {uniq} from 'lodash/array';
import {cloneDeepOmitPrivateProps} from '../utils/clone';

export function discoverDependenciesInBabylonAst(ast, cb) {
  const dependencies = [];
  const errors = [];

  // Ensure that any mutations to the AST during traversal do not persist
  // beyond this function
  ast = cloneDeepOmitPrivateProps(ast);

  traverse(ast, {
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
}
