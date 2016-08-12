"use strict";

const cssSelectorTokenizer = require('css-selector-tokenizer');

const URL_REGEX = /url\(/;

function postcssAstDependencies(ast) {
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

  ast.walkAtRules('import', accumulateDependencyIdentifiers);

  ast.walkDecls(decl => {
    const value = decl.value;
    if (URL_REGEX.test(value)) {
      const identifiers = getDependencyIdentifiersFromDeclarationValue(value);
      identifiers.forEach(addDependency);
    }
  });

  return dependencies;
}

function getDependencyIdentifiersFromDeclarationValue(string) {
  const node = cssSelectorTokenizer.parseValues(string);
  const accum = [];

  findUrlsInNode(node, accum);

  return accum;
}

function findUrlsInNode(node, accum) {
  if (node.type === 'url') {
    return accum.push(node.url);
  }

  if (node.nodes) {
    for (const child of node.nodes) {
      findUrlsInNode(child, accum);
    }
  }
}

function throwMalformedImport(rule) {
  throw rule.error('Malformed @import cannot resolve identifier');
}

function getDependencyIdentifierFromImportRule(rule) {
  const params = rule.params.trim();

  if (
    !params.startsWith('url(') &&
    params[0] !== '\'' &&
    params[0] !== '"'
  ) {
    throwMalformedImport(rule);
  }

  let text;
  if (params.startsWith('url(')) {
    text = params.slice('url('.length);
  } else {
    text = params;
  }

  let closingToken;
  if (text[0] === '\'') {
    closingToken = '\'';
  } else if (text[0] === '"') {
    closingToken = '"';
  } else {
    throwMalformedImport(rule);
  }

  const identifierWithTrailing = text.slice(1);
  const identifierEnd = identifierWithTrailing.indexOf(closingToken);
  const identifier = identifierWithTrailing.slice(0, identifierEnd);

  // Empty identifiers are a pain to debug
  if (identifier.trim() === '') {
    throwMalformedImport(rule);
  }

  return identifier;
}

module.exports = {
  postcssAstDependencies,
  getDependencyIdentifiersFromDeclarationValue,
  getDependencyIdentifierFromImportRule
};