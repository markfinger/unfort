"use strict";

const fs = require('fs');
const BlueBird = require('bluebird');
const {generateStringHash} = require('../utils/hash');
const {LazyPromise} = require('../utils/lazy_promise');

class File {
  constructor(path, fileSystem) {
    this.path = path;

    // Lazily-evaluated interactions with the file system
    this.stat = new LazyPromise(() => fileSystem.stat(path));
    this.text = new LazyPromise(() => fileSystem.readFile(path, 'utf8'));

    // Data derived from the file system interactions
    this.modifiedTime = new LazyPromise(() => this.stat.then(stat => stat.mtime.getTime()));
    this.isFile = new LazyPromise(() => {
      return this.stat
        .then(stat => stat.isFile())
        .catch(err => {
          if (err.code === 'ENOENT') {
            return false;
          }
          return BlueBird.reject(err);
        });
    });
    this.textHash = new LazyPromise(() => this.text.then(generateStringHash));
  }
  setStat(stat) {
    this.stat = Promise.resolve(stat);
    this.modifiedTime = Promise.resolve(stat.mtime.getTime());
  }
}

module.exports = {
  File
};