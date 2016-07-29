"use strict";

const imm = require('immutable');
const test = require('ava');
const {Node} = require('../node');
const {createNodesFromNotation} = require('../utils');

test('createNodesFromNotation should create a single node', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation('a'),
    imm.Map({a: Node({id: 'a'})})
  ));
});

test('should create two nodes with an edge', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation('a -> b'),
    imm.Map({
      a: Node({id: 'a', dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a'])})
    })
  ));
});

test('should create three nodes with two edges', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation('a -> b -> c'),
    imm.Map({
      a: Node({id: 'a', dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a']), dependencies: imm.Set(['c'])}),
      c: Node({id: 'c', dependents: imm.Set(['b'])})
    })
  ));
});

test('should handle multiple lines', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b
      b -> c
      c -> a
    `),
    imm.Map({
      a: Node({id: 'a', dependents: imm.Set(['c']), dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a']), dependencies: imm.Set(['c'])}),
      c: Node({id: 'c', dependents: imm.Set(['b']), dependencies: imm.Set(['a'])})
    })
  ));
});

test('should handle multiple empty lines', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b


      b -> a
    `),
    imm.Map({
      a: Node({id: 'a', dependents: imm.Set(['b']), dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a']), dependencies: imm.Set(['a'])})
    })
  ));
});

test('should handle circular definitions 1', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b -> a
    `),
    imm.Map({
      a: Node({id: 'a', dependents: imm.Set(['b']), dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a']), dependencies: imm.Set(['a'])})
    })
  ));
});

test('should handle circular definitions 2', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b
      b -> c
      c -> b
    `),
    imm.Map({
      a: Node({id: 'a', dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a', 'c']), dependencies: imm.Set(['c'])}),
      c: Node({id: 'c', dependents: imm.Set(['b']), dependencies: imm.Set(['b'])})
    })
  ));
});

test('should handle circular definitions 2', (t) => {
  t.truthy(imm.is(
    createNodesFromNotation(`
      a -> b -> c -> b
    `),
    imm.Map({
      a: Node({id: 'a', dependencies: imm.Set(['b'])}),
      b: Node({id: 'b', dependents: imm.Set(['a', 'c']), dependencies: imm.Set(['c'])}),
      c: Node({id: 'c', dependents: imm.Set(['b']), dependencies: imm.Set(['b'])})
    })
  ));
});
