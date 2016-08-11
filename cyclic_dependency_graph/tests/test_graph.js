"use strict";

const imm = require('immutable');
const test = require('ava');
const {CyclicDependencyGraph} = require('../graph');
const {Node} = require('../node');
const {createNodesFromNotation} = require('../utils');

test.cb('.start should emit during the first trace call', (t) => {
  const graph = new CyclicDependencyGraph(() => Promise.resolve([]));
  graph.trace('test');
  graph.start.subscribe(name => {
    t.is(name, 'test');
    t.end();
  });
});

test.cb('.start should emit only once per run', (t) => {
  const graph = new CyclicDependencyGraph(() => Promise.resolve([]));

  graph.error.subscribe(obj => {
    throw obj.error;
  });

  let called = 0;
  graph.start.subscribe(() => {
    called++;
  });

  graph.trace('a');
  graph.trace('b');
  graph.trace('c');
  const subscription = graph.complete.subscribe(() => {
    subscription.unsubscribe();

    graph.trace('a');
    graph.trace('b');
    graph.trace('c');
    graph.complete.subscribe(() => {
      t.is(called, 2);
      t.end();
    });
  });
});

test.cb('.complete should emit once all tracing has completed', (t) => {
  const graph = new CyclicDependencyGraph(() => Promise.resolve([]));

  graph.addEntryPoint('test');
  graph.traceFromEntryPoints();

  graph.complete.subscribe(({nodes, pruned}) => {
    t.truthy(nodes instanceof imm.Map);
    t.truthy(nodes.has('test'));
    t.truthy(pruned instanceof imm.List);
    t.end();
  });
});

test.cb('.error should emit if the resolver rejects', (t) => {
  const graph = new CyclicDependencyGraph(() => Promise.reject('expected error'));

  graph.trace('test');

  graph.error.subscribe(({error, fileName}) => {
    t.is(error, 'expected error');
    t.is(fileName, 'test');
    t.end();
  });
});

test.cb('.error should emit if the resolver throws', (t) => {
  const graph = new CyclicDependencyGraph(() => {
    throw 'expected error';
  });

  graph.trace('test');

  graph.error.subscribe(({error, fileName}) => {
    t.is(error, 'expected error');
    t.is(fileName, 'test');
    t.end();
  });
});

test.cb('.trace should call the provided resolve function', (t) => {
  const graph = new CyclicDependencyGraph(name => {
    t.is(name, 'test');
    t.end();
  });

  graph.trace('test');
});

test('.trace should create pending jobs for the node', (t) => {
  const graph = new CyclicDependencyGraph(() => {});

  graph.trace('test');

  t.truthy(graph._pendingJobs[0] instanceof Object);
  t.is(graph._pendingJobs[0].name, 'test');
  t.truthy(graph._pendingJobs[0].isValid);
});

test.cb('.trace should signal once all the dependencies have been resolved', (t) => {
  const graph = new CyclicDependencyGraph(() => Promise.resolve([]));

  graph.complete.subscribe(() => {
    t.end();
  });

  graph.trace('test');
});

test.cb('.trace should populate the graph with the provided dependencies', (t) => {
  const graph = new CyclicDependencyGraph(resolver);

  graph.addEntryPoint('a');
  graph.traceFromEntryPoints();

  function resolver(file) {
    if (file === 'a') {
      return Promise.resolve(['b', 'c']);
    } else {
      return Promise.resolve([]);
    }
  }

  graph.complete.subscribe(({nodes}) => {
    t.truthy(nodes.has('a'));
    t.truthy(nodes.has('b'));
    t.truthy(nodes.has('c'));
    t.end();
  });
});

test('.trace should invalidate any pending jobs for the node', (t) => {
  const graph = new CyclicDependencyGraph(() => {});

  const job = {name: 'test', isValid: true};

  graph._pendingJobs.push(job);

  graph.trace('test');

  t.falsy(job.isValid);
});


test('.prune should remove nodes', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation('a')
  });

  t.true(graph.nodes.has('a'));
  graph.prune('a');
  t.false(graph.nodes.has('a'));
});

test('.prune should track removed nodes', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation('a')
  });
  graph.prune('a');
  t.deepEqual(Array.from(graph._prunedNodes), ['a']);
});

test('.prune should not prune dependencies without dependents', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation('a -> b')
  });
  graph.prune('a');
  t.deepEqual(Array.from(graph._prunedNodes), ['a']);
});

test('.prune should invalidate any pending jobs related to the pruned nodes', (t) => {
  const graph = new CyclicDependencyGraph();

  const job = {name: 'a', isValid: true};
  graph._pendingJobs.push(job);

  graph.prune('a');
  t.is(graph._pendingJobs.indexOf(job), -1);
  t.falsy(job.isValid);
});
  
test('.pruneDisconnected should prune all nodes that are not connected to an entry', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation(`
      a -> b
      c -> b
      d
    `)
  });
  graph.addEntryPoint('a');
  graph.pruneDisconnected();
  t.deepEqual(Array.from(graph._prunedNodes), ['c', 'd']);
});

test('.pruneDisconnected should prune all nodes if there is no entry', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation(`
      a -> b
      c -> b
      d
    `)
  });
  graph.pruneDisconnected();
  t.deepEqual(Array.from(graph._prunedNodes), ['a', 'b', 'c', 'd']);
});

test('.addEntryPoint should allow nodes to be denoted as entry nodes', (t) => {
  const graph = new CyclicDependencyGraph();
  graph.addEntryPoint('a');
  t.deepEqual(Array.from(graph.entryPoints), ['a']);
});

test('.pruneDisconnected should handle cyclic graphs 1', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation(`
      a -> b -> c -> b
    `)
  });
  graph.prune('a');
  graph.pruneDisconnected();
  t.truthy(
    imm.is(graph.nodes, imm.Map())
  );
});

test('.pruneDisconnected should handle cyclic graphs 2', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation(`
      a -> b -> c -> d -> b
    `)
  });
  graph.prune('a');
  graph.pruneDisconnected();
  t.truthy(
    imm.is(graph.nodes, imm.Map())
  );
});

test('.pruneDisconnected should handle cyclic graphs 3', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation(`
      a -> b -> c -> d -> b
      c -> b
    `)
  });
  graph.prune('a');
  graph.pruneDisconnected();
  t.truthy(
    imm.is(graph.nodes, imm.Map())
  );
});

test('.pruneDisconnected should handle cyclic graphs 4', (t) => {
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: createNodesFromNotation(`
      a -> b -> c -> d -> b
      c -> b
    `)
  });
  graph.addEntryPoint('a');
  graph.prune('b');
  graph.pruneDisconnected();
  t.truthy(
    imm.is(graph.nodes, imm.Map({a: Node({id: 'a'})}))
  );
});

test('.pruneDisconnected should successfully prune a graph representing a tournament', (t) => {
  // https://en.wikipedia.org/wiki/Tournament_(graph_theory)
  const tournament = createNodesFromNotation(`
    a -> b -> a 
    a -> c -> a
    a -> d -> a
    b -> c -> b
    b -> d -> b
    c -> d -> c
  `);
  const graph = new CyclicDependencyGraph(() => {}, {
    initialState: tournament
  });
  t.truthy(imm.is(graph.nodes, tournament));
  graph.addEntryPoint('a');
  graph.prune('a');
  graph.pruneDisconnected();
  t.truthy(
    imm.is(graph.nodes, imm.Map())
  );
});