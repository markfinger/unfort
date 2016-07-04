const EventEmitter = require('events');
const {Map} = require('immutable');
const {isArray} = require('lodash/lang');
const {pull} = require('lodash/array');
const {
  addNode, addEdge, removeEdge, removeNode, defineEntryNode,
  findNodesDisconnectedFromEntryNodes, pruneNodeAndUniqueDependencies
} = require('./node');
const {Diff} = require('./diff');

module.exports = {
  createGraph,
  isNodeDefined,
  isNodePending,
  invalidatePendingJobsForNode
};

// TODO: remove
function callOnceAfterTick(fn) {
  var latestCallId;
  return function callOnceAfterTickInner() {
    var callId = {};
    latestCallId = callId;

    process.nextTick(function() {
      if (latestCallId !== callId) {
        return;
      }

      fn();
    });
  };
}

function createGraph({state=Map(), getDependencies}={}) {
  const events = new EventEmitter;
  const pendingJobs = [];
  let previousCompleteState = state;
  let errors = [];
  let hasSignalledStart = false;

  /**
   * Enable multiple call sites to enqueue a `completed` check that
   * will occur asynchronously. Our events are emitted synchronously,
   * so executing this check asynchronously enables code to respond to
   * state changes by enqueueing more jobs before the `completed` signal
   * is emitted
   *
   * @type {Function}
   */
  const signalIfCompleted = callOnceAfterTick(
    function signalIfCompleted() {
      if (pendingJobs.length) {
        return;
      }

      const signal = {
        diff: Diff({
          from: previousCompleteState,
          to: state
        }),
        errors
      };

      errors = [];
      previousCompleteState = state;
      hasSignalledStart = false;

      events.emit('completed', signal);
    }
  );

  /**
   * Invoke the specified `getDependencies` function and build the
   * graph by recursively traversing unknown nodes
   *
   * @param {String} name
   */
  function traceFromNode(name) {
    const job = {
      node: name,
      isValid: true
    };

    invalidatePendingJobsForNode(pendingJobs, name);

    // Ensure the job can be tracked
    pendingJobs.push(job);

    // Force an asynchronous start to the tracing so that other parts of a
    // codebase can synchronously trigger the job to be invalidated. This
    // helps to avoid any unnecessary work that may no longer be relevant
    process.nextTick(startTracingNode);

    if (!hasSignalledStart) {
      hasSignalledStart = true;
      events.emit('started', {state: state});
    }

    function startTracingNode() {
      // Handle situations where a job may have been invalidated further
      // down the stack from where the original call originated from
      if (!job.isValid) {
        return;
      }

      getDependencies(name)
        .then(handleDependencies)
        .catch(handleError)
        .then(signalIfCompleted);

      function handleDependencies(dependencies) {
        // If this job has been invalidated, we can ignore anything that may
        // have resulted from it
        if (!job.isValid) {
          return;
        }

        // Indicate that this job is no longer blocking the `completed` stage
        pull(pendingJobs, job);

        // Sanity check
        if (!isArray(dependencies)) {
          return Promise.reject(
            new Error(`Dependencies should be specified in an array. Received ${dependencies}`)
          );
        }

        const previousState = state;

        if (!isNodeDefined(state, name)) {
          state = addNode(state, name);
        }

        // If there are any dependencies encountered that we don't already
        // know about, we start tracing them
        dependencies.forEach(depName => {
          if (
            !isNodeDefined(state, depName) &&
            !isNodePending(pendingJobs, depName)
          ) {
            traceFromNode(depName);
          }

          if (!isNodeDefined(state, depName)) {
            state = addNode(state, depName);
          }

          state = addEdge(state, name, depName);
        });

        // Enable progress updates
        events.emit('traced', {
          node: name,
          diff: Diff({
            from: previousState,
            to: state
          })
        });
      }

      function handleError(err) {
        // Indicate that this job is no longer blocking the `completed` stage
        pull(pendingJobs, job);

        // If the job has been invalidated, we ignore the error
        if (!job.isValid) {
          return;
        }

        const signal = {
          error: err,
          node: name,
          state: state
        };

        errors.push(signal);
        events.emit('error', signal);
      }
    }
  }

  /**
   * Removes a node and its edges from the graph. Any pending jobs for the
   * node will be invalidated.
   *
   * Be aware that pruning a single node may leave other nodes disconnected
   * from an entry node. You may want to call `pruneDisconnectedNodes` to
   * clean the graph of unwanted dependencies.
   *
   * @param {String} name
   * @returns {Diff}
   */
  function pruneNode(name) {
    const previousState = state;

    // If the node is still pending, invalidate the associated job so
    // that it becomes a no-op
    if (isNodePending(pendingJobs, name)) {
      invalidatePendingJobsForNode(pendingJobs, name);
    }

    if (isNodeDefined(state, name)) {
      let updatedState = previousState;

      const node = updatedState.get(name);

      node.dependents.forEach(dependent => {
        updatedState = removeEdge(updatedState, dependent, name);
      });

      node.dependencies.forEach(dependency => {
        updatedState = removeEdge(updatedState, name, dependency);
      });

      updatedState = removeNode(updatedState, name);

      state = updatedState;
    }

    signalIfCompleted();

    return Diff({
      from: previousState,
      to: state
    });
  }

  /**
   * There are edge-cases where particular circular graphs may not have
   * been pruned completely, so we may still be persisting references to
   * nodes which are disconnected to the entry nodes.
   *
   * An easy example of a situation that can cause this is a tournament.
   * https://en.wikipedia.org/wiki/Tournament_(graph_theory)
   *
   * To get around this problem, we need to walk the graph from the entry
   * nodes, note any that are unreachable, and then prune them directly
   *
   * @returns {Diff}
   */
  function pruneDisconnectedNodes() {
    const previousState = state;

    const disconnected = findNodesDisconnectedFromEntryNodes(state);

    let updatedState = previousState;
    disconnected.forEach(name => {
      if (updatedState.has(name)) {
        const data = pruneNodeAndUniqueDependencies(updatedState, name);
        updatedState = data.nodes;
      }
    });
    state = updatedState;

    return Diff({
      from: previousState,
      to: state
    });
  }

  /**
   * Dependency graphs emerge from one or more entry nodes. The ability to
   * distinguish an entry node from a normal dependency node allows us to
   * aggressively prune a node and all of its dependencies.
   *
   * As a basic example of why the concept is important, if `a -> b -> c`
   * and we want to prune `b`, we know that we can safely prune `c` as well.
   *
   * But if `a -> b -> c -> a` and we want to prune `b`, then we need to know
   * that `a` is an entry node, so that we don't traverse the cyclic graph
   * and prune every node.
   *
   * This concept becomes increasingly important once we start dealing with
   * more complicated cyclic graphs, as pruning can result in disconnected
   * sub-graphs. For example, if we have `a -> b -> c -> d -> b` and we want
   * to prune `a`, we can't safely prune `b -> c -> d -> b` as well, as `b`
   * has a dependent `d`. However, if we don't prune them, then they are
   * left disconnected from the other nodes.
   *
   * Hence we need to know a graph's entry points so that we can traverse it
   * from the entries and find the nodes which are disconnected
   *
   * @param {String} name
   * @returns {Diff}
   */
  function setNodeAsEntry(name) {
    const previousState = state;

    if (!isNodeDefined(state, name)) {
      state = addNode(state, name);
    }

    state = defineEntryNode(state, name);

    return Diff({
      from: previousState,
      to: state
    });
  }

  /**
   * Returns the current state of the graph
   *
   * @returns {Map}
   */
  function getState() {
    return state;
  }

  return {
    pendingJobs,
    events,
    getState,
    setNodeAsEntry,
    traceFromNode,
    pruneNode,
    pruneDisconnectedNodes
  };
}

function isNodeDefined(nodes, name) {
  return nodes.has(name);
}

function isNodePending(pendingJobs, name) {
  return pendingJobs.some(job => job.node === name);
}

function invalidatePendingJobsForNode(pendingJobs, name) {
  pendingJobs
    .filter(job => job.node === name)
    .forEach(job => {
      job.isValid = false;
      pull(pendingJobs, job);
    });
}