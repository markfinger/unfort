"use strict";

const Murmur = require('imurmurhash');

function generateStringHash(string) {
  const murmur = new Murmur(string).result();
  return murmur.toString();
}

module.exports = {
  generateStringHash
};
