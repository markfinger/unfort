import EventEmitter from 'events';
import {Map} from 'immutable';
import {pull, remove} from 'lodash/array';
import {contains} from 'lodash/collection';
import {callOnceAfterTick} from '../utils/call-once-after-tick';
import {addNode, addEdge, pruneFromNode} from './node';

/*
Events
------

started <nodes>
traced => <node name>
error => err, <node name>
complete <nodes>
pruned => <nodes removed>, <nodes impacted>

*/

/*
 we need a notion of 'jobs', to enable async
 invalidation and resolution.

 `pending` should be a list of objects where
 each object takes the form:

   {
     node: '...',
     isValid: true
   }

 if a node is ever invalidated while a job is pending,
 the `isValid` property should be set to false, so that
 when that job completes, it will discard its results
 */

/*
 Handle node change while tracing:
 given dependents [a, b, ...] -> c

 if c changes during dep resolution:
  when c's dep resolution has completed:
    if c's job is still active:
      update graph
    else:
      discard results
 */

/*
 Handle node change:
 given dependents [a, b, ...] -> c

 when c changes:
  deps = []
  for dependent of c:
    deps += getDeps(dependent)
  rebuildGraph(deps)
 */

/*
 When pruning, we'll need a notion of entry points,
 so that we can safely prune the tree without
 removing required nodes.

 Also need to take into consideration that `trace`
 may be called by iteration functions which provide
 index values of an object. Should make sure that
 defining an entry point is an explicit process
 */

export function createGraph({nodes=Map(), getDependencies}={}) {
  const permanentNodes = [];
  const events = new EventEmitter;
  const pendingJobs = [];

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

      events.emit('complete');
    }
  );

  function traceNode(node) {
    const job = {
      node,
      isValid: true
    };

    // TODO: invalidate any pending jobs for the node
    pendingJobs.push(job);

    process.nextTick(startTracingNode);

    function removeJob() {
      pull(pendingJobs, job);
    }

    function startTracingNode() {
      // Allow jobs to be cancelled synchronously
      if (!job.isValid) {
        return removeJob();
      }

      getDependencies(node, (err, dependencies) => {
        removeJob();

        if (err) {
          return events.emit('error', err, node);
        }

        // Allow jobs to be cancelled asynchronously
        if (!job.isValid) {
          return;
        }

        const nodesAdded = [];

        if (!isNodeDefined(nodes, node)) {
          nodes = addNode(nodes, node);
          nodesAdded.push(node);
        }

        dependencies.forEach(depName => {
          if (
            !isNodeDefined(nodes, depName) &&
            !isNodePending(pendingJobs, depName)
          ) {
            traceNode(depName);
          }

          if (!isNodeDefined(nodes, depName)) {
            nodes = addNode(nodes, depName);
            nodesAdded.push(depName);
          }

          nodes = addEdge(nodes, node, depName);
        });

        nodesAdded.forEach(node => {
          events.emit('added', node);
        });

        signalIfCompleted();
      });
    }
  }

  function _pruneNode(node) {
    pendingJobs
      .filter(job => job.node === node)
      .forEach(job => job.isValid = false);

    events.emit('pruned', node);

    signalIfCompleted();
  }

  function pruneNode(name, debug) {
    if (isNodeDefined(nodes, name)) {
      const data = pruneFromNode(nodes, name, permanentNodes);

      data.pruned.forEach(_pruneNode);
      nodes = data.nodes;
    } else if (isNodePending(pendingJobs, name)) {
      _pruneNode(name);
    }
  }

  return {
    permanentNodes,
    pendingJobs,
    events,
    getNodes() {
      return nodes;
    },
    traceNode,
    setNodeAsPermanent(node) {
      return ensureNodeIsPermanent(permanentNodes, node);
    },
    pruneNode,
    isNodeDefined(node) { // TODO: rename to `hasCompletedNode`
      return isNodeDefined(nodes, node);
    }
  };
}

export function ensureNodeIsPermanent(permanentNodes, node) {
  if (!contains(permanentNodes, node)) {
    permanentNodes.push(node);
  }
}

export function isNodeDefined(nodes, node) {
  return nodes.has(node);
}

export function isNodePending(pendingJobs, node) {
  return pendingJobs.some(job => job.isValid && job.node === node);
}
