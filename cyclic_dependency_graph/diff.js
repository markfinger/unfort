"use strict";

const {Record, is} = require('immutable');

const Diff = Record({
  from: null,
  to: null
});

module.exports = {
  Diff,
  mergeDiffs,
  getNewNodesFromDiff,
  getPrunedNodesFromDiff,
  getChangedNodes
};

function mergeDiffs(diff1, diff2) {
  // For now, this just creates a new diff from the first and last,
  // but it may do more later if/when our needs change

  return Diff({
    from: diff1.from,
    to: diff2.to
  });
}

function getNewNodesFromDiff(diff) {
  const {from, to} = diff;
  const newNodes = [];

  to.forEach((value, key) => {
    if (!from.has(key)) {
      newNodes.push(key);
    }
  });

  return newNodes;
}

function getPrunedNodesFromDiff(diff) {
  const {from, to} = diff;
  const prunedNodes = [];

  from.forEach((value, key) => {
    if (!to.has(key)) {
      prunedNodes.push(key);
    }
  });

  return prunedNodes;
}

function getChangedNodes(diff) {
  const {from, to} = diff;
  const changedNodes = [];

  to.forEach((value, key) => {
    if (from.has(key) && !is(value, from.get(key))) {
      changedNodes.push(key);
    }
  });

  return changedNodes;
}