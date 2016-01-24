import {first, last} from 'lodash/array';
import {Record, Map, is} from 'immutable';

export const Diff = Record({
  from: null,
  to: null
});

export function mergeDiffs(...diffs) {
  // For now, this just creates a new diff from the first and last,
  // but it may do more later if/when our needs change
  return Diff({
    from: first(diffs).from,
    to: last(diffs).to
  });
}

export function getNewNodesFromDiff(diff) {
  const from = diff.from;
  const to = diff.to;

  const newNodes = [];
  to.forEach((value, key) => {
    if (!from.has(key)) {
      newNodes.push(key);
    }
  });

  return newNodes;
}

export function getPrunedNodesFromDiff(diff) {
  const from = diff.from;
  const to = diff.to;

  const prunedNodes = [];
  from.forEach((value, key) => {
    if (!to.has(key)) {
      prunedNodes.push(key);
    }
  });

  return prunedNodes;
}

export function getChangedNodes(diff) {
  const from = diff.from;
  const to = diff.to;

  const changedNodes = [];
  to.forEach((toValue, key) => {
    const fromValue = from.get(key);
    if (fromValue && !is(toValue, fromValue)) {
      changedNodes.push(key);
    }
  });

  return changedNodes;
}