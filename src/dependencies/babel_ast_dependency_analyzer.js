import {uniq} from 'lodash/array';
import {isObject, isString} from 'lodash/lang';
import traverse from 'babel-traverse';
import * as types from 'babel-types';

export function analyzeBabelAstDependencies(ast) {
  if (!isObject(ast)) {
    throw new Error(`An \`ast\` option must be provided`);
  }

  const dependencies = [];
  const errors = [];

  traverse(ast, {
    // `import ... from '...';
    ImportDeclaration(node) {
      dependencies.push(node.node.source.value);
    },
    // `export ... from '...';
    ExportDeclaration(node) {
      if (node.node.source) {
        dependencies.push(node.node.source.value);
      }
    },
    // `require('...');
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
    throw new Error(errors.join('\n\n'));
  }

  // Ensure that dependencies are only identified once
  return uniq(dependencies);
}
