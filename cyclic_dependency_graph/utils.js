"use strict";

const imm = require('immutable');
const {addNode, addEdge} = require('./node');

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
  let nodes = imm.Map();

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

module.exports = {
  createNodesFromNotation
};