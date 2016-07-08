"use strict";

const {isArray, isString} = require('lodash/lang');
const Murmur = require('imurmurhash');

module.exports = {
  generateCacheKey,
  stringToMurmur
};

function generateCacheKey(data) {
  if (isArray(data)) {
    if (!data.length) {
      throw new Error('Key array does not contain any data');
    }
    return data
      .map(entry => stringToMurmur(entry.toString()))
      .join('_');
  } else if (isString(data)) {
    return stringToMurmur(data);
  } else {
    throw new Error(`Cannot generate cache key for ${data}`);
  }
}

function stringToMurmur(string) {
  const murmur = new Murmur(string).result();
  return murmur.toString();
}