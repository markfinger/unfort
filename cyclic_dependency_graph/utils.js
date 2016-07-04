const {Map} = require('immutable');
const {addNode, addEdge} = require('./node');

module.exports = {
  createNodesFromNotation,
  resolveExecutionOrder
};

/**
 * Constructs a map of nodes from a variant of DOT notation.
 *
 * For example, given
 * ```
 *   a -> b -> c -> d
 *   b -> d -> e
 *   c -> e
 *   c -> f -> g -> d
 * ```
 * A map will be returned which represents the nodes and their edges.
 *
 * @param {String} text
 * @returns {Map} an immutable.Map instance
 */
function createNodesFromNotation(text) {
  let nodes = Map();

  const lines = text
    .split('\n')
    // remove empty lines
    .map(line => line.trim())
    .filter(line => line);

  lines.forEach(line => {
    const ids = line
      .split('->')
      .map(id => id.trim());

    // Create each node
    ids.forEach(id => {
      if (!nodes.has(id)) {
        nodes = addNode(nodes, id);
      }
    });

    // Add edges
    for (let i=0; i<ids.length - 1; i++) {
      nodes = addEdge(nodes, ids[i], ids[i + 1]);
    }
  });

  return nodes;
}

/**
 * Performs a depth first traversal and returns a list of nodes
 * in the order that they should be executed.
 *
 * Given `a -> b -> c`, the order will be ['c', 'b', 'a']
 *
 * Note: cyclic dependencies are ignored. For example,
 * given `a -> b -> a`, the order will be ['b', 'a']
 *
 * @param {Map} nodes - an immutable.Map instance
 * @param {Array} entryNodes - an array of node ids
 * @returns {Array}
 */
function resolveExecutionOrder(nodes, entryNodes) {
  const seen = Object.create(null);
  const order = [];

  function traverseFromNode(node) {
    if (seen[node.id]) {
      return;
    }
    seen[node.id] = true;

    node.dependencies.forEach(id => {
      const dependency = nodes.get(id);
      traverseFromNode(dependency);
    });

    order.push(node.id);
  }

  entryNodes.forEach(id => {
    const node = nodes.get(id);
    traverseFromNode(node);
  });

  return order;
}