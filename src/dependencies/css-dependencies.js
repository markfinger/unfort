import postcss from 'postcss';
import {startsWith} from 'lodash/string';
import {getCachedData} from './cache-utils';

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
    return getAst().then(ast => getDependencyIdentifiersFromStyleSheetAst(ast))
  }

  return getCachedData({cache, key, compute});
}

export function getDependencyIdentifiersFromStyleSheetAst(ast) {
  const dependencies = [];

  function addDependency(source) {
    // Ensure that dependencies are only identified once
    if (!dependencies.some(dep => dep.source === source)) {
      dependencies.push({source});
    }
  }

  function accumulateDependencyIdentifiers(rule) {
    const identifier = getDependencyIdentifierFromImportRule(rule);
    addDependency(identifier);
  }

  try {
    ast.walkAtRules('import', accumulateDependencyIdentifiers);
  } catch(err) {
    return Promise.reject(err);
  }

  return Promise.resolve(dependencies);
}

export function getDependencyIdentifierFromImportRule(rule) {
  const params = rule.params.trim();

  function throwMalformedImport() {
    throw rule.error('Malformed @import cannot resolve identifier');
  }

  if (
    !startsWith(params, 'url(') &&
    !startsWith(params, "'") &&
    !startsWith(params, '"')
  ) {
    throwMalformedImport();
  }

  let text;
  if (startsWith(params, 'url(')) {
    text = params.slice('url('.length);
  } else {
    text = params;
  }

  let closingToken;
  if (text[0] === "'") {
    closingToken = "'";
  } else if (text[0] === '"') {
    closingToken = '"';
  } else {
    throwMalformedImport();
  }

  const identifierWithTrailing = text.slice(1);
  const identifierEnd = identifierWithTrailing.indexOf(closingToken);
  const identifier = identifierWithTrailing.slice(0, identifierEnd);

  // Empty identifiers are a pain to debug
  if (identifier.trim() === '') {
    throwMalformedImport();
  }

  return identifier;
}