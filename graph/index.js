'use strict';

const EventEmitter = require('events');
const {Record, Map, Set, List} = require('immutable');

const GraphState = Record({
  errors: List(),
  pendingAssets: Set(),
  assetsByFile: Map(),
  assetsByUrl: Map()
});

module.exports = {
  createGraph
};

function createGraph({initialState}) {
  const events = new EventEmitter();
  let state = initialState || GraphState();

  function getState() {
    return state;
  }

  function assetCompleted(asset) {
    state = handleAssetCompleted(state, asset);

    if (state.pendingAssets.size === 0) {
      events.emit('graph:end');
    }
  }

  function signalIfStarting() {
    if (state.pendingAssets.size === 0) {
      events.emit('graph:start');
    }
  }

  function getOrCreateAssetByFile(file) {
    let asset = state.assetsByFile.get(file);
    if (asset) {
      return asset;
    }

    signalIfStarting();
    asset = createAsset(state).set('file', file);
    state = state.set('assetsByFile', state.assetsByFile.set(file, asset));

    return asset;
  }

  function addDependency(from, to) {

  }

  return {
    events,
    getOrCreateAssetByFile,
    getState,
    assetCompleted
  }
}

function createAsset() {
  return Map({
    _reference: {}
  });
}

function handleAssetCompleted(state, asset) {
  const _reference = asset.get('_reference');
  if (!state.pendingAssets.has(asset._reference)) {
    return;
  }

  const patches = {};

  const file = asset.get('file');
  if (file) {
    return patches.assetsByFile = state.assetsByFile.set(file, asset);
  }

  const url = asset.get('url');
  if (url) {
    return patches.assetsByUrl = state.assetsByUrl.set(url, asset);
  }

  return state.merge(patches);
}
