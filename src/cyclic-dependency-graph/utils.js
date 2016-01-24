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
        nodes = addNode(nodes, name)
      }
    });

    // Add edges
    for (let i=0; i<names.length - 1; i++) {
      nodes = addEdge(nodes, names[i], names[i + 1])
    }
  });

  return nodes;
}