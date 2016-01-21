import {addNode, removeNode, addEdge, removeEdge, getNodesWithoutPredecessors, pruneFromNode} from '../utils';
import {assert} from '../../utils/assert';

describe('directed-dependency-graph/utils', () => {
  describe('#addNode', () => {
    it('should mutate the provided object', () => {
      const nodes = {};
      addNode(nodes, 'test');
      assert.deepEqual(nodes, {
        test: {
          dependencies: [],
          dependents: []
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
            dependencies: ['bar'],
            dependents: []
          },
          bar: {
            dependencies: [],
            dependents: ['foo']
          }
        }
      )
    });
    it('should throw if either node does not already exist', () => {
      const nodes = {};
      assert.throws(
        () => addEdge(nodes, 'foo', 'bar'),
        'Cannot add edge from "foo" -> "bar" as "foo" has not been defined'
      );
      nodes.foo = {};
      assert.throws(
        () => addEdge(nodes, 'foo', 'bar'),
        'Cannot add edge from "foo" -> "bar" as "bar" has not been defined'
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
            dependencies: [],
            dependents: []
          },
          bar: {
            dependencies: [],
            dependents: []
          }
        }
      )
    });
    it('should throw if either node does not already exist', () => {
      const nodes = {};
      assert.throws(
        () => removeEdge(nodes, 'foo', 'bar'),
        'Cannot remove edge from "foo" -> "bar" as "foo" has not been defined'
      );
      nodes.foo = {};
      assert.throws(
        () => removeEdge(nodes, 'foo', 'bar'),
        'Cannot remove edge from "foo" -> "bar" as "bar" has not been defined'
      );
    });
  });
  describe('#getNodesWithoutPredecessors', () => {
    it('should return a list of nodes that do not have any dependents', () => {
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
    it('should remove the node and recursively remove all dependency nodes that lack other dependents', () => {
      const nodes = {
        a: {dependencies: ['b', 'c'], dependents: []},
        b: {dependencies: ['d'], dependents: ['a']},
        c: {dependencies: ['d', 'e', 'f'], dependents: ['a']},
        d: {dependencies: ['e'], dependents: ['b', 'c']},
        e: {dependencies: [], dependents: ['c', 'd']},
        f: {dependencies: ['g'], dependents: ['c']},
        g: {dependencies: ['d'], dependents: ['f']}
      };

      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);
      removeEdge(nodes, 'a', 'c');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a', 'c']);

      const nodesPruned = pruneFromNode(nodes, 'c');
      assert.deepEqual(nodesPruned, ['c', 'f', 'g']);

      assert.deepEqual(
        nodes,
        {
          a: {dependencies: ['b'], dependents: []},
          b: {dependencies: ['d'], dependents: ['a']},
          c: undefined,
          d: {dependencies: ['e'], dependents: ['b']},
          e: {dependencies: [], dependents: ['d']},
          f: undefined,
          g: undefined
        }
      )
    });
    it('should remove edges from dependents', () => {
      const nodes = {
        a: {dependencies: ['d', 'e'], dependents: []},
        b: {dependencies: ['c'], dependents: ['d']},
        c: {dependencies: ['d'], dependents: ['b']},
        d: {dependencies: ['b'], dependents: ['a', 'c']},
        e: {dependencies: [], dependents: ['a']}
      };

      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);
      removeEdge(nodes, 'a', 'd');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);

      const nodesPruned = pruneFromNode(nodes, 'd');
      assert.deepEqual(nodesPruned, ['d', 'b', 'c']);

      assert.deepEqual(
        nodes,
        {
          a: {dependencies: ['e'], dependents: []},
          b: undefined,
          c: undefined,
          d: undefined,
          e: {dependencies: [], dependents: ['a']}
        }
      )
    });
    it('should ignore specified nodes when pruning dependency nodes', () => {
      const nodes = {
        a: {dependencies: ['d', 'e'], dependents: []},
        b: {dependencies: ['c'], dependents: ['d']},
        c: {dependencies: ['d'], dependents: ['b']},
        d: {dependencies: ['b'], dependents: ['a', 'c']},
        e: {dependencies: [], dependents: ['a']}
      };

      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);
      removeEdge(nodes, 'a', 'd');
      assert.deepEqual(getNodesWithoutPredecessors(nodes), ['a']);

      const nodesPruned = pruneFromNode(nodes, 'd', ['a', 'b']);
      assert.deepEqual(nodesPruned, ['d']);

      assert.deepEqual(
        nodes,
        {
          a: {dependencies: ['e'], dependents: []},
          b: {dependencies: ['c'], dependents: []},
          c: {dependencies: [], dependents: ['b']},
          d: undefined,
          e: {dependencies: [], dependents: ['a']}
        }
      )
    });
  });
});
