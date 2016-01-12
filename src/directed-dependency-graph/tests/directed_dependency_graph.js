import {
  addNode, removeNode, addEdge, removeEdge, getNodesWithoutPredecessors, pruneFromNode
} from '../directed_dependency_graph';
import {assert} from '../../utils/assert';

describe('directed_dependency_graph', () => {
  describe('#addNode', () => {
    it('should mutate the provided object', () => {
      const nodes = {};
      addNode(nodes, 'test');
      assert.deepEqual(nodes, {
        test: {
          successors: [],
          predecessors: []
        }
      });
    });
    it('should throw if a node already exists', () => {
      const nodes = {test: {}};
      assert.throws(
        () => addNode(nodes, 'test'),
        'Node "test" already exists'
      );
    });
  });
  describe('#removeNode', () => {
    it('should mutate the provided object', () => {
      const nodes = {test: {}};
      removeNode(nodes, 'test');
      assert.isUndefined(nodes.test);
    });
    it('should throw if a node does not already exist', () => {
      const nodes = {};
      assert.throws(
        () => removeNode(nodes, 'test'),
        'Node "test" does not exist'
      );
    });
  });
  describe('#addEdge', () => {
    it('should mutate the provided object', () => {
      const nodes = {};

      addNode(nodes, 'foo');
      addNode(nodes, 'bar');
      addEdge(nodes, 'foo', 'bar');

      assert.deepEqual(
        nodes,
        {
          foo: {
            successors: ['bar'],
            predecessors: []
          },
          bar: {
            successors: [],
            predecessors: ['foo']
          }
        }
      )
    });
    it('should throw if either node does not already exist', () => {
      const nodes = {};
      assert.throws(
        () => addEdge(nodes, 'foo', 'bar'),
        'Node "foo" does not exist'
      );
      nodes.foo = {};
      assert.throws(
        () => addEdge(nodes, 'foo', 'bar'),
        'Node "bar" does not exist'
      );
    });
  });
  describe('#removeEdge', () => {
    it('should mutate the provided object', () => {
      const nodes = {};

      addNode(nodes, 'foo');
      addNode(nodes, 'bar');
      addEdge(nodes, 'foo', 'bar');
      removeEdge(nodes, 'foo', 'bar');

      assert.deepEqual(
        nodes,
        {
          foo: {
            successors: [],
            predecessors: []
          },
          bar: {
            successors: [],
            predecessors: []
          }
        }
      )
    });
    it('should throw if either node does not already exist', () => {
      const nodes = {};
      assert.throws(
        () => removeEdge(nodes, 'foo', 'bar'),
        'Node "foo" does not exist'
      );
      nodes.foo = {};
      assert.throws(
        () => removeEdge(nodes, 'foo', 'bar'),
        'Node "bar" does not exist'
      );
    });
  });
  describe('#getNodesWithoutPredecessors', () => {
    it('should return a list of nodes that do not have any predecessors', () => {
      const nodes = {};

      assert.deepEqual(getNodesWithoutPredecessors(nodes), []);

      addNode(nodes, 'foo');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['foo']);

      addNode(nodes, 'bar');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['foo', 'bar']);

      addNode(nodes, 'woz');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['foo', 'bar', 'woz']);

      addEdge(nodes, 'foo', 'bar');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['foo', 'woz']);

      addEdge(nodes, 'woz', 'bar');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['foo', 'woz']);

      addEdge(nodes, 'foo', 'woz');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['foo']);
    });
  });
  describe('#pruneFromNode', () => {
    it('should remove the node and recursively remove all successor nodes that lack other predecessors', () => {
      const nodes = {
        a: {successors: ['b', 'c'], predecessors: []},
        b: {successors: ['d'], predecessors: ['a']},
        c: {successors: ['d', 'e', 'f'], predecessors: ['a']},
        d: {successors: ['e'], predecessors: ['b', 'c']},
        e: {successors: [], predecessors: ['c', 'd']},
        f: {successors: ['g'], predecessors: ['c']},
        g: {successors: ['d'], predecessors: ['f']}
      };

      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);
      removeEdge(nodes, 'a', 'c');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a', 'c']);

      const nodesPruned = pruneFromNode(nodes, 'c');
      assert.deepEqual(nodesPruned, ['c', 'f', 'g']);

      assert.deepEqual(
        nodes,
        {
          a: {successors: ['b'], predecessors: []},
          b: {successors: ['d'], predecessors: ['a']},
          c: undefined,
          d: {successors: ['e'], predecessors: ['b']},
          e: {successors: [], predecessors: ['d']},
          f: undefined,
          g: undefined
        }
      )
    });
    it('should remove edges from predecessors', () => {
      const nodes = {
        a: {successors: ['d', 'e'], predecessors: []},
        b: {successors: ['c'], predecessors: ['d']},
        c: {successors: ['d'], predecessors: ['b']},
        d: {successors: ['b'], predecessors: ['a', 'c']},
        e: {successors: [], predecessors: ['a']}
      };

      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);
      removeEdge(nodes, 'a', 'd');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);

      const nodesPruned = pruneFromNode(nodes, 'd');
      assert.deepEqual(nodesPruned, ['d', 'b', 'c']);

      assert.deepEqual(
        nodes,
        {
          a: {successors: ['e'], predecessors: []},
          b: undefined,
          c: undefined,
          d: undefined,
          e: {successors: [], predecessors: ['a']}
        }
      )
    });
    it('should ignore specified nodes when pruning successor nodes', () => {
      const nodes = {
        a: {successors: ['d', 'e'], predecessors: []},
        b: {successors: ['c'], predecessors: ['d']},
        c: {successors: ['d'], predecessors: ['b']},
        d: {successors: ['b'], predecessors: ['a', 'c']},
        e: {successors: [], predecessors: ['a']}
      };

      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);
      removeEdge(nodes, 'a', 'd');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);

      const nodesPruned = pruneFromNode(nodes, 'd', ['a', 'b']);
      assert.deepEqual(nodesPruned, ['d']);

      assert.deepEqual(
        nodes,
        {
          a: {successors: ['e'], predecessors: []},
          b: {successors: ['c'], predecessors: []},
          c: {successors: [], predecessors: ['b']},
          d: undefined,
          e: {successors: [], predecessors: ['a']}
        }
      )
    });
  });
});
