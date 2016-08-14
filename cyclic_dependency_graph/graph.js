"use strict";
const bluebird_1 = require('bluebird');
const rxjs_1 = require('rxjs');
const imm = require('immutable');
const lodash_1 = require('lodash');
const node_1 = require('./node');
class CyclicDependencyGraph {
    constructor(resolver, options) {
        this.start = new rxjs_1.Subject();
        this.complete = new rxjs_1.Subject();
        this.error = new rxjs_1.Subject();
        this.nodes = imm.Map();
        this.entryPoints = imm.OrderedSet();
        this._pendingJobs = [];
        this._hasSignalledStart = false;
        this._prunedNodes = new Set();
        this.resolver = resolver;
        if (options && options.initialState) {
            this.nodes = (options && options.initialState);
        }
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
        const job = new Job(name);
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
                    for (const dependent of node.get('dependents')) {
                        node_1.removeEdge(nodes, dependent, name);
                    }
                    for (const dependency of node.get('dependencies')) {
                        node_1.removeEdge(nodes, name, dependency);
                    }
                    node_1.removeNode(nodes, name);
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
        const disconnected = node_1.findNodesDisconnectedFromEntryNodes(this.nodes, this.entryPoints);
        if (disconnected.length) {
            this._pruneNodes(disconnected);
        }
    }
    _traceJob(job) {
        const { name } = job;
        if (!this._hasSignalledStart) {
            this._hasSignalledStart = true;
            this.start.next(name);
        }
        bluebird_1.Promise.resolve()
            .then(() => this.resolver(name))
            .then(dependencies => {
            // If this job has been invalidated, we can ignore anything that may
            // have resulted from it
            if (!job.isValid) {
                return;
            }
            // Indicate that this job is no longer blocking the `completed` stage
            lodash_1.pull(this._pendingJobs, job);
            if (!dependencies) {
                return bluebird_1.Promise.reject(new Error(`Failed to return a truthy value for dependencies. Received: ${dependencies}`));
            }
            const toTrace = [];
            const pendingNodesByName = Object.create(null);
            for (const job of this._pendingJobs) {
                pendingNodesByName[job.name] = job.isValid;
            }
            this.nodes = this.nodes.withMutations(nodes => {
                if (!nodes.has(name)) {
                    node_1.addNode(nodes, name);
                }
                // Handle new nodes and edges
                for (const depName of dependencies) {
                    if (!nodes.has(depName)) {
                        if (!pendingNodesByName[name]) {
                            toTrace.push(depName);
                        }
                        node_1.addNode(nodes, depName);
                    }
                    node_1.addEdge(nodes, name, depName);
                }
            });
            if (toTrace.length) {
                for (const name of toTrace) {
                    this.trace(name);
                }
            }
            else if (!this._pendingJobs.length) {
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
                fileName: name,
            };
            this.error.next(data);
        });
    }
    _signalComplete() {
        this.pruneDisconnected();
        const payload = {
            nodes: this.nodes,
            pruned: imm.List(Array.from(this._prunedNodes))
        };
        this._hasSignalledStart = false;
        this._prunedNodes.clear();
        this.complete.next(payload);
    }
    _invalidatePendingJobsForNode(name) {
        const pendingJobs = this._pendingJobs;
        this._pendingJobs = [];
        for (const job of pendingJobs) {
            if (job.name === name) {
                job.isValid = false;
            }
            else {
                this._pendingJobs.push(job);
            }
        }
    }
}
exports.CyclicDependencyGraph = CyclicDependencyGraph;
class Job {
    constructor(name) {
        this.isValid = true;
        this.name = name;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJncmFwaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsMkJBQXdCLFVBQVUsQ0FBQyxDQUFBO0FBQ25DLHVCQUF3QixNQUFNLENBQUMsQ0FBQTtBQUMvQixNQUFZLEdBQUcsV0FBTSxXQUFXLENBQUMsQ0FBQTtBQUNqQyx5QkFBcUIsUUFBUSxDQUFDLENBQUE7QUFFOUIsdUJBQThGLFFBQVEsQ0FBQyxDQUFBO0FBV3ZHO0lBVUUsWUFBWSxRQUFrQixFQUFFLE9BQThCO1FBUjlELFVBQUssR0FBRyxJQUFJLGNBQU8sRUFBVSxDQUFDO1FBQzlCLGFBQVEsR0FBRyxJQUFJLGNBQU8sRUFBZSxDQUFDO1FBQ3RDLFVBQUssR0FBRyxJQUFJLGNBQU8sRUFBZSxDQUFDO1FBQ25DLFVBQUssR0FBVSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekIsZ0JBQVcsR0FBRyxHQUFHLENBQUMsVUFBVSxFQUFVLENBQUM7UUFDdkMsaUJBQVksR0FBVSxFQUFFLENBQUM7UUFDekIsdUJBQWtCLEdBQUcsS0FBSyxDQUFDO1FBQzNCLGlCQUFZLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUUvQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNILENBQUM7SUFDRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BcUJHO0lBQ0gsYUFBYSxDQUFDLElBQVk7UUFDeEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBQ0Qsb0JBQW9CO1FBQ2xCLElBQUksQ0FB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