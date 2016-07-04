const {Record, OrderedSet} = require('immutable');

const Node = Record({
  id: '',
  dependencies: OrderedSet(),
  dependents: OrderedSet(),
  isEntryNode: false
});

module.exports = {
  Node,
  addNode,
  removeNode,
  addEdge,
  removeEdge,
  defineEntryNode,
  findNodesDisconnectedFromEntryNodes,
  pruneNodeAndUniqueDependencies
};

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

function defineEntryNode(nodes, id) {
  const node = nodes.get(id);

  if (!node) {
    throw new Error(`Cannot define entry node "${id}" as it does not exist`);
  }

  return nodes.set(id, node.set('isEntryNode', true));
}

/**
 * Given a Map containing nodes, returns an array of node ids
 * where each node is disconnected from the defined entry nodes
 *
 * @param {Map} nodes
 * @returns {Array}
 */
function findNodesDisconnectedFromEntryNodes(nodes) {
  const entries = nodes.filter(node => node.isEntryNode);

  const disconnected = Object.create(null);
  nodes.keySeq().forEach(id => {
    disconnected[id] = true;
  });

  function checkFromNode(node) {
    disconnected[node.id] = false;

    node.dependencies.forEach(id => {
      if (disconnected[id]) {
        checkFromNode(nodes.get(id));
      }
    });
  }

  entries.forEach(checkFromNode);

  const keys = Object.keys(disconnected);
  return keys.filter(id => disconnected[id]);
}

function pruneNodeAndUniqueDependencies(nodes, id) {
  const node = nodes.get(id);

  if (!node) {
    throw new Error(`Cannot prune from node "${id}" as it has not been defined`);
  }

  const pruned = [id];

  if (node.dependents.size > 0) {
    node.dependents.forEach(dependentName => {
      nodes = removeEdge(nodes, dependentName, id);
    });
  }

  if (node.dependencies.size > 0) {
    node.dependencies.forEach(dependencyName => {
      nodes = removeEdge(nodes, id, dependencyName);
      const dependency = nodes.get(dependencyName);

      if (
        dependency.dependents.size === 0 &&
        !dependency.isEntryNode
      ) {
        const data = pruneNodeAndUniqueDependencies(nodes, dependencyName);
        pruned.push.apply(pruned, data.pruned);
        nodes = data.nodes;
      }
    });
  }

  if (nodes.has(id)) {
    nodes = removeNode(nodes, id);
  }

  return {
    nodes,
    pruned
  };
}