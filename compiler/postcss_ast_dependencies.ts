import {parseValues as parseCssSelectorValues} from 'css-selector-tokenizer';

const URL_REGEX = /url\(/;

export function postcssAstDependencies(ast: any) {
  const identifiers = <string[]>[];

  function addDependency(source: string) {
    // Ensure that dependencies are only identified once
    identifiers.push(source);
  }

  ast.walkAtRules('import', (rule) => {
    const identifier = getDependencyIdentifierFromImportRule(rule);
    addDependency(identifier);
  });

  ast.walkDecls(decl => {
    const value = decl.value;
    if (URL_REGEX.test(value)) {
      const identifiers = getDependencyIdentifiersFromDeclarationValue(value);
      identifiers.forEach(addDependency);
    }
  });

  return {identifiers};
}

export function getDependencyIdentifiersFromDeclarationValue(value: string): string[] {
  const node = parseCssSelectorValues(value);
  const accum = [];

  findUrlsInNode(node, accum);

  return accum;
}

export function findUrlsInNode(node, accum: string[]) {
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

export function getDependencyIdentifierFromImportRule(rule): string {
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