import {forOwn} from 'lodash/object';
import {without} from 'lodash/array';

//export function createDirectedDependencyGraph() {
//  const nodes = Object.create(null);
//
//  return {
//    nodes,
//    addNode: (name) => addNode(nodes, name),
//    removeNode: (name) => removeNode(nodes, name),
//    addEdge: (head, tail) => addEdge(nodes, head, tail),
//    removeEdge: (head, tail) => removeEdge(nodes, head, tail),
//    getNodesWithoutPredecessors: () => getNodesWithoutPredecessors(nodes)
//  }
//}

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
  if (successors.indexOf(tail) === -1) {
    successors.push(tail);
  }

  const predecessors = tailNode.predecessors;
  if (predecessors.indexOf(head) === -1) {
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

  const successors = headNode.successors;
  const successorIndex = successors.indexOf(tail);
  if (successorIndex!== -1) {
    successors.splice(successorIndex, 1);
  }

  const predecessors = tailNode.predecessors;
  const predecessorIndex = predecessors.indexOf(head);
  if (predecessorIndex!== -1) {
    predecessors.splice(predecessorIndex, 1);
  }
}

export function getNodesWithoutPredecessors(nodes) {
  const nodesWithoutPredecessors = [];

  forOwn(nodes, (node, name) => {
    if (node.predecessors.length === 0) {
      nodesWithoutPredecessors.push(name);
    }
  });

  return nodesWithoutPredecessors;
}

export function pruneFromNode(nodes, name, ignore=[]) {
  const node = nodes[name];
  let nodesPruned = [name];

  if (node.predecessors.length) {
    const predecessors = node.predecessors.splice(0);
    predecessors.forEach(predecessorName => {
      removeEdge(nodes, predecessorName, name);
    });
  }

  if (node.successors.length) {
    const successors = node.successors.splice(0);
    successors.forEach(successorName => {
      removeEdge(nodes, name, successorName);

      if (
        nodes[successorName].predecessors.length == 0 &&
        ignore.indexOf(successorName) === -1
      ) {
        const successorNodesPruned = pruneFromNode(nodes, successorName, ignore);
        nodesPruned = nodesPruned.concat(successorNodesPruned);
      }
    });
  }

  removeNode(nodes, name);

  return nodesPruned;
}
