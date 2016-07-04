const {difference} = require('lodash/array');
const {Map, OrderedSet} = require('immutable');
const {assert} = require('../../utils/assert');
const {
  Node, addNode, removeNode, addEdge, removeEdge, defineEntryNode, findNodesDisconnectedFromEntryNodes, 
  pruneNodeAndUniqueDependencies
} = require('../node');
const {createNodesFromNotation} = require('../utils');

describe('cyclic_dependency_graph/node', () => {
  describe('#Node', () => {
    it('should have name, dependencies and dependents properties', () => {
      const node = Node({
        name: 'test'
      });
      assert.equal(node.name, 'test');
      assert.instanceOf(node.dependencies, OrderedSet);
      assert.instanceOf(node.dependents, OrderedSet);
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
      );
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
      );
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
      let nodes = createNodesFromNotation('a');
      nodes = defineEntryNode(nodes, 'a');
      assert.isTrue(
        nodes.get('a').isEntryNode
      );
    });
    it('should preserve the node\'s other values', () => {
      let nodes = createNodesFromNotation('a -> b');

      nodes = defineEntryNode(nodes, 'a');
      assert.equal(nodes.get('a').dependencies, OrderedSet(['b']));

      nodes = defineEntryNode(nodes, 'b');
      assert.equal(nodes.get('b').dependents, OrderedSet(['a']));
    });
    it('should throw if the node has not been defined', () => {
      assert.throw(
        () => defineEntryNode(Map(), 'a'),
        'Cannot define entry node "a" as it does not exist'
      );
    });
  });
  describe('#findNodesDisconnectedFromEntryNodes', () => {
    it('should return all nodes if there no entry nodes', () => {
      const nodes = createNodesFromNotation(`
        a -> b -> c
        d -> c
      `);

      const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes);
      const expected = ['a', 'b', 'c', 'd'];

      assert.deepEqual(
        difference(disconnectedNodes, expected),
        []
      );
    });
    it('should list all dependents of an entry node that are not indirect dependencies of the entry', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
        d -> c
      `);

      nodes = defineEntryNode(nodes, 'd');

      const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes);
      const expected = ['a', 'b'];

      assert.deepEqual(
        difference(disconnectedNodes, expected),
        []
      );
    });
    it('should list all nodes which are disconnected from the entry nodes', () => {
      let nodes = createNodesFromNotation(`
        a
        b
        c -> d
      `);

      nodes = defineEntryNode(nodes, 'a');
      nodes = defineEntryNode(nodes, 'b');

      const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes);
      const expected = ['c', 'd'];

      assert.deepEqual(
        difference(disconnectedNodes, expected),
        []
      );
    });
    it('should return an empty list if all nodes are connected to an entry', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
      `);

      nodes = defineEntryNode(nodes, 'a');

      const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes);

      assert.deepEqual(disconnectedNodes, []);
    });
  });
  describe('#pruneNodeAndUniqueDependencies', () => {
    it('should prune the specified node', () => {
      const nodes = createNodesFromNotation(`
        a
        b
      `);

      assert.equal(
        pruneNodeAndUniqueDependencies(nodes, 'b').nodes,
        createNodesFromNotation('a')
      );
    });
    it('should indicate the nodes pruned', () => {
      const nodes = createNodesFromNotation('a');

      assert.deepEqual(
        pruneNodeAndUniqueDependencies(nodes, 'a').pruned,
        ['a']
      );
    });
    it('should follow dependents and prune them as well', () => {
      const nodes = createNodesFromNotation(`
        a -> b -> c
        a -> d
      `);

      const data = pruneNodeAndUniqueDependencies(nodes, 'a');

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

      const data = pruneNodeAndUniqueDependencies(nodes, 'c');

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
        pruneNodeAndUniqueDependencies(nodes, 'a').pruned,
        ['a']
      );
    });
    it('should not prune entry nodes when pruning unique dependencies 2', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
      `);
      nodes = defineEntryNode(nodes, 'c');

      assert.deepEqual(
        pruneNodeAndUniqueDependencies(nodes, 'a').pruned,
        ['a', 'b']
      );
    });
    it('should prune from an entry node if has been explicitly specified', () => {
      let nodes = createNodesFromNotation(`
        a -> b -> c
      `);
      nodes = defineEntryNode(nodes, 'a');

      assert.deepEqual(
        pruneNodeAndUniqueDependencies(nodes, 'a').pruned,
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

      const data = pruneNodeAndUniqueDependencies(nodes, 'c');
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
        () => pruneNodeAndUniqueDependencies(Map(), 'a'),
        'Cannot prune from node "a" as it has not been defined'
      );
    });
  });
});
