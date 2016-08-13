import * as imm from 'immutable';
import test from 'ava';
import {createNodesFromNotation, objectToGraph} from '../utils';

test('createNodesFromNotation createNodesFromNotation should create a single node', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation('a'),
    objectToGraph({a: {id: 'a'}})
  ));
});

test('createNodesFromNotation should create two nodes with an edge', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation('a -> b'),
    objectToGraph({
      a: {id: 'a', dependencies: ['b']},
      b: {id: 'b', dependents: ['a']}
    })
  ));
});

test('createNodesFromNotation should create three nodes with two edges', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation('a -> b -> c'),
    objectToGraph({
      a: ({id: 'a', dependencies: ['b']}),
      b: {id: 'b', dependents: ['a'], dependencies: ['c']},
      c: {id: 'c', dependents: ['b']}
    })
  ));
});

test('createNodesFromNotation should handle multiple lines', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b
      b -> c
      c -> a
    `),
    objectToGraph({
      a: {id: 'a', dependents: ['c'], dependencies: ['b']},
      b: {id: 'b', dependents: ['a'], dependencies: ['c']},
      c: {id: 'c', dependents: ['b'], dependencies: ['a']}
    })
  ));
});

test('createNodesFromNotation should handle multiple empty lines', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b


      b -> a
    `),
    objectToGraph({
      a: {id: 'a', dependents: ['b'], dependencies: ['b']},
      b: {id: 'b', dependents: ['a'], dependencies: ['a']}
    })
  ));
});

test('createNodesFromNotation should handle circular definitions 1', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b -> a
    `),
    objectToGraph({
      a: {id: 'a', dependents: ['b'], dependencies: ['b']},
      b: {id: 'b', dependents: ['a'], dependencies: ['a']}
    })
  ));
});

test('createNodesFromNotation should handle circular definitions 2', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b
      b -> c
      c -> b
    `),
    objectToGraph({
      a: {id: 'a', dependencies: ['b']},
      b: {id: 'b', dependents: ['a', 'c'], dependencies: ['c']},
      c: {id: 'c', dependents: ['b'], dependencies: ['b']}
    })
  ));
});

test('createNodesFromNotation should handle circular definitions 2', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b -> c -> b
    `),
    objectToGraph({
      a: {id: 'a', dependencies: ['b']},
      b: {id: 'b', dependents: ['a', 'c'], dependencies: ['c']},
      c: {id: 'c', dependents: ['b'], dependencies: ['b']}
    })
  ));
});

test('objectToGraph should build the expected graph structure', (t) => {
  const input = {
    a: {id: 'a'},
    b: {id: 'b', dependents: ['a', 'c'], dependencies: ['c']},
    c: {id: 'c', dependencies: ['b']}
  };
  const computed = objectToGraph(input).toJS();
  const expected = {
    a: {id: 'a', dependents: [], dependencies: []},
    b: {id: 'b', dependents: ['a', 'c'], dependencies: ['c']},
    c: {id: 'c', dependents: [], dependencies: ['b']}
  };
  t.deepEqual(expected, computed);
});
