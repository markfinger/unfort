import {isObject} from 'lodash/lang';
import traverse from 'babel-traverse';
import * as types from 'babel-types';

export function babylonAstDependencies(ast) {
  if (!isObject(ast)) {
    throw new Error(`An \`ast\` must be provided`);
  }

  const dependencies = [];
  const errors = [];

  function addDependency(source) {
    // Ensure that dependencies are only identified once
    if (!dependencies.some(dep => dep.source === source)) {
      dependencies.push({source});
    }
  }

  traverse(ast, {
    // `import ... from '...';
    ImportDeclaration(node) {
      addDependency(node.node.source.value);
    },
    // `export ... from '...';
    ExportDeclaration(node) {
      if (node.node.source) {
        addDependency(node.node.source.value);
      }
    },
    // `require('...');
    CallExpression(node) {
      const callNode = node.node;
      if (callNode.callee.name === 'require') {
        const arg = callNode.arguments[0];
        if (types.isLiteral(arg)) {
          addDependency(arg.value);
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

  return dependencies;
}
