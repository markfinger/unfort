import postcss from 'postcss';
import {startsWith} from 'lodash/string';
import {getCachedData} from './cache-utils';

export function buildPostCssAst({name, text}, cb) {
  let ast;
  try {
    ast = postcss.parse(text, {from: name});
  } catch(err) {
    return cb(err);
  }

  cb(null, ast);
}

export function getCachedStyleSheetImports({cache, key, getAst}, cb) {
  function compute(cb) {
    getAst((err, ast) => {
      if (err) return cb(err);

      getDependencyIdentifiersFromStyleSheetAst(ast, cb);
    });
  }

  getCachedData({cache, key, compute}, cb);
}

export function getDependencyIdentifiersFromStyleSheetAst(ast, cb) {
  const identifiers = [];

  function accumulateDependencyIdentifiers(rule) {
    const identifer = getDependencyIdentifierFromImportRule(rule);
    identifiers.push(identifer);
  }

  try {
    ast.walkAtRules('import', accumulateDependencyIdentifiers);
  } catch(err) {
    return cb(err);
  }

  cb(null, identifiers);
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