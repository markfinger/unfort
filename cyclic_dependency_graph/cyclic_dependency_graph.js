"use strict";

const rx = require('rxjs');
const imm = require('immutable');
const {pull} = require('lodash/array');
const {addNode, addEdge, removeEdge, removeNode, findNodesDisconnectedFromEntryNodes} = require('./node');

class CyclicDependencyGraph {
  constructor(resolver, {initialState}={}) {
    this.resolver = resolver;
    this.entryPoints = imm.OrderedSet();

    this.start = new rx.Subject();
    this.complete = new rx.Subject();
    this.error = new rx.Subject();
    
    this.nodes = initialState || imm.Map();

    this._pendingJobs = [];
    this._hasSignalledStart = false;
    this._prunedNodes = new Set();
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
   */
  addEntryPoint(name) {
    this.entryPoints = this.entryPoints.add(name);
  }
  traceFromEntryPoints() {
    this.entryPoints.forEach(name => this.trace(name));
  }
  /**
   * Invoke the specified function and build the graph by recursively
   * traversing unknown nodes
   */
  trace(name) {
    const job = {
      name: name,
      isValid: true
    };

    this._invalidatePendingJobsForNode(name);
    this._pendingJobs.push(job);

    // Force an asynchronous start to the tracing so that other parts of a
    // codebase can synchronously trigger the job to be invalidated. This
    // helps to avoid any unnecessary work that may be invalidated by
    // pending IO
    setImmediate(() => {
      if (job.isValid) {
        this._traceJob(job);
      }
    });
  }
  /**
   * Removes a node and its edges from the graph. Any pending jobs for the
   * node will be invalidated.
   *
   * Be aware that pruning a single node may leave other nodes disconnected
   * from an entry node. You may want to call `pruneDisconnected` to
   * clean the graph of unwanted dependencies.
   */
  prune(name) {
    // If the node is still pending, invalidate the associated job so
    // that it becomes a no-op
    this._invalidatePendingJobsForNode(name);
    this._pruneNodes([name]);
    if (this.entryPoints.has(name)) {
      this.trace(name);
    }
  }
  _pruneNodes(toPrune) {
    this.nodes = this.nodes.withMutations(nodes => {
      for (const name of toPrune) {
        const node = nodes.get(name);
        if (node) {
          for (const dependent of node.dependents) {
            removeEdge(nodes, dependent, name);
          }
          for (const dependency of node.dependencies) {
            removeEdge(nodes, name, dependency);
          }
          removeNode(nodes, name);
          this._prunedNodes.add(name);
        }
      }
    });
  }
  /**
   * There are edge-cases where particular cyclic graphs may not have been
   * pruned completely, so we may still be persisting references to nodes
   * which are disconnected from the entry nodes.
   *
   * An easy example of a situation that can cause this is a tournament:
   * https://en.wikipedia.org/wiki/Tournament_(graph_theory)
   *
   * To get around this problem, we need to walk the graph from the entry
   * nodes, note any that are unreachable, and then prune them directly
   */
  pruneDisconnected() {
    const disconnected = findNodesDisconnectedFromEntryNodes(this.nodes, this.entryPoints);
    if (disconnected.length) {
      this._pruneNodes(disconnected);
    }
  }
  _traceJob(job) {
    const {name} = job;

    if (!this._hasSignalledStart) {
      this._hasSignalledStart = true;
      this.start.next(name);
    }

    Promise.resolve()
      .then(() => this.resolver(name))
      .then(dependencies => {
        // If this job has been invalidated, we can ignore anything that may
        // have resulted from it
        if (!job.isValid) {
          return;
        }

        // Indicate that this job is no longer blocking the `completed` stage
        pull(this._pendingJobs, job);

        const toTrace = [];
        const pendingNodesByName = Object.create(null);
        for (const job of this._pendingJobs) {
          pendingNodesByName[job.name] = job.isValid;
        }
        this.nodes = this.nodes.withMutations(nodes => {
          if (!nodes.has(name)) {
            addNode(nodes, name);
          }
          // Handle new nodes and edges
          for (const depName of dependencies) {
            if (!nodes.has(depName)) {
              if (!pendingNodesByName[name]) {
                toTrace.push(depName);
              }
              addNode(nodes, depName);
            }
            addEdge(nodes, name, depName);
          }
        });

        if (toTrace.length) {
          for (const name of toTrace) {
            this.trace(name);
          }
        } else if (!this._pendingJobs.length) {
          this._signalComplete();
        }
      })
      .catch(err => {
        // If the job has been invalidated, we ignore the error
        if (!job.isValid) {
          return;
        }

        const data = {
          error: err,
          name,
        };

        this.error.next(data);
      });
  }
  _signalComplete() {
    this.pruneDisconnected();

    const pruned = this._pruned;
    this._pruned = new Set();

    this._hasSignalledStart = false;

    this.complete.next({
      nodes: this.nodes,
      pruned: new imm.List(pruned)
    });
  }
  _invalidatePendingJobsForNode(name) {
    const pendingJobs = this._pendingJobs;
    this._pendingJobs = [];
    for (const job of pendingJobs) {
      if (job.name === name) {
        job.isValid = false;
      } else {
        this._pendingJobs.push(job);
      }
    }
  }
}

module.exports = {
  CyclicDependencyGraph
};