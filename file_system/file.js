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
  setStat(stat) {
    this._stat = BlueBird.resolve(stat);
    // Force re-evaluation of the modified time
    this._modifiedTime = null;
    return stat;
  }
  getModifiedTime() {
    if (!this._modifiedTime) {
      this._modifiedTime = this.getStat()
        .then(stat => stat.mtime.getTime());
    }
    return this._modifiedTime;
  }
  setModifiedTime(modifiedTime) {
    this._modifiedTime = BlueBird.resolve(modifiedTime);
    return modifiedTime;
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
  setIsFile(isFile) {
    this._isFile = BlueBird.resolve(isFile);
    return isFile;
  }
  getBuffer() {
    if (!this._buffer) {
      this._buffer = this.fileSystem.readFile(this.path);
    }
    return this._buffer;
  }
  setBuffer(buffer) {
    this._buffer = BlueBird.resolve(buffer);
    return buffer;
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
  setText(text) {
    this._text = BlueBird.resolve(text);
    // Force re-evaluation of the text's hash
    this._textHash = null;
    return text;
  }
  getTextHash() {
    if (!this._textHash) {
      this._textHash = this.getText().then(generateStringHash);
    }
    return this._textHash;
  }
  setTextHash(textHash) {
    this._textHash = BlueBird.resolve(textHash);
    return textHash;
  }
}

module.exports = {
  File
};