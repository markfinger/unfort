cyclic-dependency-graph
=======================

A state machine that handles creating, manipulating, and responding to a cyclic
directed graph that represents the dependencies in a codebase.

- Handles circular dependencies in files
- Exposes as event system so that it can operate as the core of a build system
- Exposes a pruning functionality designed to invalidate large sections of a graph


Example usage
-------------

```js
import {createGraph} from 'cyclic-dependency-graph';

// Initialize the graph
const graph = createGraph({
  getDependencies(node, cb) {
    console.log(`Dependencies requested for ${node}`);

    // Provide a list of files that the node depends on
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

// Hook in a file watcher which tells us when to prune nodes
fileWatcher.on('change', file => {
  // Prune `file` and any dependencies which are no longer needed
  graph.pruneFromNode(file);
});

// Once a node has been traced, ensure that the watcher is observing it
graph.events.on('traced', ({node}) => {
  if (!fileWatcher.isWatching(node)) {
    fileWatcher.watch(node);
  }
});

// If the watcher ever invalidates a file, we should invalidate any associated data
graph.events.on('pruned', ({pruned, impactedNodes}) => {
  pruned.forEach(node => {
    // ...
  });

  // These nodes are the dependents of the pruned nodes, so it's
  // quite likely that we'll need to rebuild them again
  impactedNodes.forEach(node => {
    graph.traceFromNode(node);
  });
});

graph.events.on('started', () => {
  console.log('Started tracing');
});

graph.events.on('error', ({error, node}) => {
  console.error(
    `Error when tracing ${node}: ${error.message}\n\n${error.stack}`
  );
});

graph.events.on('complete', ({state, errors}) => {
  if (errors.length) {
    return console.error('Errors during tracing!');
  }

  const nodeNames = state.keySeq().toArray();

  console.log(`Traced ${nodeNames.length} nodes...`);
  console.log('\n\n' + nodeNames.join('\n'));
});
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
  state: Map(),
  previousState: Map(),
  errors: [
    Error(),
    // ...
  ]
}
```

### traced

```js
{
  state: Map(),
  previousState: Map(),
  node: '...'
}
```

### error

```js
{
  error: Map(),
  state: Map(),
  node: '...'
}
```

### pruned

```js
{
  pruned: [
    '<node name>',
    // ...
  ],
  nodesImpacted: [
    '<node name>',
    // ...
  ],
  state: Map(),
  previousState: Map(),
}
```