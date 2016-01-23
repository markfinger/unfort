import {clone} from 'lodash/lang';
import {forOwn} from 'lodash/object';
import {pull} from 'lodash/array';
import {contains} from 'lodash/collection';
import {Record, List, Set} from 'immutable';

export const Node = Record({
  name: '',
  dependencies: Set(),
  dependents: Set()
});

export function addNode(nodes, name) {
  const node = nodes.get(name);

  if (node) {
    throw new Error(`Node "${name}" already exists`);
  }

  return nodes.set(name, Node({
    name
  }));
}

export function removeNode(nodes, name) {
  const node = nodes.get(name);

  if (!node) {
    throw new Error(`Node "${name}" does not exist`);
  }

  return nodes.delete(name);
}

export function addEdge(nodes, head, tail) {
  if (head === tail) {
    throw new Error(
      `Edges must point to two different nodes. Cannot add an edge from "${head}" to itself`
    );
  }

  const headNode = nodes.get(head);
  const tailNode = nodes.get(tail);

  if (!headNode) {
    throw new Error(`Cannot add edge from "${head}" -> "${tail}" as "${head}" has not been defined`);
  }
  if (!tailNode) {
    throw new Error(`Cannot add edge from "${head}" -> "${tail}" as "${tail}" has not been defined`);
  }

  nodes = nodes.set(
    head,
    headNode.set(
      'dependencies',
      headNode.dependencies.add(tail)
    )
  );

  nodes = nodes.set(
    tail,
    tailNode.set(
      'dependents',
      tailNode.dependents.add(head)
    )
  );

  return nodes;
}

export function removeEdge(nodes, head, tail) {
  const headNode = nodes.get(head);
  const tailNode = nodes.get(tail);

  if (!headNode) {
    throw new Error(`Cannot remove edge from "${head}" -> "${tail}" as "${head}" has not been defined`);
  }
  if (!tailNode) {
    throw new Error(`Cannot remove edge from "${head}" -> "${tail}" as "${tail}" has not been defined`);
  }

  nodes = nodes.set(
    head,
    headNode.set(
      'dependencies',
      headNode.dependencies.remove(tail)
    )
  );

  nodes = nodes.set(
    tail,
    tailNode.set(
      'dependents',
      tailNode.dependents.remove(head)
    )
  );

  return nodes;
}

export function pruneFromNode(nodes, name, ignore=[]) {
  const node = nodes.get(name);

  if (!node) {
    throw new Error(`Cannot prune from node "${name}" as it has not been defined`);
  }

  const pruned = [name];

  if (node.dependents.size > 0) {
    node.dependents.forEach(dependentName => {
      nodes = removeEdge(nodes, dependentName, name);
    });
  }

  if (node.dependencies.size > 0) {
    node.dependencies.forEach(dependencyName => {
      nodes = removeEdge(nodes, name, dependencyName);
      const dependency = nodes.get(dependencyName);

      if (
        dependency.dependents.size === 0 &&
        !contains(ignore, dependencyName)
      ) {
        const data = pruneFromNode(nodes, dependencyName, ignore);
        pruned.push.apply(pruned, data.pruned);
        nodes = data.nodes;
      }
    });
  }

  if (nodes.has(name)) {
    nodes = removeNode(nodes, name);
  }

  return {
    nodes,
    pruned
  };
}
