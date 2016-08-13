"use strict";
const lodash_1 = require('lodash');
const imm = require('immutable');
const ava_1 = require('ava');
const node_1 = require('../node');
const utils_1 = require('../utils');
ava_1.default('addNode should return a immutable Map containing the specified key and a Node instance', (t) => {
    let nodes = imm.Map();
    nodes = node_1.addNode(nodes, 'test');
    t.truthy(imm.is(nodes, imm.Map({
        test: imm.Map({
            id: 'test',
            dependents: imm.Set(),
            dependencies: imm.Set()
        })
    })));
});
ava_1.default('addNode should throw if a node already exists', (t) => {
    const nodes = imm.Map({ test: imm.Map() });
    t.throws(() => node_1.addNode(nodes, 'test'), 'Node "test" already exists');
});
ava_1.default('removeNode should return a imm.Map without the specified key', (t) => {
    let nodes = imm.Map({ test: imm.Map() });
    nodes = node_1.removeNode(nodes, 'test');
    t.truthy(imm.is(nodes, imm.Map()));
});
ava_1.default('removeNode should throw if a node does not already exist', (t) => {
    const nodes = imm.Map();
    t.throws(() => node_1.removeNode(nodes, 'test'), 'Node "test" does not exist');
});
ava_1.default('should return a map with the respective nodes updated', (t) => {
    const nodes = utils_1.createNodesFromNotation(`
    a
    b
  `);
    const withEdge = node_1.addEdge(nodes, 'a', 'b');
    t.truthy(imm.is(withEdge, utils_1.createNodesFromNotation('a -> b')));
});
ava_1.default('should throw if the node ids are the same', (t) => {
    t.throws(() => node_1.addEdge(imm.Map(), 'foo', 'foo'), 'Edges must point to two different nodes. Cannot add an edge from "foo" to itself');
});
ava_1.default('should throw if either node does not already exist', (t) => {
    let nodes = imm.Map();
    t.throws(() => node_1.addEdge(nodes, 'foo', 'bar'), 'Cannot add edge from "foo" -> "bar" as "foo" has not been defined');
    nodes = imm.Map({ foo: imm.Map() });
    t.throws(() => node_1.addEdge(nodes, 'foo', 'bar'), 'Cannot add edge from "foo" -> "bar" as "bar" has not been defined');
});
ava_1.default('removeEdge should return a map without the specified edge', (t) => {
    let nodes = utils_1.createNodesFromNotation('a -> b');
    nodes = node_1.removeEdge(nodes, 'a', 'b');
    t.truthy(imm.is(nodes, utils_1.createNodesFromNotation(`
      a
      b
    `)));
});
ava_1.default('removeEdge should throw if either node does not already exist', (t) => {
    let nodes = imm.Map();
    t.throws(() => node_1.removeEdge(nodes, 'foo', 'bar'), 'Cannot remove edge from "foo" -> "bar" as "foo" has not been defined');
    nodes = imm.Map({ foo: imm.Map({ id: 'foo' }) });
    t.throws(() => node_1.removeEdge(nodes, 'foo', 'bar'), 'Cannot remove edge from "foo" -> "bar" as "bar" has not been defined');
});
ava_1.default('findNodesDisconnectedFromEntryNodes should return all nodes if there no entry nodes', (t) => {
    const nodes = utils_1.createNodesFromNotation(`
    a -> b -> c
    d -> c
  `);
    const disconnectedNodes = node_1.findNodesDisconnectedFromEntryNodes(nodes, []);
    const expected = ['a', 'b', 'c', 'd'];
    t.deepEqual(lodash_1.difference(disconnectedNodes, expected), []);
});
ava_1.default('findNodesDisconnectedFromEntryNodes should list all dependents of an entry node that are not indirect dependencies of the entry', (t) => {
    const nodes = utils_1.createNodesFromNotation(`
    a -> b -> c
    d -> c
  `);
    const disconnectedNodes = node_1.findNodesDisconnectedFromEntryNodes(nodes, ['d']);
    const expected = ['a', 'b'];
    t.deepEqual(lodash_1.difference(disconnectedNodes, expected), []);
});
ava_1.default('findNodesDisconnectedFromEntryNodes should list all nodes which are disconnected from the entry nodes', (t) => {
    const nodes = utils_1.createNodesFromNotation(`
    a
    b
    c -> d
  `);
    const disconnectedNodes = node_1.findNodesDisconnectedFromEntryNodes(nodes, ['a', 'b']);
    const expected = ['c', 'd'];
    t.deepEqual(lodash_1.difference(disconnectedNodes, expected), []);
});
ava_1.default('findNodesDisconnectedFromEntryNodes should return an empty list if all nodes are connected to an entry', (t) => {
    const nodes = utils_1.createNodesFromNotation(`
    a -> b -> c
  `);
    const disconnectedNodes = node_1.findNodesDisconnectedFromEntryNodes(nodes, ['a']);
    t.deepEqual(disconnectedNodes, []);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9ub2RlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdF9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSx5QkFBMkIsUUFBUSxDQUFDLENBQUE7QUFDcEMsTUFBWSxHQUFHLFdBQU0sV0FBVyxDQUFDLENBQUE7QUFDakMsc0JBQWlCLEtBQUssQ0FBQyxDQUFBO0FBQ3ZCLHVCQUE4RixTQUFTLENBQUMsQ0FBQTtBQUN4Ryx3QkFBd0MsVUFBVSxDQUFDLENBQUE7QUFFbkQsYUFBSSxDQUFDLHdGQUF3RixFQUFFLENBQUMsQ0FBQztJQUMvRixJQUFJLEtBQUssR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDdEIsS0FBSyxHQUFHLGNBQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDL0IsQ0FBQyxDQUFDLE1BQU0sQ0FDTixHQUFHLENBQUMsRUFBRSxDQUNKLEtBQUssRUFDTCxHQUFHLENBQUMsR0FBRyxDQUFDO1FBQ04sSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUM7WUFDWixFQUFFLEVBQUUsTUFBTTtZQUNWLFVBQVUsRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFO1lBQ3JCLFlBQVksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFO1NBQ3hCLENBQUM7S0FDSCxDQUFDLENBQ0gsQ0FDRixDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMsK0NBQStDLEVBQUUsQ0FBQyxDQUFDO0lBQ3RELE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFDLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUMsTUFBTSxDQUNOLE1BQU0sY0FBTyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsRUFDNUIsNEJBQTRCLENBQzdCLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyw4REFBOEQsRUFBRSxDQUFDLENBQUM7SUFDckUsSUFBSSxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUMsQ0FBQyxDQUFDO0lBQ3ZDLEtBQUssR0FBRyxpQkFBVSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNsQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQ2IsS0FBSyxFQUNMLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FDVixDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQywwREFBMEQsRUFBRSxDQUFDLENBQUM7SUFDakUsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3hCLENBQUMsQ0FBQyxNQUFNLENBQ04sTUFBTSxpQkFBVSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsRUFDL0IsNEJBQTRCLENBQzdCLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyx1REFBdUQsRUFBRSxDQUFDLENBQUM7SUFDOUQsTUFBTSxLQUFLLEdBQUcsK0JBQXVCLENBQUM7OztHQUdyQyxDQUFDLENBQUM7SUFDSCxNQUFNLFFBQVEsR0FBRyxjQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQ2IsUUFBUSxFQUNSLCtCQUF1QixDQUFDLFFBQVEsQ0FBQyxDQUNsQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQywyQ0FBMkMsRUFBRSxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDLE1BQU0sQ0FDTixNQUFNLGNBQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUN0QyxrRkFBa0YsQ0FDbkYsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBSSxDQUFDLG9EQUFvRCxFQUFFLENBQUMsQ0FBQztJQUMzRCxJQUFJLEtBQUssR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFdEIsQ0FBQyxDQUFDLE1BQU0sQ0FDTixNQUFNLGNBQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUNsQyxtRUFBbUUsQ0FDcEUsQ0FBQztJQUNGLEtBQUssR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBQyxDQUFDLENBQUM7SUFDbEMsQ0FBQyxDQUFDLE1BQU0sQ0FDTixNQUFNLGNBQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUNsQyxtRUFBbUUsQ0FDcEUsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBSSxDQUFDLDJEQUEyRCxFQUFFLENBQUMsQ0FBQztJQUNsRSxJQUFJLEtBQUssR0FBRywrQkFBdUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QyxLQUFLLEdBQUcsaUJBQVUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FDYixLQUFLLEVBQ0wsK0JBQXVCLENBQUM7OztLQUd2QixDQUFDLENBQ0gsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFJLENBQUMsK0RBQStELEVBQUUsQ0FBQyxDQUFDO0lBQ3RFLElBQUksS0FBSyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUN0QixDQUFDLENBQUMsTUFBTSxDQUNOLE1BQU0saUJBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUNyQyxzRUFBc0UsQ0FDdkUsQ0FBQztJQUNGLEtBQUssR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBQyxFQUFFLEVBQUUsS0FBSyxFQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7SUFDN0MsQ0FBQyxDQUFDLE1BQU0sQ0FDTixNQUFNLGlCQUFVLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsRUFDckMsc0VBQXNFLENBQ3ZFLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyxxRkFBcUYsRUFBRSxDQUFDLENBQUM7SUFDNUYsTUFBTSxLQUFLLEdBQUcsK0JBQXVCLENBQUM7OztHQUdyQyxDQUFDLENBQUM7SUFDSCxNQUFNLGlCQUFpQixHQUFHLDBDQUFtQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN6RSxNQUFNLFFBQVEsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxTQUFTLENBQ1QsbUJBQVUsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsRUFDdkMsRUFBRSxDQUNILENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyxpSUFBaUksRUFBRSxDQUFDLENBQUM7SUFDeEksTUFBTSxLQUFLLEdBQUcsK0JBQXVCLENBQUM7OztHQUdyQyxDQUFDLENBQUM7SUFDSCxNQUFNLGlCQUFpQixHQUFHLDBDQUFtQyxDQUFDLEtBQUssRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDNUUsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDNUIsQ0FBQyxDQUFDLFNBQVMsQ0FDVCxtQkFBVSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxFQUN2QyxFQUFFLENBQ0gsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBSSxDQUFDLHVHQUF1RyxFQUFFLENBQUMsQ0FBQztJQUM5RyxNQUFNLEtBQUssR0FBRywrQkFBdUIsQ0FBQzs7OztHQUlyQyxDQUFDLENBQUM7SUFDSCxNQUFNLGlCQUFpQixHQUFHLDBDQUFtQyxDQUFDLEtBQUssRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzVCLENBQUMsQ0FBQyxTQUFTLENBQ1QsbUJBQVUsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsRUFDdkMsRUFBRSxDQUNILENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGFBQUksQ0FBQyx3R0FBd0csRUFBRSxDQUFDLENBQUM7SUFDL0csTUFBTSxLQUFLLEdBQUcsK0JBQXVCLENBQUM7O0dBRXJDLENBQUMsQ0FBQztJQUNILE1BQU0saUJBQWlCLEdBQUcsMENBQW1DLENBQUMsS0FBSyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM1RSxDQUFDLENBQUMsU0FBUyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQ3JDLENBQUMsQ0FBQyxDQUFDIn0=