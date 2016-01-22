import {Map, Set} from 'immutable';
import {isNodePending, isNodeDefined, ensureNodeIsPermanent, createGraph} from '../graph';
import {Node, addNode, removeNode, addEdge, removeEdge} from '../node';
import {assert} from '../../utils/assert';
import {after} from 'lodash/function';

describe('directed-dependency-graph/graph', () => {
  describe('#createGraph', () => {
    describe('.traceNode', () => {
      it('should allow call the provided `getDependencies` function', (done) => {
        const graph = createGraph({getDependencies});

        function getDependencies(node) {
          assert.equal(node, 'test');
          done();
        }

        graph.traceNode('test');
      });
      it('should create a pending job for the node', () => {
        const graph = createGraph({getDependencies(){}});

        graph.traceNode('test');

        assert.isObject(graph.pendingJobs[0]);
        assert.equal(graph.pendingJobs[0].node, 'test');
        assert.isTrue(graph.pendingJobs[0].isValid);
      });
      it('should emit a `complete` signal once all the dependencies have been resolved', (done) => {
        const graph = createGraph({getDependencies});

        function getDependencies(name, cb) {
          cb(null, []);
        }

        graph.events.on('complete', () => {
          done();
        });

        graph.traceNode('test');
      });
      it('should populate the graph with the provided dependencies', (done) => {
        const graph = createGraph({getDependencies});

        function getDependencies(file, cb) {
          if (file === 'a') {
            cb(null, ['b', 'c']);
          } else {
            cb(null, []);
          }
        }

        graph.events.on('complete', () => {
          assert.isTrue(graph.isNodeDefined('a'));
          assert.isTrue(graph.isNodeDefined('b'));
          assert.isTrue(graph.isNodeDefined('c'));
          done();
        });

        graph.traceNode('a');
      });
    });
    describe('.pruneNode', () => {
      it('should allow nodes to be pruned', () => {
        const graph = createGraph({
          nodes: Map({
            test: Node()
          })
        });

        assert.isTrue(graph.isNodeDefined('test'));

        graph.pruneNode('test');
      });
      it('should emit `pruned` events', (done) => {
        const graph = createGraph({
          nodes: Map({
            test: Node()
          })
        });

        graph.events.on('pruned', (node) => {
          assert.equal(node, 'test');
          done();
        });

        graph.pruneNode('test');
      });
      it('should emit `pruned` events for all dependencies without dependents', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node({
              dependencies: Set(['b'])
            }),
            b: Node({
              dependents: Set(['a'])
            })
          })
        });

        let count = 0;
        graph.events.on('pruned', (node) => {
          count++;
          assert.include(['a', 'b'], node, 'should indicate that nodes "a" and "b" have been pruned');
          assert.include([1, 2], count);
          if (count > 1) {
            done();
          }
        });

        graph.pruneNode('a');
      });
      it('should not emit `pruned` events for any dependencies with other dependents', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node({dependencies: Set(['b'])}),
            b: Node({dependents: Set(['a', 'c'])}),
            c: Node({dependencies: Set(['b'])})
          })
        });

        graph.events.on('pruned', (node) => {
          assert.equal(node, 'a');
          done();
        });

        graph.pruneNode('a');
      });
      it('should invalidate any pending jobs related to the pruned nodes', () => {
        const graph = createGraph();

        graph.pendingJobs.push({node: 'a', isValid: true});

        graph.pruneNode('a');

        assert.isFalse(graph.pendingJobs[0].isValid);
      });
      it('should invalidate any pending jobs for dependencies', () => {
        const graph = createGraph({
          nodes: Map({
            a: Node({dependencies: Set(['b'])}),
            b: Node({dependents: Set(['a'])})
          })
        });

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.pruneNode('a');

        assert.isFalse(graph.pendingJobs[0].isValid);
      });
      it('should trigger `complete` after pruning a node', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node()
          })
        });

        graph.events.on('complete', () => {
          done();
        });

        graph.pruneNode('a');
      });
      it('should trigger `complete` if pending jobs are only for pruned dependencies', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node({dependencies: Set(['b'])}),
            b: Node({dependents: Set(['a'])})
          })
        });

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.events.on('complete', () => {
          assert.isFalse(graph.pendingJobs[0].isValid);
          done();
        });

        graph.pruneNode('a');
      });
      it('should not trigger `complete` if there are pending jobs for unpruned dependencies', () => {
        const graph = createGraph({
          nodes: Map({
            a: Node()
          })
        });

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.events.on('complete', () => {
          throw new Error('Should not be called');
        });

        graph.pruneNode('a');
      });
      it('should trigger `complete` if there are pending jobs that are no longer valid', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node()
          })
        });

        graph.pendingJobs.push({node: 'b', isValid: false});

        graph.events.on('complete', () => {
          done();
        });

        graph.pruneNode('a');
      });
  //    it('should trigger `dependency-pruned` when pruning a node with dependents', (done) => {
  //      const graph = createGraph();
  //
  //      addNode(graph.nodes, 'a');
  //      addNode(graph.nodes, 'b');
  //      addEdge(graph.nodes, 'a', 'b');
  //
  //      graph.events.on('dependency-pruned', (node, dependency) => {
  //        assert.equal(node, 'a');
  //        assert.equal(dependency, 'b');
  //        done();
  //      });
  //
  //      graph.pruneNode('b');
  //    });
  //    // TODO should only emit the event if the dependent node itself is not being pruned
    });
    describe('.isNodeDefined', () => {
      it('should indicate if a node has been defined', (done) => {
        const graph = createGraph({
          getDependencies(name, cb) {
            cb(null, []);
          }
        });

        assert.isFalse(graph.getNodes().has('test'));
        assert.isFalse(graph.isNodeDefined('test'));

        graph.traceNode('test');

        process.nextTick(() => {
          assert.isTrue(graph.getNodes().has('test'));
          assert.isTrue(graph.isNodeDefined('test'));
          done();
        });
      });
    });
    describe('.setNodeAsPermanent', () => {
      it('should allow nodes to be denoted as permanent', () => {
        const graph = createGraph();
        assert.deepEqual(graph.permanentNodes, []);

        graph.setNodeAsPermanent('test');
        assert.deepEqual(graph.permanentNodes, ['test']);

        graph.setNodeAsPermanent('test');
        assert.deepEqual(graph.permanentNodes, ['test']);
      });
      it('should be removed when pruned', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node()
          })
        });

        graph.setNodeAsPermanent('a');

        graph.events.on('pruned', node => {
          assert.equal(node, 'a');
          done();
        });

        graph.pruneNode('a');
      });
      it('should not be removed when pruning dependencies', (done) => {
        const graph = createGraph({
          nodes: Map({
            a: Node({dependencies: Set(['b'])}),
            b: Node({dependents: Set(['a'])})
          })
        });

        graph.setNodeAsPermanent('b');

        graph.events.on('pruned', node => {
          assert.equal(node, 'a');
          assert.isTrue(graph.isNodeDefined('b'));
          done();
        });

        graph.pruneNode('a');
      });
    });
  });
  describe('#ensureNodeIsPermanent', () => {
    it('should add a node to the provided array, if it is not already contained', () => {
      let permanentNodes = [];
      ensureNodeIsPermanent(permanentNodes, 'test');
      assert.deepEqual(permanentNodes, ['test']);

      permanentNodes = ['test'];
      ensureNodeIsPermanent(permanentNodes, 'test');
      assert.deepEqual(permanentNodes, ['test']);

      permanentNodes = ['foo'];
      ensureNodeIsPermanent(permanentNodes, 'bar');
      assert.deepEqual(permanentNodes, ['foo', 'bar']);
    });
  });
  describe('#isNodeDefined', () => {
    it('should indicate if a node has completed its dependency path', () => {
      let nodes = Map();
      assert.isFalse(isNodeDefined(nodes, 'test'));

      nodes = Map({test: Node()});
      assert.isTrue(isNodeDefined(nodes, 'test'));
    });
  });
  describe('#isNodePending', () => {
    it('should indicate if an active and pending job is associated with a node', () => {
      let pendingJobs = [{node: 'test', isValid: true}];
      assert.isTrue(isNodePending(pendingJobs, 'test'));

      pendingJobs = [{node: 'test', isValid: false}, {node: 'test', isValid: true}];
      assert.isTrue(isNodePending(pendingJobs, 'test'));

      pendingJobs = [{node: 'test', isValid: false}];
      assert.isFalse(isNodePending(pendingJobs, 'test'));

      pendingJobs = [{node: 'not test', isValid: false}];
      assert.isFalse(isNodePending(pendingJobs, 'test'));

      pendingJobs = [];
      assert.isFalse(isNodePending(pendingJobs, 'test'));
    });
  });
});
