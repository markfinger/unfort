const {Map, OrderedSet} = require('immutable');
const {assert} = require('../../utils/assert');
const {Node} = require('../node');
const {createNodesFromNotation, resolveExecutionOrder} = require('../utils');

describe('cyclic_dependency_graph/utils', () => {
  describe('#createNodesFromNotation', () => {
    it('should create a single node', () => {
      assert.equal(
        createNodesFromNotation('a'),
        Map({a: Node({name: 'a'})})
      );
    });
    it('should create two nodes with an edge', () => {
      assert.equal(
        createNodesFromNotation('a -> b'),
        Map({
          a: Node({name: 'a', dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a'])})
        })
      );
    });
    it('should create three nodes with two edges', () => {
      assert.equal(
        createNodesFromNotation('a -> b -> c'),
        Map({
          a: Node({name: 'a', dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a']), dependencies: OrderedSet(['c'])}),
          c: Node({name: 'c', dependents: OrderedSet(['b'])})
        })
      );
    });
    it('should handle multiple lines', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b
          b -> c
          c -> a
        `),
        Map({
          a: Node({name: 'a', dependents: OrderedSet(['c']), dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a']), dependencies: OrderedSet(['c'])}),
          c: Node({name: 'c', dependents: OrderedSet(['b']), dependencies: OrderedSet(['a'])})
        })
      );
    });
    it('should handle multiple empty lines', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b


          b -> a
        `),
        Map({
          a: Node({name: 'a', dependents: OrderedSet(['b']), dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a']), dependencies: OrderedSet(['a'])})
        })
      );
    });
    it('should handle circular definitions 1', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b -> a
        `),
        Map({
          a: Node({name: 'a', dependents: OrderedSet(['b']), dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a']), dependencies: OrderedSet(['a'])})
        })
      );
    });
    it('should handle circular definitions 2', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b
          b -> c
          c -> b
        `),
        Map({
          a: Node({name: 'a', dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a', 'c']), dependencies: OrderedSet(['c'])}),
          c: Node({name: 'c', dependents: OrderedSet(['b']), dependencies: OrderedSet(['b'])})
        })
      );
    });
    it('should handle circular definitions 2', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b -> c -> b
        `),
        Map({
          a: Node({name: 'a', dependencies: OrderedSet(['b'])}),
          b: Node({name: 'b', dependents: OrderedSet(['a', 'c']), dependencies: OrderedSet(['c'])}),
          c: Node({name: 'c', dependents: OrderedSet(['b']), dependencies: OrderedSet(['b'])})
        })
      );
    });
  });
  describe('#resolveExecutionOrder', () => {
    it('should produce an order that reverses the edges', () => {
      const nodes = createNodesFromNotation(`
        a -> b -> c
      `);
      const order = resolveExecutionOrder(nodes, ['a']);
      assert.deepEqual(order, ['c', 'b', 'a']);
    });
    it('should ignore circular dependencies', () => {
      const nodes = createNodesFromNotation(`
        a -> b -> a
        b -> c -> b
        c -> a
      `);
      const order = resolveExecutionOrder(nodes, ['a']);
      assert.deepEqual(order, ['c', 'b', 'a']);
    });
  });
});
