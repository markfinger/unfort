import EventEmitter from 'events';
import {pull} from 'lodash/array';
import {contains} from 'lodash/collection';
import {addNode, addEdge, pruneFromNode, removeEdge, removeNode} from './graph';

/*
Events
------

start
complete

added [node]
removed [node]
error [err, node]

tracing [node]
traced [node]

*/

/*
 we need a notion of 'jobs', to enable async
 invalidation and resolution.

 `pending` should be a list of objects where
 each object takes the form:
 {
 file: '...',
 isValid: true
 }

 if a file is ever invalidated while a job is pending,
 the `isValid` property should be set to false, so that
 when that job completes, it will discard its results
 */

/*
 Handle file change while tracing:
 given predecessors [a, b, ...] -> c

 if c changes during dep resolution:
 when c's dep resolution has completed:
 if c's job is still active:
 update graph
 else:
 discard results
 */

/*
 Handle file change:
 given predecessors [a, b, ...] -> c

 when c changes:
 deps = []
 for predecessor of c:
 deps += getDeps(predecessor)
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

export function createGraph({getDependencies}) {
  const nodes = Object.create(null);
  const permanentNodes = [];
  const events = new EventEmitter;
  const pendingJobs = [];

  return {
    nodes,
    permanentNodes,
    pendingJobs,
    events,
    traceNode(node) {
      const job = {
        node,
        isActive: true
      };

      pendingJobs.push(job);

      process.nextTick(startTracingNode);

      function removeJob() {
        pull(pendingJobs, job);
      }

      function startTracingNode() {
        // Allow jobs to be cancelled synchronously
        if (!job.isActive) {
          return removeJob();
        }

        getDependencies(file, (err, dependencies) => {
          removeJob();

          if (err) {
            return events.emit('error', err, file);
          }

          // Allow jobs to be cancelled asynchronously
          if (!job.isActive) {
            return;
          }

          const nodesAdded = [];

          if (!nodes[node]) {
            addNode(nodes, node);
            nodesAdded.push(node);
          }

          dependencies.forEach(depNode => {
            if (!nodes[depNode]) {
              addNode(nodes, depNode);
              nodesAdded.push(depNode);
            }
            
            addEdge(nodes, node, depNode);
          });

          nodesAdded.forEach(() => events.emit('added', node));
        });
      }
    },
    setNodeAsPermanent(node) {
      if (!contains(permanentNodes, node)) {
        permanentNodes.push(node);
      }
    },
    isGraphComplete() {
      return pendingJobs.length === 0;
    },
    invalidateNode(node) {
      const prunedNodes = pruneFromNode(nodes, node, permanentNodes);

      prunedNodes.forEach(node => {
        pendingJobs
          .filter(job => job.node === node)
          .forEach(job => job.isActive = false);

        events.emit('removed', node);
      });
    }
  };
}
