dependency-tracer
=================

Tracer
------

**TODO**


Graph utils
-----------

Tools for operating on a directed graph that represents dependencies in a system.


### Example

```javascript
// Given...
//
//  a -> b
//  a -> c
//  b -> c
//  d -> c
//  d -> e

import {graph} from 'dependency-tracer';

const nodes = Object.create(null);

graph.addNode(nodes, 'a');
graph.addNode(nodes, 'b');
graph.addNode(nodes, 'c');
graph.addNode(nodes, 'd');
graph.addNode(nodes, 'e');

graph.addEdge(nodes, 'a', 'b');
graph.addEdge(nodes, 'a', 'c');
graph.addEdge(nodes, 'b', 'c');
graph.addEdge(nodes, 'd', 'c');
graph.addEdge(nodes, 'd', 'e');

graph.getNodesWithoutPredecessors(nodes);
// ['a', 'd']

Object.keys(nodes);
// ['a', 'b', 'c', 'd', 'e']

graph.pruneFromNode(nodes, 'd');
// ['d', 'e']

graph.getNodesWithoutPredecessors(nodes);
// ['a']

Object.keys(nodes).filter(name => nodes[name]);
// ['a', 'b', 'c']
```


### API

```javascript
import {graph} from 'dependency-tracer';

graph.addNode(nodes, 'node name');
graph.removeNode(nodes, 'node name');

graph.addEdge(nodes, 'head node', 'tail node');
graph.removeEdge(nodes, 'head node', 'tail node');

// Returns an array
graph.getNodesWithoutPredecessors(nodes);

// Removes a node, removes the edges with its predecessors, and then recursively
// removes all successor nodes that do not have other predecessors.
//
// Accepts an optional third argument, a list of node names that will not be removed
// during the recursive check over its predecessors
//
// Returns an array containing the names of all nodes that were removed.
graph.pruneFromNode(nodes, 'node name');
```


### Caveats

When nodes are removed from the `nodes` object, it actually just sets their key
to `undefined`. This is to avoid the overhead associated with using the `delete`
keyword in v8 (it makes subsequent iteration and property name lookups much slower).

If you want to traverse over a graph that has had nodes removed, use an identity
filter that references the key's value on the `nodes` object. Eg:

```javascript
// returns all nodes that have been added
Object.keys(nodes);

// returns only the nodes that have not been removed
Object.keys(nodes).filter(name => nodes[name]);
```