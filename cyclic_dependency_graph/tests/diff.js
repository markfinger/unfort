// const {assert} = require('../../utils/assert');
// const {Diff, mergeDiffs, getNewNodesFromDiff, getPrunedNodesFromDiff, getChangedNodes} = require('../diff');
// const {createNodesFromNotation} = require('../utils');
//
// describe('cyclic_dependency_graph/diff', () => {
//   describe('#Diff', () => {
//     it('should have `to` and `from` properties', () => {
//       const diff = Diff();
//
//       assert.isNull(diff.from);
//       assert.isNull(diff.to);
//     });
//     it('should accept overrides for its properties', () => {
//       const diff = Diff({
//         from: 'from',
//         to: 'to'
//       });
//
//       assert.equal(diff.from, 'from');
//       assert.equal(diff.to, 'to');
//     });
//   });
//   describe('#mergeDiffs', () => {
//     it('should accept a number of Diff records and merge the changes', () => {
//       const mergedDiff = mergeDiffs(
//         Diff({from: 'from1', to: 'to1'}),
//         Diff({from: 'from2', to: 'to2'})
//       );
//
//       assert.equal(mergedDiff.from, 'from1');
//       assert.equal(mergedDiff.to, 'to2');
//     });
//   });
//   describe('#getNewNodesFromDiff', () => {
//     it('should return an array of names representing the newly added nodes', () => {
//       const diff = Diff({
//         from: createNodesFromNotation(`
//           a -> b
//         `),
//         to: createNodesFromNotation(`
//           b
//           c -> b
//           d
//         `)
//       });
//
//       assert.deepEqual(
//         getNewNodesFromDiff(diff),
//         ['c', 'd']
//       );
//     });
//   });
//   describe('#getPrunedNodesFromDiff', () => {
//     it('should return an array of names representing the pruned nodes', () => {
//       const diff = Diff({
//         from: createNodesFromNotation(`
//           a -> b
//           c
//           d
//         `),
//         to: createNodesFromNotation(`
//           d -> b
//         `)
//       });
//
//       assert.deepEqual(
//         getPrunedNodesFromDiff(diff),
//         ['a', 'c']
//       );
//     });
//   });
//   describe('#getChangedNodes', () => {
//     it('should return an array of names representing the nodes that are different in the two maps', () => {
//       const diff = Diff({
//         from: createNodesFromNotation(`
//           a -> b
//           c -> d
//           e
//         `),
//         to: createNodesFromNotation(`
//           a -> b -> c -> d
//         `)
//       });
//
//       assert.deepEqual(
//         getChangedNodes(diff),
//         ['b', 'c']
//       );
//     });
//   });
// });
