import {uniq} from 'lodash/array';
import {isObject} from 'lodash/lang';
import traverse from 'babel-traverse';
import * as types from 'babel-types';
import {cloneDeepOmitPrivateProps} from '../utils/clone';

export function generateBabelAstDependencyAnalyzerCacheKey(file) {
  return {
    key: file,
    namespace: __filename,
    packageDependencies: ['babel-traverse']
  }
}

export function createBabelAstDependencyAnalyzer() {
  return function babelAstDependencyAnalyzer(options, pipeline, cb) {
    const {ast, file} = options;
    const {cache} = pipeline;

    if (!isString(file)) {
      return cb(new Error(`A \`file\` option must be provided`))
    }

    // TODO: add `file` type check as well

    const cacheKey = generateBabelAstDependencyAnalyzerCacheKey(file);

    cache.get(cacheKey, (err, cachedDeps) => {
      if (err) return cb(err);

      if (isObject(cachedDeps)) {
        return cb(null, cachedDeps);
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
        return cb(new Error(errors.join('\n\n')));
      }

      // Ensure that dependencies are only identified once
      const uniqueDependencies = uniq(dependencies);

      cache.set(cacheKey, uniqueDependencies, (err) => {
        if (err) return cb(err);

        cb(null, uniqueDependencies);
      });
    });
  };
}
