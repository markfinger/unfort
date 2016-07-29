"use strict";

// const EventEmitter = require('events');
// const {Record, Map, Set, List} = require('immutable');
// const {assert} = require('../../../utils/assert');
// const {babelTransform} = require('../babel_transform');
//
// const GraphState = Record({
//   errors: List(),
//   pendingAssets: Set(),
//   assetsByFile: Map(),
//   assetsByUrl: Map()
// });
//
// function createGraph({initialState}) {
//   const events = new EventEmitter();
//   let state = initialState || GraphState();
//
//   function createAsset() {
//     return Map({
//       reference: {}
//     });
//   }
//
//   function getOrCreateAssetByFile(file) {
//     let asset = state.assetsByFile.get(file);
//     if (!asset) {
//       asset = createAsset().set('file', file);
//       state = state.assetsByFile.set(file, asset);
//       state = state.pending.add(asset.get('reference'));
//     }
//     return asset;
//   }
//
//   function assetCompleted(asset) {
//     const reference = asset.get('reference');
//     if (!state.pendingAssets.has(reference)) {
//       return;
//     }
//
//     const patches = {};
//
//     const file = asset.get('file');
//     if (file) {
//       return patches.assetsByFile = state.assetsByFile.set(file, asset);
//     }
//
//     const url = asset.get('url');
//     if (url) {
//       return patches.assetsByUrl = state.assetsByUrl.set(url, asset);
//     }
//
//     const sourceUrl = asset.get('sourceUrl');
//     if (sourceUrl) {
//       return patches.assetsBySourceUrl = state.assetsBySourceUrl.set(sourceUrl, asset);
//     }
//
//     state = state.merge({
//       pendingAssets: state.pendingAssets.delete(reference),
//       assetsByFile: state.assetsByFile.set(file),
//       assetsBySourceUrl: state.sourceUrl.set(file, source)
//     });
//   }
//
//   function isAssetPending(asset) {
//     return state.pendingAssets.has(asset.reference);
//   }
//
//   function invalidateAssetByFile(file) {
//     throw new Error('not implemented');
//   }
//
//   function getState() {
//     return state;
//   }
//
//   return {
//     events,
//     getOrCreateAssetByFile,
//     getState,
//     isAssetPending,
//     assetCompleted,
//     invalidateAssetByFile
//   }
// }
//
// function createPipeline() {
//   return {
//     readFileAsText(file) {
//
//     }
//   }
// }
//
// describe('babel_transform', () => {
//   describe('#babel_transform', () => {
//     const graph = createGraph();
//
//     const assetFile = '/some/file.js';
//     const asset = graph.getOrCreateAssetByFile(assetFile);
//
//     const pipeline = {
//       readFileAsText(file) {
//         assert.equal(file, assetFile);
//         return Promise.resolve('const foo = "foo";');
//       },
//       generateAssetUrl(asset) {
//         return '/some/file-some_hash.js';
//       },
//       generateAssetSourceUrl(asset) {
//         return '/some/file.js';
//       }
//     };
//
//     return babelTransform({graph, pipeline, asset})
//       .then(() => {
//         assert.equal(asset.code, 'const foo = "foo";');
//       });
//   });
// });