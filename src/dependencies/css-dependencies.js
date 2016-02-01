import postcss from 'postcss';
import {startsWith} from 'lodash/string';
import {getCachedData} from './cache-utils';
import {postcssAstDependencies} from '../postcss-ast-dependencies';

export function buildPostCssAst({name, text}) {
  let ast;
  try {
    ast = postcss.parse(text, {from: name});
  } catch(err) {
    return Promise.reject(err);
  }

  return Promise.resolve(ast);
}

export function getCachedStyleSheetImports({cache, key, getAst}) {
  function compute() {
    return getAst().then(ast => postcssAstDependencies(ast))
  }

  return getCachedData({cache, key, compute});
}