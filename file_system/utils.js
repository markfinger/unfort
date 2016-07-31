const Promise = require('bluebird');
const fs = require('fs');

// We used hand-rolled promise versions of the fs methods as they
// are much, much faster than bluebird's `promisify` function

function readFile(path, options) {
  return new Promise((res, rej) => {
    fs.readFile(path, options, (err, data) => {
      if (err) return rej(err);
      res(data);
    });
  });
}

function stat(path) {
  return new Promise((res, rej) => {
    fs.stat(path, (err, data) => {
      if (err) return rej(err);
      res(data);
    });
  });
}

module.exports = {
  readFile,
  stat
};