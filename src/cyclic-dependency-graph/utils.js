import {Map} from 'immutable';
import {addNode, addEdge} from './node';

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
export function createNodesFromNotation(text) {
  let nodes = Map();

  const lines = text
    .split('\n')
    // remove empty lines
    .map(line => line.trim())
    .filter(line => line);

  lines.forEach(line => {
    const names = line
      .split('->')
      .map(name => name.trim());

    // Create each node
    names.forEach(name => {
      if (!nodes.has(name)) {
        nodes = addNode(nodes, name);
      }
    });

    // Add edges
    for (let i=0; i<names.length - 1; i++) {
      nodes = addEdge(nodes, names[i], names[i + 1]);
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
 * @param {Array} entryNodes - an array of node names
 * @returns {Array}
 */
export function resolveExecutionOrder(nodes, entryNodes) {
  const seen = Object.create(null);
  const order = [];

  function traverseFromNode(node) {
    if (seen[node.name]) {
      return;
    }
    seen[node.name] = true;

    node.dependencies.forEach(name => {
      const dependency = nodes.get(name);
      traverseFromNode(dependency);
    });

    order.push(node.name);
  }

  entryNodes.forEach(name => {
    const node = nodes.get(name);
    traverseFromNode(node);
  });

  return order;
}