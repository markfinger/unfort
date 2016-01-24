import EventEmitter from 'events';
import {Map} from 'immutable';
import {isArray} from 'lodash/lang';
import {pull, unique} from 'lodash/array';
import {contains} from 'lodash/collection';
import {callOnceAfterTick} from '../utils/call-once-after-tick';
import {
  addNode, addEdge, defineEntryNode, findNodesDisconnectedFromEntryNodes, pruneNodeAndUniqueDependencies
} from './node';

export function createGraph({nodes=Map(), getDependencies}={}) {
  const events = new EventEmitter;
  const pendingJobs = [];
  let previousState = nodes;
  let errors = [];
  let hasSignalledStart = false;

  // Enable multiple call sites to enqueue a 'complete' check that
  // will occur asynchronously. Our events are emitted synchronously,
  // so executing this check asynchronously enables code to respond to
  // state changes by enqueueing more jobs before the 'complete' signal
  // is emitted
  const signalIfCompleted = callOnceAfterTick(
    function signalIfCompleted() {
      const hasPendingJobs = pendingJobs.some(job => job.isActive);
      if (hasPendingJobs) {
        return;
      }

      const signal = {
        state: nodes,
        previousState: previousState,
        errors
      };

      errors = [];
      previousState = nodes;
      hasSignalledStart = false;

      events.emit('complete', signal);
    }
  );

  function traceNode(name) {
    const job = {
      node: name,
      isValid: true
    };

    // Invalidate any currently pending jobs for the same node
    pendingJobs.forEach(job => {
      if (job.node === name) {
        job.isValid = false;
      }
    });

    // Ensure the job can be tracked elsewhere
    pendingJobs.push(job);

    // Force an asynchronous start to the tracing so that other parts of a
    // codebase can synchronously trigger the job to be invalidated. This
    // helps to avoid any unnecessary work that may no longer be relevant
    process.nextTick(startTracingNode);

    if (!hasSignalledStart) {
      hasSignalledStart = true;
      events.emit('started', {state: nodes, node: name});
    }

    function startTracingNode() {
      if (!job.isValid) {
        pull(pendingJobs, job);
        return;
      }

      getDependencies(name, (err, dependencies) => {
        // Indicate that this job is no longer blocking the `complete` stage
        pull(pendingJobs, job);

        // If this job has been invalidated, we can ignore anything that may
        // have resulted from it
        if (!job.isValid) {
          return;
        }

        if (err) {
          const signal = {
            error: err,
            node: name,
            state: nodes
          };
          errors.push(signal);
          events.emit('error', signal);
          return signalIfCompleted();
        }

        // Sanity check
        if (!isArray(dependencies)) {
          throw new Error(`Dependencies should be specified in an array. Received ${dependencies}`);
        }

        const previousState = nodes;

        if (!isNodeDefined(nodes, name)) {
          nodes = addNode(nodes, name);
        }

        // If there are any dependencies encountered that we don't already
        // know about, we start tracing them
        dependencies.forEach(depName => {
          if (
            !isNodeDefined(nodes, depName) &&
            !isNodePending(pendingJobs, depName)
          ) {
            traceNode(depName);
          }

          if (!isNodeDefined(nodes, depName)) {
            nodes = addNode(nodes, depName);
          }

          nodes = addEdge(nodes, name, depName);
        });

        // Enable progress updates
        events.emit('traced', {
          node: name,
          state: nodes,
          previousState
        });

        signalIfCompleted();
      });
    }
  }

  return {
    pendingJobs,
    events,
    getNodes() {
      return nodes;
    },
    traceNode,
    setNodeAsEntry(name) {
      // Dependency graphs emerge from one or more entry nodes. The ability to
      // distinguish an entry node from a normal dependency node allows us to
      // aggressively prune a node and all of its dependencies.
      //
      // As a basic example of why the concept is important, if `a -> b -> c`
      // and we want to prune `b`, we know that we can safely prune `c` as well.
      //
      // But if `a -> b -> c -> a` and we want to prune `b`, then we need to know
      // that `a` is an entry node, so that we don't traverse the cyclic graph
      // and prune every node.
      //
      // This concept becomes increasingly important once we start dealing with
      // more complicated cyclic graphs, as pruning can result in disconnected
      // sub-graphs. For example, if we have `a -> b -> c -> d -> b` and we want
      // to prune `a`, we can't safely prune `b -> c -> d -> b` as well, as `b`
      // has a dependent `d`. However, if we don't prune them, then they are
      // left disconnected from the other nodes.
      //
      // Our solution to the problem is to prune all dependencies which are no
      // longer needed, then walk the graph from the entries and look for
      // sub-graphs which we can't reach. Once we've identified these, we know
      // we can safely prune them.
      //
      // In summary, always denote the entry nodes before pruning

      nodes = defineEntryNode(nodes, name);
    },
    pruneFromNode(name) {
      const isDefined = isNodeDefined(nodes, name);
      const isPending = isNodePending(pendingJobs, name);

      // If we don't know about the node and there are no pending jobs,
      // then there's nothing to do
      if (!isDefined && !isPending) {
        return;
      }

      // If the node is still pending, we just invalidate the associated
      // job so that it becomes a no-op
      if (isPending && !isDefined) {
        invalidatePendingJobsForNode(pendingJobs, name);
        return signalIfCompleted();
      }

      // We prune the node from the graph, then walk through its dependencies
      // and try to prune any that aren't depended on by other nodes
      let {
        nodes: updatedNodes,
        pruned
      } = pruneNodeAndUniqueDependencies(nodes, name);

      // There are edge-cases where particular circular graphs may not have
      // been pruned completely at this point, so we may still be persisting
      // references to nodes which are disconnected to the entry nodes.
      //
      // An easy example of a situation that would cause this is a tournament.
      // https://en.wikipedia.org/wiki/Tournament_(graph_theory)
      //
      // To get around this problem, we need to walk the graph from the entry
      // nodes, find any that are unreachable, and then prune them directly
      const disconnectedNodes = findNodesDisconnectedFromEntryNodes(updatedNodes);
      disconnectedNodes.forEach(name => {
        if (isNodeDefined(updatedNodes, name)) {
          const data = pruneNodeAndUniqueDependencies(updatedNodes, name);
          updatedNodes = data.nodes;
          pruned.push.apply(pruned, data.pruned);
        }
      });

      // If a node's associated data is invalid and we're pruning it, it is
      // more than likely that any pending jobs are equally invalid
      pruned.forEach(name => {
        invalidatePendingJobsForNode(pendingJobs, name)
      });

      const previousState = nodes;
      nodes = updatedNodes;

      // If a node has been invalidated, it's possible that a dependent may
      // also need to be invalidated if its state depends the dependencies.
      // So, we also indicate the nodes that are likely to impacted by the
      // pruning
      let nodesImpacted = [];
      pruned.forEach(name => {
        const prunedNode = previousState.get(name);
        prunedNode.dependents.forEach(dependentName => {
          if (nodes.has(dependentName)) {
            nodesImpacted.push(dependentName);
          }
        });
      });
      // The iteration over `pruned` can produce duplicate node names
      nodesImpacted = unique(nodesImpacted);

      const signal = {
        state: nodes,
        previousState,
        pruned,
        nodesImpacted
      };

      events.emit('pruned', signal);

      signalIfCompleted();
    },
    hasNodeCompleted(name) {
      return isNodeDefined(nodes, name);
    }
  };
}

export function isNodeDefined(nodes, name) {
  return nodes.has(name);
}

export function isNodePending(pendingJobs, name) {
  return pendingJobs.some(job => {
    return job.isValid && job.node === name;
  });
}

function invalidatePendingJobsForNode(pendingJobs, name) {
  pendingJobs
    .filter(job => job.node === name)
    .forEach(job => job.isValid = false);
}