import {Map, List, Set} from 'immutable';
import {Node, addNode, removeNode, addEdge, removeEdge, pruneFromNode} from '../node';
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
      let nodes = Map();

      nodes = addNode(nodes, 'foo');
      nodes = addNode(nodes, 'bar');
      nodes = addEdge(nodes, 'foo', 'bar');

      assert.deepEqual(
        nodes,
        Map({
          foo: Node({
            name: 'foo',
            dependencies: Set(['bar']),
            dependents: Set()
          }),
          bar: Node({
            name: 'bar',
            dependencies: Set(),
            dependents: Set(['foo'])
          })
        })
      )
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
    it('should mutate the provided object', () => {
      let nodes = Map();

      nodes = addNode(nodes, 'foo');
      nodes = addNode(nodes, 'bar');
      nodes = addEdge(nodes, 'foo', 'bar');
      nodes = removeEdge(nodes, 'foo', 'bar');

      assert.deepEqual(
        nodes,
        Map({
          foo: Node({name: 'foo'}),
          bar: Node({name: 'bar'})
        })
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
  describe('#pruneFromNode', () => {
    it('should prune the specified node', () => {
      let nodes = Map({
        a: Node({name: 'a'}),
        b: Node({name: 'b'})
      });

      assert.equal(
        pruneFromNode(nodes, 'b').nodes,
        Map({
          a: Node({name: 'a'})
        })
      );
    });
    it('should indicate the nodes pruned', () => {
      let nodes = Map({
        a: Node({name: 'a'})
      });

      assert.deepEqual(
        pruneFromNode(nodes, 'a').pruned,
        ['a']
      );
    });
    it('should follow dependents and prune them as well', () => {
      let nodes = Map({
        a: Node({name: 'a'}),
        b: Node({name: 'b'}),
        c: Node({name: 'c'}),
        d: Node({name: 'd'})
      });

      nodes = addEdge(nodes, 'a', 'b');
      nodes = addEdge(nodes, 'b', 'c');
      nodes = addEdge(nodes, 'a', 'd');

      let data = pruneFromNode(nodes, 'a');

      assert.equal(data.nodes, Map());

      assert.deepEqual(
        data.pruned,
        ['a', 'b', 'c', 'd']
      );
    });
    it('should update dependents when pruning a node', () => {
      let nodes = Map({
        a: Node({name: 'a'}),
        b: Node({name: 'b'}),
        c: Node({name: 'c'})
      });

      nodes = addEdge(nodes, 'a', 'c');
      nodes = addEdge(nodes, 'b', 'c');

      let data = pruneFromNode(nodes, 'c');

      assert.equal(
        data.nodes,
        Map({
          a: Node({name: 'a'}),
          b: Node({name: 'b'})
        })
      );

      assert.deepEqual(
        data.pruned,
        ['c']
      );
    });
    it('should be able to ignore nodes when pruning nodes', () => {
      let nodes = Map({
        a: Node({name: 'a'}),
        b: Node({name: 'b'}),
        c: Node({name: 'c'})
      });

      nodes = addEdge(nodes, 'a', 'b');
      nodes = addEdge(nodes, 'b', 'c');

      assert.deepEqual(
        pruneFromNode(nodes, 'a').pruned,
        ['a', 'b', 'c']
      );

      assert.deepEqual(
        pruneFromNode(nodes, 'a', ['b']).pruned,
        ['a']
      );

      assert.deepEqual(
        pruneFromNode(nodes, 'a', ['c']).pruned,
        ['a', 'b']
      );

      // Even when specified as an ignored node, calling `pruneFromNode`
      // with the node's name should still prune it (and any dependencies)
      assert.deepEqual(
        pruneFromNode(nodes, 'a', ['a']).pruned,
        ['a', 'b', 'c']
      );
    });
    it('should remove the node and recursively remove all dependency nodes that lack other dependents', () => {
      const nodes = Map({
        a: Node({dependencies: Set(['b', 'c'])}),
        b: Node({dependencies: Set(['d']), dependents: Set(['a'])}),
        c: Node({dependencies: Set(['d', 'e', 'f']), dependents: Set(['a'])}),
        d: Node({dependencies: Set(['e']), dependents: Set(['b', 'c'])}),
        e: Node({dependents: Set(['c', 'd'])}),
        f: Node({dependencies: Set(['g']), dependents: Set(['c'])}),
        g: Node({dependencies: Set(['d']), dependents: Set(['f'])})
      });

      const data = pruneFromNode(nodes, 'c');
      assert.deepEqual(
        data.pruned,
        ['c', 'f', 'g']
      );

      assert.deepEqual(
        data.nodes,
        Map({
          a: Node({dependencies: Set(['b'])}),
          b: Node({dependencies: Set(['d']), dependents: Set(['a'])}),
          d: Node({dependencies: Set(['e']), dependents: Set(['b'])}),
          e: Node({dependents: Set(['d'])})
        })
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
