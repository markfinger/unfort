import {startsWith} from 'lodash/string';
import * as cssSelectorTokenizer from 'css-selector-tokenizer';

export const urlRegex = /url\(/g;

export function postcssAstDependencies(ast) {
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

  ast.walkDecls(decl => {
    const value = decl.value;
    if (value.match(urlRegex)) {
      const identifiers = getDependencyIdentifiersFromDeclarationValue(value);
      identifiers.forEach(addDependency);
    }
  });

  return Promise.resolve(dependencies);
}

export function getDependencyIdentifiersFromDeclarationValue(string) {
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
    const len = node.nodes.length;
    for (let i=0; i<len; i++) {
      findUrlsInNode(node.nodes[i], accum);
    }
  }
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