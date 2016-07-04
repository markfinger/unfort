'use strict';

const chai = require('chai');
const chaiImmutable = require('chai-immutable');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiImmutable);
chai.use(chaiAsPromised);

chai.config.includeStack = true;

// Occasionally we'll break the promise chain somewhere,
// this picks up those inexplicable silent failures
process.on('unhandledRejection', err => {
  throw err;
});

module.exports = {
  assert: chai.assert
};
