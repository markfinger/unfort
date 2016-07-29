"use strict";

const {difference} = require('lodash/array');
const imm = require('immutable');
const test = require('ava');
const {Node, addNode, removeNode, addEdge, removeEdge, findNodesDisconnectedFromEntryNodes} = require('../node');
const {createNodesFromNotation} = require('../utils');

test('Node should have id, dependencies and dependents properties', (t) => {
  const node = Node({
    id: 'test'
  });
  t.is(node.id, 'test');
  t.truthy(node.dependencies instanceof imm.Set);
  t.truthy(node.dependents instanceof imm.Set);
});

test('addNode should return a immutable Map containing the specified key and a Node instance', (t) => {
  let nodes = imm.Map();
  nodes = addNode(nodes, 'test');
  t.truthy(
    imm.is(nodes, imm.Map({test: Node({id: 'test'})}))
  );
});

test('addNode should throw if a node already exists', (t) => {
  const nodes = imm.Map({test: Node()});
  t.throws(
    () => addNode(nodes, 'test'),
    'Node "test" already exists'
  );
});

test('removeNode should return a imm.Map without the specified key', (t) => {
  let nodes = imm.Map({test: Node()});
  nodes = removeNode(nodes, 'test');
  t.truthy(imm.is(
    nodes,
    imm.Map()
  ));
});

test('removeNode should throw if a node does not already exist', (t) => {
  const nodes = imm.Map();
  t.throws(
    () => removeNode(nodes, 'test'),
    'Node "test" does not exist'
  );
});

test('should return a map with the respective nodes updated', (t) => {
  const nodes = createNodesFromNotation(`
    a
    b
  `);
  const withEdge = addEdge(nodes, 'a', 'b');
  t.truthy(imm.is(
    withEdge,
    createNodesFromNotation('a -> b')
  ));
});

test('should throw if the node ids are the same', (t) => {
  t.throws(
    () => addEdge(imm.Map(), 'foo', 'foo'),
    'Edges must point to two different nodes. Cannot add an edge from "foo" to itself'
  );
});

test('should throw if either node does not already exist', (t) => {
  let nodes = imm.Map();

  t.throws(
    () => addEdge(nodes, 'foo', 'bar'),
    'Cannot add edge from "foo" -> "bar" as "foo" has not been defined'
  );
  nodes = imm.Map({foo: Node()});
  t.throws(
    () => addEdge(nodes, 'foo', 'bar'),
    'Cannot add edge from "foo" -> "bar" as "bar" has not been defined'
  );
});

test('removeEdge should return a map without the specified edge', (t) => {
  let nodes = createNodesFromNotation('a -> b');
  nodes = removeEdge(nodes, 'a', 'b');
  t.truthy(imm.is(
    nodes,
    createNodesFromNotation(`
      a
      b
    `)
  ));
});

test('removeEdge should throw if either node does not already exist', (t) => {
  let nodes = imm.Map();
  t.throws(
    () => removeEdge(nodes, 'foo', 'bar'),
    'Cannot remove edge from "foo" -> "bar" as "foo" has not been defined'
  );
  nodes = imm.Map({foo: Node({id: 'foo'})});
  t.throws(
    () => removeEdge(nodes, 'foo', 'bar'),
    'Cannot remove edge from "foo" -> "bar" as "bar" has not been defined'
  );
});

test('findNodesDisconnectedFromEntryNodes should return all nodes if there no entry nodes', (t) => {
  const nodes = createNodesFromNotation(`
    a -> b -> c
    d -> c
  `);
  const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes, []);
  const expected = ['a', 'b', 'c', 'd'];
  t.deepEqual(
    difference(disconnectedNodes, expected),
    []
  );
});

test('findNodesDisconnectedFromEntryNodes should list all dependents of an entry node that are not indirect dependencies of the entry', (t) => {
  const nodes = createNodesFromNotation(`
    a -> b -> c
    d -> c
  `);
  const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes, ['d']);
  const expected = ['a', 'b'];
  t.deepEqual(
    difference(disconnectedNodes, expected),
    []
  );
});

test('findNodesDisconnectedFromEntryNodes should list all nodes which are disconnected from the entry nodes', (t) => {
  const nodes = createNodesFromNotation(`
    a
    b
    c -> d
  `);
  const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes, ['a', 'b']);
  const expected = ['c', 'd'];
  t.deepEqual(
    difference(disconnectedNodes, expected),
    []
  );
});

test('findNodesDisconnectedFromEntryNodes should return an empty list if all nodes are connected to an entry', (t) => {
  const nodes = createNodesFromNotation(`
    a -> b -> c
  `);
  const disconnectedNodes = findNodesDisconnectedFromEntryNodes(nodes, ['a']);
  t.deepEqual(disconnectedNodes, []);
});
