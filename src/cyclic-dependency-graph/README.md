cyclic-dependency-graph
=======================

A simple state machine that handles building a cyclic directed graph from
the dependencies in a codebase.



Example usage
-------------

```js
import {createGraph} from 'cyclic-dependency-graph';

const graph = createGraph({
  getDependencies(node, cb) {
    console.log(`Dependencies requested for ${node}`);

    // Get the dependencies for the node
    // ...

    // Provide an array of other nodes are depended upon
    cb(null, ['/path/to/dependency', '...']);
  }
});

// The files that we want to enter the graph from
const entryPoint1 = '/path/to/file_1';
const entryPoint2 = '/path/to/file_2';

// Inform the graph that it should treat these files as entry points
graph.setNodeAsEntry(entryPoint1);
graph.setNodeAsEntry(entryPoint2);

// Start the process of building the graph
graph.traceFromNode(entryPoint1);
graph.traceFromNode(entryPoint2);

graph.events.on('error', ({error, node}) => {
  console.error(
    `Error when tracing ${node}: ${error.message}\n\n${error.stack}`
  );
});

graph.events.on('complete', ({diff, errors}) => {
  if (errors.length) {
    return console.error('Errors during tracing!');
  }

  const nodeNames = diff.to.keySeq().toArray();

  console.log(`Traced ${nodeNames.length} nodes:\n ${nodeNames.join('\n ')}`);
});
```


Data structures
---------------

### Graph state

Stored as a flat `Map` structure (using the Map implementation from `immutable`).

A map structure was used primarily for simplicity and the low costs associated with
node lookup and traversal.


### Node

```js
{
  name: '...',
  dependencies: Set(),
  dependents: Set()
  isEntryNode: Bool()
}
```


### Diff

```js
{
  from: Map(),
  to: Map()
}
```


Events
------

### started

```js
{
  state: Map()
}
```

### complete

```js
{
  errors: [
    Error(),
    // ...
  ],
  diff: Diff()
}
```

### traced

```js
{
  node: '...',
  diff: Diff()
}
```

### error

```js
{
  node: '...',
  error: Error(),
  diff: Diff()
}
```