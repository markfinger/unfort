import {types, traverse} from 'babel-core';
import im from 'immutable';
import {filenameLogger} from './logger';

const log = filenameLogger(__filename);

export function extractDependenciesFromNode({node}) {
  log('Starting extraction of dependencies from node');

  const encountered = [];
  traverse(node, {
    ImportDeclaration: (node) => {
      const [error, dependency] = extractDependencyFromImportDeclaration({node});
      encountered.push({
        node, error, dependency
      });
    },
    CallExpression: (node) => {
      if (node.callee.name === 'require') {
        const [error, dependency] = extractDependencyFromRequireCallExpression({node});
        encountered.push({
          node, error, dependency
        });
      }
    }
  });

  log('Completed extraction of dependencies from node');

  return im.List(
    encountered.map(processEncounteredDependency)
  );
}

export function extractDependencyFromRequireCallExpression({node}) {
  if (node.arguments.length !== 1) {
    return ['Multi-arg require call encountered', null];
  }

  const dependency = node.arguments[0];

  if (!types.isLiteral(dependency)) {
    return [`Non-literal (${describeNodeType({dependency})}) require call encountered`, null];
  }

  return [null, dependency.value];
}

export function extractDependencyFromImportDeclaration({node}) {
  const dependency = node.source;

  if (types.isLiteral(dependency)) {
    return [null, dependency.value];
  } else {
    return [`Non-literal (${describeNodeType({dependency})}) import encountered`, null];
  }
}

export function processEncounteredDependency({node, error, dependency}) {
  return im.Map({
    error: error,
    dependency,
    node: describeNode({node})
  });
}

export function describeNode({node}) {
  return im.Map({
    type: describeNodeType({node}),
    location: describeNodeLocation({node})
  });
}

export function describeNodeLocation({node}) {
  if (!node || !node.loc) {
    return null;
  }

  return im.Map({
    start: im.Map(node.loc.start),
    end: im.Map(node.loc.end)
  });
}

export function describeNodeType({node}) {
  if (!node || !node.type) {
    return typeof node;
  }

  return node.type;
}

