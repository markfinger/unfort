import {isNodePending, isNodeDefined, ensureNodeIsPermanent, createGraph} from '../graph';
import {addNode, removeNode, addEdge, removeEdge} from '../utils';
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
        const graph = createGraph({getDependencies});

        function getDependencies() {}

        graph.traceNode('test');

        assert.isObject(graph.pendingJobs[0]);
        assert.equal(graph.pendingJobs[0].node, 'test');
        assert.isTrue(graph.pendingJobs[0].isValid);
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
        const graph = createGraph();

        assert.isFalse(isNodeDefined(graph.nodes, 'test'));

        addNode(graph.nodes, 'test');
        assert.isTrue(isNodeDefined(graph.nodes, 'test'));

        graph.pruneNode('test');

        assert.isFalse(isNodeDefined(graph.nodes, 'test'));
      });
      it('should emit `pruned` events', (done) => {
        const graph = createGraph();

        addNode(graph.nodes, 'test');

        graph.events.on('pruned', (node) => {
          assert.equal(node, 'test');
          done();
        });

        graph.pruneNode('test');
      });
      it('should emit `pruned` events for all successors without predecessors', (_done) => {
        const done = after(2, _done);

        const graph = createGraph();

        addNode(graph.nodes, 'a');
        addNode(graph.nodes, 'b');
        addEdge(graph.nodes, 'a', 'b');

        graph.events.on('pruned', (node) => {
          assert.include(['a', 'b'], node, 'should indicate that nodes "a" and "b" have been pruned');
          done();
        });

        graph.pruneNode('a');
      });
      it('should not emit `pruned` events for any successors with other predecessors', (done) => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');
        addNode(graph.nodes, 'b');
        addNode(graph.nodes, 'c');
        addEdge(graph.nodes, 'a', 'b');
        addEdge(graph.nodes, 'c', 'b');

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
      it('should invalidate any pending jobs for successors', () => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');
        addNode(graph.nodes, 'b');
        addEdge(graph.nodes, 'a', 'b');

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.pruneNode('a');

        assert.isFalse(graph.pendingJobs[0].isValid);
      });
      it('should trigger `complete` after pruning a node', (done) => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');

        graph.events.on('complete', () => {
          done();
        });

        graph.pruneNode('a');
      });
      it('should not trigger `complete` if there are other pending jobs', () => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.events.on('complete', () => {
          throw new Error('Should not be called');
        });

        graph.pruneNode('a');
      });
      it('should trigger `complete` if pending jobs are only for successors', (done) => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');
        addNode(graph.nodes, 'b');
        addEdge(graph.nodes, 'a', 'b');

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.events.on('complete', () => {
          done();
        });

        graph.pruneNode('a');
      });
      it('should trigger `complete` if there are pending jobs that are no longer valid', (done) => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');

        graph.pendingJobs.push({node: 'b', isValid: false});

        graph.events.on('complete', () => {
          done();
        });

        graph.pruneNode('a');
      });
    });
    describe('.isNodeDefined', () => {
      it('should indicate if a node has been defined', () => {
        const graph = createGraph();
        
        assert.isFalse(graph.isNodeDefined('test'));

        addNode(graph.nodes, 'test');

        assert.isTrue(graph.isNodeDefined('test'));
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
        const graph = createGraph();

        addNode(graph.nodes, 'a');

        graph.setNodeAsPermanent('b');

        graph.events.on('pruned', node => {
          assert.equal(node, 'a');
          done();
        });

        graph.pruneNode('a');
      });
      it('should not be removed when pruning successors', (done) => {
        const graph = createGraph();

        addNode(graph.nodes, 'a');
        addNode(graph.nodes, 'b');
        addEdge(graph.nodes, 'a', 'b');

        graph.setNodeAsPermanent('b');

        graph.events.on('pruned', node => {
          assert.equal(node, 'a');
          assert.isObject(graph.nodes.b);
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
      let nodes = {};
      assert.isFalse(isNodeDefined(nodes, 'test'));

      nodes = {test: undefined};
      assert.isFalse(isNodeDefined(nodes, 'test'));

      nodes = {test: {}};
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
