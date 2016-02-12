import {Map, List, Set} from 'immutable';
import {Node} from '../node';
import {createNodesFromNotation, resolveExecutionOrder} from '../utils';
import {assert} from '../../utils/assert';

describe('cyclic-dependency-graph/utils', () => {
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
          a: Node({name: 'a', dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a'])})
        })
      );
    });
    it('should create three nodes with two edges', () => {
      assert.equal(
        createNodesFromNotation('a -> b -> c'),
        Map({
          a: Node({name: 'a', dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a']), dependencies: Set(['c'])}),
          c: Node({name: 'c', dependents: Set(['b'])})
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
          a: Node({name: 'a', dependents: Set(['c']), dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a']), dependencies: Set(['c'])}),
          c: Node({name: 'c', dependents: Set(['b']), dependencies: Set(['a'])})
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
          a: Node({name: 'a', dependents: Set(['b']), dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a']), dependencies: Set(['a'])})
        })
      );
    });
    it('should handle circular definitions 1', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b -> a
        `),
        Map({
          a: Node({name: 'a', dependents: Set(['b']), dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a']), dependencies: Set(['a'])})
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
          a: Node({name: 'a', dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a', 'c']), dependencies: Set(['c'])}),
          c: Node({name: 'c', dependents: Set(['b']), dependencies: Set(['b'])})
        })
      );
    });
    it('should handle circular definitions 2', () => {
      assert.equal(
        createNodesFromNotation(`
          a -> b -> c -> b
        `),
        Map({
          a: Node({name: 'a', dependencies: Set(['b'])}),
          b: Node({name: 'b', dependents: Set(['a', 'c']), dependencies: Set(['c'])}),
          c: Node({name: 'c', dependents: Set(['b']), dependencies: Set(['b'])})
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
