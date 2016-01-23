import {Map, List, Set} from 'immutable';
import {Node, addNode, removeNode, addEdge, removeEdge, defineEntryNode, pruneFromNode} from '../node';
import {createNodesFromNotation} from '../utils';
import {assert} from '../../utils/assert';

describe('directed-dependency-graph/node', () => {
  describe('#Node', () => {
    it('should have name, dependencies and dependents properties', () => {
      const node = Node({
        name: 'test'
      });
      assert.equal(node.name, 'test');
      assert.instanceOf(node.dependencies, Set);
      assert.instanceOf(node.dependents, Set);
      assert.isFalse(node.isEntryNode);
    });
  });
  describe('#addNode', () => {
    it('should return a Map containing the specified key and a Node instance', () => {
      let nodes = Map();

      nodes = addNode(nodes, 'test');

      assert.deepEqual(
        nodes,
        Map({
          test: Node({name: 'test'})
        })
      );
    });
    it('should throw if a node already exists', () => {
      const nodes = Map({test: Node()});

      assert.throws(
        () => addNode(nodes, 'test'),
        'Node "test" already exists'
      );
    });
  });
  describe('#removeNode', () => {
    it('should return a Map without the specified key', () => {
      let nodes = Map({test: Node()});

      nodes = removeNode(nodes, 'test');

      assert.equal(nodes, Map());
    });
    it('should throw if a node does not already exist', () => {
      const nodes = Map();

      assert.throws(
        () => removeNode(nodes, 'test'),
        'Node "test" does not exist'
      );
    });
  });
  describe('#addEdge', () => {
    it('should return a map with the respective nodes updated', () => {
      const nodes = createNodesFromNotation(`
        a
        b
      `);

      const withEdge = addEdge(nodes, 'a', 'b');

      assert.deepEqual(
        withEdge,
        createNodesFromNotation('a -> b')
      )
    });
    it('should throw if the node names are the same', () => {
      assert.throws(
        () => addEdge(Map(), 'foo', 'foo'),
        'Edges must point to two different nodes. Cannot add an edge from "foo" to itself'
      );
    });
    it('should throw if either node does not already exist', () => {
      let nodes = Map();

      assert.throws(
        () => addEdge(nodes, 'foo', 'bar'),
        'Cannot add edge from "foo" -> "bar" as "foo" has not been defined'
      );

      nodes = Map({foo: Node()});

      assert.throws(
        () => addEdge(nodes, 'foo', 'bar'),
        'Cannot add edge from "foo" -> "bar" as "bar" has not been defined'
      );
    });
  });
  describe('#removeEdge', () => {
    it('should return a map without the specified edge', () => {
      let nodes = createNodesFromNotation('a -> b');

      nodes = removeEdge(nodes, 'a', 'b');

      assert.deepEqual(
        nodes,
        createNodesFromNotation(`
          a
          b
        `)
      )
    });
    it('should throw if either node does not already exist', () => {
      let nodes = Map();

      assert.throws(
        () => removeEdge(nodes, 'foo', 'bar'),
        'Cannot remove edge from "foo" -> "bar" as "foo" has not been defined'
      );

      nodes = Map({foo: Node({name: 'foo'})});

      assert.throws(
        () => removeEdge(nodes, 'foo', 'bar'),
        'Cannot remove edge from "foo" -> "bar" as "bar" has not been defined'
      );
    });
  });
  describe('#defineEntryNode', () => {
    it('should set the node\'s isEntryNode property to true', () => {
      let nodes = createNodesFromNotation(`a`);
      nodes = defineEntryNode(nodes, 'a');
      assert.isTrue(
        nodes.get('a').isEntryNode
      )
    });
    it('should preserve the node\'s other values', () => {
      let nodes = createNodesFromNotation(`a -> b`);

      nodes = defineEntryNode(nodes, 'a');
      assert.equal(nodes.get('a').dependencies, Set(['b']));

      nodes = defineEntryNode(nodes, 'b');
      assert.equal(nodes.get('b').dependents, Set(['a']));
    });
    it('should throw if the node has not been defined', () => {
      assert.throw(
        () => defineEntryNode(Map(), 'a'),
        'Cannot define entry node "a" as it does not exist'
      )
    });
  });
  describe('#pruneFromNode', () => {
    it('should prune the specified node', () => {
      const nodes = createNodesFromNotation(`
        a
        b
      `);

      assert.equal(
        pruneFromNode(nodes, 'b').nodes,
        createNodesFromNotation('a')
      );
    });
    it('should indicate the nodes pruned', () => {
      const nodes = createNodesFromNotation('a');

      assert.deepEqual(
        pruneFromNode(nodes, 'a').pruned,
        ['a']
      );
    });
    it('should follow dependents and prune them as well', () => {
      const nodes = createNodesFromNotation(`
        a -> b -> c
        a -> d
      `);

      let data = pruneFromNode(nodes, 'a');

      assert.equal(data.nodes, Map());

      assert.deepEqual(
        data.pruned,
        ['a', 'b', 'c', 'd']
      );
    });
    it('should update dependents when pruning a node', () => {
      const nodes = createNodesFromNotation(`
        a -> c
        b -> c
      `);

      const data = pruneFromNode(nodes, 'c');

      assert.equal(
        data.nodes,
        createNodesFromNotation(`
          a
          b
        `)
      );

      assert.deepEqual(
        data.pruned,
        ['c']
      );
    });
    it('should not prune entry nodes when pruning unique dependencies 1', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
      `);
      nodes = defineEntryNode(nodes, 'b');

      assert.deepEqual(
        pruneFromNode(nodes, 'a').pruned,
        ['a']
      );
    });
    it('should not prune entry nodes when pruning unique dependencies 2', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
      `);
      nodes = defineEntryNode(nodes, 'c');

      assert.deepEqual(
        pruneFromNode(nodes, 'a').pruned,
        ['a', 'b']
      );
    });
    it('should prune from an entry node if has been explicitly specified', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
      `);
      nodes = defineEntryNode(nodes, 'a');

      console.log(nodes);
      // Even when specified as an ignored node, calling `pruneFromNode`
      // with the node's name should still prune it (and any dependencies)
      assert.deepEqual(
        pruneFromNode(nodes, 'a').pruned,
        ['a', 'b', 'c']
      );
    });
    it('should remove the node and recursively remove all dependency nodes that lack other dependents', () => {
      const nodes = createNodesFromNotation(`
        a -> b -> c -> d
        b -> d -> e
        c -> e
        c -> f -> g -> d
      `);

      const data = pruneFromNode(nodes, 'c');
      assert.deepEqual(
        data.pruned,
        ['c', 'f', 'g']
      );

      assert.deepEqual(
        data.nodes,
        createNodesFromNotation(`
          a -> b -> d -> e
        `)
      );
    });
    it('should throw if the node has not been defined', () => {
      assert.throw(
        () => pruneFromNode(Map(), 'a'),
        'Cannot prune from node "a" as it has not been defined'
      );
    });
  });
});
