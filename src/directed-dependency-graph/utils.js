import {clone} from 'lodash/lang';
import {forOwn} from 'lodash/object';
import {pull} from 'lodash/array';
import {contains} from 'lodash/collection';

export function addNode(nodes, name) {
  const node = nodes[name];

  if (node) {
    throw new Error(`Node "${name}" already exists`);
  }

  nodes[name] = {
    dependencies: [],
    dependents: []
  };
}

export function removeNode(nodes, name) {
  const node = nodes[name];

  if (!node) {
    throw new Error(`Node "${name}" does not exist`);
  }

  nodes[name] = undefined;
}

export function addEdge(nodes, head, tail) {
  const headNode = nodes[head];
  const tailNode = nodes[tail];

  if (!headNode) {
    throw new Error(`Cannot add edge from "${head}" -> "${tail}" as "${head}" has not been defined`);
  }
  if (!tailNode) {
    throw new Error(`Cannot add edge from "${head}" -> "${tail}" as "${tail}" has not been defined`);
  }

  const dependencies = headNode.dependencies;
  if (!contains(dependencies, tail)) {
    dependencies.push(tail);
  }

  const dependents = tailNode.dependents;
  if (!contains(dependents, head)) {
    dependents.push(head);
  }
}

export function removeEdge(nodes, head, tail) {
  const headNode = nodes[head];
  const tailNode = nodes[tail];

  if (!headNode) {
    throw new Error(`Cannot remove edge from "${head}" -> "${tail}" as "${head}" has not been defined`);
  }
  if (!tailNode) {
    throw new Error(`Cannot remove edge from "${head}" -> "${tail}" as "${tail}" has not been defined`);
  }

  pull(headNode.dependencies, tail);
  pull(tailNode.dependents, head);
}

export function getNodesWithoutPredecessors(nodes) {
  const nodesWithoutPredecessors = [];

  forOwn(nodes, (node, name) => {
    if (node && node.dependents.length === 0) {
      nodesWithoutPredecessors.push(name);
    }
  });

  return nodesWithoutPredecessors;
}

export function pruneFromNode(nodes, name, ignore=[]) {
  const node = nodes[name];
  let nodesPruned = [name];

  if (node.dependents.length) {
    // Clone the array to avoid mutations during iteration
    const dependents = clone(node.dependents);
    dependents.forEach(dependentName => {
      removeEdge(nodes, dependentName, name);
    });
  }

  if (node.dependencies.length) {
    // Clone the array to avoid mutations during iteration
    const dependencies = clone(node.dependencies);
    dependencies.forEach(dependencyName => {
      removeEdge(nodes, name, dependencyName);

      if (
        nodes[dependencyName].dependents.length == 0 &&
        ignore.indexOf(dependencyName) === -1
      ) {
        const dependencyNodesPruned = pruneFromNode(nodes, dependencyName, ignore);
        nodesPruned.push.apply(nodesPruned, dependencyNodesPruned);
      }
    });
  }

  removeNode(nodes, name);

  return nodesPruned;
}
