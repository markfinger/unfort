"use strict";

const imm = require('immutable');

const Node = imm.Record({
  id: '',
  dependencies: imm.Set(),
  dependents: imm.Set()
});

function addNode(nodes, id) {
  const node = nodes.get(id);

  if (node) {
    throw new Error(`Node "${id}" already exists`);
  }

  return nodes.set(id, Node({
    id
  }));
}

function removeNode(nodes, id) {
  const node = nodes.get(id);

  if (!node) {
    throw new Error(`Node "${id}" does not exist`);
  }

  return nodes.delete(id);
}

function addEdge(nodes, head, tail) {
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

function removeEdge(nodes, head, tail) {
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

/**
 * Given a Map containing nodes, returns an array of node ids
 * where each node is disconnected from the defined entry nodes
 */
function findNodesDisconnectedFromEntryNodes(nodes, entryPoints) {
  const entries = [];
  for (const id of entryPoints) {
    const node = nodes.get(id);
    if (node) {
      entries.push(node);
    }
  }
  const encountered = Object.create(null);

  function checkFromNode(node) {
    encountered[node.id] = true;
    for (const id of node.dependencies) {
      if (!encountered[id]) {
        checkFromNode(nodes.get(id));
      }
    }
  }

  entries.forEach(checkFromNode);

  const disconnected = [];
  for (const id of nodes.keySeq()) {
    if (!encountered[id]) {
      disconnected.push(id);
    }
  }
  return disconnected;
}

module.exports = {
  Node,
  addNode,
  removeNode,
  addEdge,
  removeEdge,
  findNodesDisconnectedFromEntryNodes
};