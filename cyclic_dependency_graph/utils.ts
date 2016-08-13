import {Map as ImmutableMap, Set as ImmutableSet} from 'immutable';
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
 */
export function createNodesFromNotation(text: string): any {
  let nodes = ImmutableMap();

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

export function objectToGraph(obj: any): any {
  let map = {};
  for (const key of Object.keys(obj)) {
    const data = obj[key];
    map[key] = ImmutableMap({
      id: data.id,
      dependencies: ImmutableSet(data.dependencies || []),
      dependents: ImmutableSet(data.dependents || [])
    });
  }
  return ImmutableMap(map);
}