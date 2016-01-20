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
    successors: [],
    predecessors: []
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
    throw new Error(`Node "${head}" does not exist`);
  }
  if (!tailNode) {
    throw new Error(`Node "${tail}" does not exist`);
  }

  const successors = headNode.successors;
  if (!contains(successors, tail)) {
    successors.push(tail);
  }

  const predecessors = tailNode.predecessors;
  if (!contains(predecessors, head)) {
    predecessors.push(head);
  }
}

export function removeEdge(nodes, head, tail) {
  const headNode = nodes[head];
  const tailNode = nodes[tail];

  if (!headNode) {
    throw new Error(`Node "${head}" does not exist`);
  }
  if (!tailNode) {
    throw new Error(`Node "${tail}" does not exist`);
  }

  pull(headNode.successors, tail);
  pull(tailNode.predecessors, head);
}

export function getNodesWithoutPredecessors(nodes) {
  const nodesWithoutPredecessors = [];

  forOwn(nodes, (node, name) => {
    if (node && node.predecessors.length === 0) {
      nodesWithoutPredecessors.push(name);
    }
  });

  return nodesWithoutPredecessors;
}

export function pruneFromNode(nodes, name, ignore=[]) {
  const node = nodes[name];
  let nodesPruned = [name];

  if (node.predecessors.length) {
    // Clone the array to avoid mutations during iteration
    const predecessors = clone(node.predecessors);
    predecessors.forEach(predecessorName => {
      removeEdge(nodes, predecessorName, name);
    });
  }

  if (node.successors.length) {
    // Clone the array to avoid mutations during iteration
    const successors = clone(node.successors);
    successors.forEach(successorName => {
      removeEdge(nodes, name, successorName);

      if (
        nodes[successorName].predecessors.length == 0 &&
        ignore.indexOf(successorName) === -1
      ) {
        const successorNodesPruned = pruneFromNode(nodes, successorName, ignore);
        nodesPruned.push.apply(nodesPruned, successorNodesPruned);
      }
    });
  }

  removeNode(nodes, name);

  return nodesPruned;
}
