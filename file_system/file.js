"use strict";

const BlueBird = require('bluebird');
const {generateStringHash} = require('../utils/hash');

class File {
  constructor(path, fileSystem) {
    this.path = path;
    this.fileSystem = fileSystem;
  }
  getStat() {
    if (!this._stat) {
      this._stat = this.fileSystem.stat(this.path);
    }
    return this._stat;
  }
  getModifiedTime() {
    if (!this._modifiedTime) {
      this._modifiedTime = this.getStat()
        .then(stat => stat.mtime.getTime());
    }
    return this._modifiedTime;
  }
  getIsFile() {
    if (!this._isFile) {
      this._isFile = this.getStat()
        .then(stat => stat.isFile())
        .catch(err => {
          if (err.code === 'ENOENT') {
            return false;
          }
          return BlueBird.reject(err);
        });
    }
    return this._isFile;
  }
  getBuffer() {
    if (!this._buffer) {
      this._buffer = this.fileSystem.readFile(this.path);
    }
    return this._buffer;
  }
  getText() {
    if (!this._text) {
      // Rather than read this file's buffer, we invoke the file system
      // directly. This does suggest that in certain edge-cases a file
      // may be read twice, but in most cases this will help to reduce
      // memory as we only store one copy of the file's contents
      this._text = this.fileSystem.readFile(this.path, 'utf8');
    }
    return this._text;
  }
  getTextHash() {
    if (!this._textHash) {
      this._textHash = this.getText().then(generateStringHash);
    }
    return this._textHash;
  }
}

module.exports = {
  File
};