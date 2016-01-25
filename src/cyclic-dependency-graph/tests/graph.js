import EventEmitter from 'events';
import {Map, Set} from 'immutable';
import {isNodePending, isNodeDefined, createGraph} from '../graph';
import {Node, addNode, removeNode, addEdge, removeEdge, defineEntryNode} from '../node';
import {Diff, getPrunedNodesFromDiff, getChangedNodes} from '../diff';
import {createNodesFromNotation} from '../utils';
import {assert} from '../../utils/assert';

describe('cyclic-dependency-graph/graph', () => {
  describe('#createGraph', () => {
    describe('.events', () => {
      it('should be an instance of EventEmitter', () => {
        const graph = createGraph();
        assert.instanceOf(graph.events, EventEmitter);
      });
      describe('`started`', () => {
        it('should emit during the first traceFromNode call', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(null, []);
            }
          });

          graph.events.on('started', () => {
            done();
          });

          graph.traceFromNode('test');
        });
        it('should only be emitted once per run', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(null, []);
            }
          });

          let called = 0;
          graph.events.on('started', () => {
            called++;
          });

          graph.events.once('complete', () => {
            graph.traceFromNode('a');
            graph.traceFromNode('b');
            graph.traceFromNode('c');

            graph.events.once('complete', () => {
              assert.equal(called, 2);

              done();
            });
          });

          graph.traceFromNode('a');
          graph.traceFromNode('b');
          graph.traceFromNode('c');
        });
      });
      describe('`complete`', () => {
        it('should be emitted once all tracing has completed', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(null, []);
            }
          });

          graph.events.on('complete', () => {
            done();
          });

          graph.traceFromNode('test');
        });
        it('should provide a diff', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(null, []);
            }
          });

          const initialState = graph.getState();

          graph.traceFromNode('a');

          graph.events.once('complete', ({diff: diff1}) => {
            assert.equal(diff1.from, initialState);
            assert.equal(diff1.to, graph.getState());

            graph.events.once('complete', ({diff: diff2}) => {
              assert.equal(diff2.from, diff1.to);
              assert.equal(diff2.to, graph.getState());
              done();
            });

            graph.traceFromNode('b');
          });
        });
        it('should emit if an error occurred', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb('some error');
            }
          });

          graph.traceFromNode('a');

          graph.events.on('error', ({error, diff}) => {
            assert.equal(error, 'some error');

            graph.events.on('complete', ({errors}) => {
              assert.isArray(errors);
              assert.equal(errors.length, 1);
              assert.equal(errors[0].error, 'some error');
              assert.equal(errors[0].node, 'a');
              assert.equal(errors[0].diff, diff);
              done();
            });
          });
        });
        it('should not emit if an error occurred and pending jobs exist', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb('some error');
            }
          });

          graph.events.on('error', ({error}) => {
            assert.equal(error, 'some error');

            graph.pendingJobs.push({node: 'test', isValid: true});

            graph.events.on('complete', () => {
              throw new Error('This should not be reached');
            });

            done();
          });

          graph.traceFromNode('a');
        });
        it('should not produce the same errors for separate runs', (done) => {
          // This checks to ensure that the graph resets its internal state
          // after emitting complete

          const graph = createGraph({
            getDependencies(name, cb) {
              cb(`Error: ${name}`);
            }
          });

          graph.events.once('error', ({error}) => {
            assert.equal(error, 'Error: a');

            graph.events.once('complete', ({errors: firstErrors}) => {
              graph.events.once('error', ({error}) => {
                assert.equal(error, 'Error: b');

                graph.events.once('complete', ({errors: secondErrors}) => {
                  assert.notStrictEqual(firstErrors, secondErrors);
                  assert.notStrictEqual(firstErrors[0], secondErrors[0]);
                  done();
                });
              });

              graph.traceFromNode('b');
            });
          });

          graph.traceFromNode('a');
        });
        it('should handle multiple errors in one run', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(`Error: ${name}`);
            }
          });

          graph.events.on('error', () => {
          });

          graph.events.once('complete', ({errors}) => {
            assert.equal(errors[0].error, 'Error: a');
            assert.equal(errors[1].error, 'Error: b');
            done();
          });

          graph.traceFromNode('a');
          graph.traceFromNode('b');
        });
      });
      describe('`traced`', () => {
        it('should be emitted once a node has been traced has completed', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(null, []);
            }
          });

          graph.events.on('traced', () => {
            done();
          });

          graph.traceFromNode('test');
        });
        it('should be provide the node and a state diff', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb(null, []);
            }
          });

          const initialState = graph.getState();

          graph.events.once('traced', ({node: node1, diff: diff1}) => {
            assert.equal(node1, '1');
            assert.equal(diff1.from, initialState);
            assert.equal(diff1.to, graph.getState());

            graph.events.once('traced', ({node: node2, diff: diff2}) => {
              assert.equal(node2, '2');
              assert.equal(diff2.from, diff1.to);
              assert.equal(diff2.to, graph.getState());

              done();
            });

            graph.traceFromNode('2');
          });

          graph.traceFromNode('1');
        });
        it('should not be emitted if an error is encountered', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb('some error');
            }
          });

          // No-op to prevent the EventEmitter from throwing an exception
          graph.events.on('error', () => {
          });

          graph.events.on('traced', () => {
            throw new Error('should not be reached');
          });

          graph.events.on('complete', () => {
            done();
          });

          graph.traceFromNode('test');
        });
      });
      describe('`error`', () => {
        it('should be emitted if getDependencies provides an error', (done) => {
          const graph = createGraph({
            getDependencies(name, cb) {
              cb('expected error');
            }
          });

          graph.events.on('error', ({error, node, state}) => {
            assert.equal(error, 'expected error');
            assert.equal(node, 'test');
            assert.equal(state, graph.getState());
            done();
          });

          graph.traceFromNode('test');
        });
      });
    });
    describe('.traceFromNode', () => {
      it('should call the provided `getDependencies` function', (done) => {
        const graph = createGraph({getDependencies});

        function getDependencies(node) {
          assert.equal(node, 'test');
          done();
        }

        graph.traceFromNode('test');
      });
      it('should create a pending job for the node', () => {
        const graph = createGraph({
          getDependencies(){
          }
        });

        graph.traceFromNode('test');

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

        graph.traceFromNode('test');
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

        graph.events.on('complete', ({diff}) => {
          assert.isTrue(diff.to.has('a'));
          assert.isTrue(diff.to.has('b'));
          assert.isTrue(diff.to.has('c'));
          done();
        });

        graph.traceFromNode('a');
      });
      it('should invalidate any pending jobs for the node', () => {
        const graph = createGraph({
          getDependencies: () => {
          }
        });

        const job = {node: 'test', isValid: true};

        graph.pendingJobs.push(job);

        graph.traceFromNode('test');

        assert.isFalse(job.isValid);
      });
      it('should not call getDependencies if the associate job was invalidated', (done) => {
        const graph = createGraph({
          getDependencies: () => {
            throw new Error('This should not be reached');
          }
        });

        graph.traceFromNode('test');

        graph.pendingJobs[0].isValid = false;

        process.nextTick(done);
      });
    });
    describe('.pruneFromNode', () => {
      it('should allow nodes to be pruned', () => {
        const graph = createGraph({
          state: createNodesFromNotation('a')
        });

        const diff = graph.pruneFromNode('a');

        assert.deepEqual(
          getPrunedNodesFromDiff(diff),
          ['a']
        );
      });
      it('should prune dependencies without dependents', () => {
        const graph = createGraph({
          state: createNodesFromNotation('a -> b')
        });


        const diff = graph.pruneFromNode('a');

        assert.deepEqual(
          getPrunedNodesFromDiff(diff),
          ['a', 'b']
        );
      });
      it('should invalidate any pending jobs related to the pruned nodes', () => {
        const graph = createGraph();

        graph.pendingJobs.push({node: 'a', isValid: true});

        graph.pruneFromNode('a');

        assert.isFalse(graph.pendingJobs[0].isValid);
      });
      it('should invalidate any pending jobs for dependencies', () => {
        const graph = createGraph({
          state: createNodesFromNotation('a -> b')
        });

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.pruneFromNode('a');

        assert.isFalse(graph.pendingJobs[0].isValid);
      });
      it('should trigger `complete` after pruning a node', (done) => {
        const graph = createGraph({
          state: createNodesFromNotation('a')
        });

        graph.events.on('complete', () => {
          done();
        });

        graph.pruneFromNode('a');
      });
      it('should not trigger `complete` if there are pending jobs for un-pruned dependencies', () => {
        const graph = createGraph({
          state: createNodesFromNotation('a')
        });

        graph.pendingJobs.push({node: 'b', isValid: true});

        graph.events.on('complete', () => {
          throw new Error('Should not be called');
        });

        graph.pruneFromNode('a');
      });
    });
    describe('.pruneDisconnectedNodes', () => {
      it('should prune all nodes that are not connected to an entry', () => {
        const graph = createGraph({
          state: createNodesFromNotation(`
            a -> b
            c -> b
            d
          `)
        });

        graph.setNodeAsEntry('a');

        const diff = graph.pruneDisconnectedNodes();

        assert.deepEqual(
          getPrunedNodesFromDiff(diff),
          ['c', 'd']
        );
      });
      it('should prune all nodes if there is no entry', () => {
        const graph = createGraph({
          state: createNodesFromNotation(`
            a -> b
            c -> b
            d
          `)
        });

        const diff = graph.pruneDisconnectedNodes();

        assert.deepEqual(
          getPrunedNodesFromDiff(diff),
          ['a', 'b', 'c', 'd']
        );
      });
    });
    describe('.setNodeAsEntry', () => {
      it('should allow nodes to be denoted as entry nodes', () => {
        const graph = createGraph({
          state: createNodesFromNotation(`a -> b`)
        });

        const diff = graph.setNodeAsEntry('a');

        assert.deepEqual(
          getChangedNodes(diff),
          ['a']
        );
        assert.isTrue(graph.getState().get('a').isEntryNode);
      });
      it('should be removed when pruned directly', () => {
        const graph = createGraph({
          state: createNodesFromNotation('a')
        });

        graph.setNodeAsEntry('a');

        const diff = graph.pruneFromNode('a');
        assert.deepEqual(
          getPrunedNodesFromDiff(diff),
          ['a']
        );
      });
      it('should not be removed when pruning dependencies', () => {
        const graph = createGraph({
          state: createNodesFromNotation(`
            a
            b -> a
          `)
        });

        graph.setNodeAsEntry('a');

        const diff = graph.pruneFromNode('b');
        assert.deepEqual(
          getPrunedNodesFromDiff(diff),
          ['b']
        );
      });
      it('should allow nodes to be denoted as entry nodes before they are traced', (done) => {
        const graph = createGraph({
          getDependencies(node, cb) {
            if (node === 'a') {
              cb(null, ['b', 'c']);
            } else {
              cb(null, []);
            }
          }
        });

        graph.setNodeAsEntry('a');
        graph.traceFromNode('a');

        graph.events.on('complete', () => {
          const state = graph.getState();
          let nodes = createNodesFromNotation(`
            a -> b
            a -> c
          `);
          nodes = defineEntryNode(nodes, 'a');
          assert.equal(state, nodes);
          assert.isTrue(state.get('a').isEntryNode);
          done();
        });
      });
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
  describe('pruning cyclic graphs', () => {
    it('should handle cyclic graphs 1', () => {
      const graph = createGraph({
        state: createNodesFromNotation(`
          a -> b -> c -> b
        `)
      });

      graph.pruneFromNode('a');
      graph.pruneDisconnectedNodes();

      assert.equal(graph.getState(), Map());
    });
    it('should handle cyclic graphs 2', () => {
      const graph = createGraph({
        state: createNodesFromNotation(`
          a -> b -> c -> d -> b
        `)
      });

      graph.pruneFromNode('a');
      graph.pruneDisconnectedNodes();

      assert.equal(graph.getState(), Map());
    });
    it('should handle cyclic graphs 3', () => {
      const graph = createGraph({
        state: createNodesFromNotation(`
          a -> b -> c -> d -> b
          c -> b
        `)
      });

      graph.pruneFromNode('a');
      graph.pruneDisconnectedNodes();

      assert.equal(graph.getState(), Map());
    });
    it('should handle cyclic graphs 4', () => {
      const graph = createGraph({
        state: createNodesFromNotation(`
          a -> b -> c -> d -> b
          c -> b
        `)
      });

      graph.setNodeAsEntry('a');

      graph.pruneFromNode('b');

      assert.equal(
        graph.getState(),
        Map({
          a: Node({name: 'a', isEntryNode: true})
        })
      );
    });
    it('should successfully prune a graph representing a tournament', () => {
      // https://en.wikipedia.org/wiki/Tournament_(graph_theory)

      const graph = createGraph({
        state: createNodesFromNotation(`
          a -> b
          a -> c
          a -> d
          b -> a
          b -> c
          b -> d
          c -> a
          c -> b
          c -> d
          d -> a
          d -> b
          d -> c
        `)
      });

      graph.setNodeAsEntry('a');

      graph.pruneFromNode('a');
      graph.pruneDisconnectedNodes();

      assert.equal(graph.getState(), Map());
    });
  });
});
