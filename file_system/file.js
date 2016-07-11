"use strict";

const BlueBird = require('bluebird');
const {generateStringHash} = require('../utils/hash');

class File {
  constructor(path, fileSystem) {
    this.path = path;
    this.fileSystem = fileSystem;
  }
  get stat() {
    if (!this._stat) {
      this._stat = this.fileSystem.stat(this.path);
    }
    return this._stat;
  }
  set stat(stat) {
    this._stat = BlueBird.resolve(stat);
    // Force re-evaluation of the modified time
    this._modifiedTime = null;
    return stat;
  }
  get modifiedTime() {
    if (!this._modifiedTime) {
      this._modifiedTime = this.stat
        .then(stat => stat.mtime.getTime());
    }
    return this._modifiedTime;
  }
  set modifiedTime(modifiedTime) {
    this._modifiedTime = BlueBird.resolve(modifiedTime);
    return modifiedTime;
  }
  get isFile() {
    if (!this._isFile) {
      this._isFile = this.stat
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
  set isFile(isFile) {
    this._isFile = BlueBird.resolve(isFile);
    return isFile;
  }
  get text() {
    if (!this._text) {
      this._text = this.fileSystem.readFile(this.path, 'utf8');
    }
    return this._text;
  }
  set text(text) {
    this._text = BlueBird.resolve(text);
    // Force re-evaluation of the text's hash
    this._textHash = null;
    return text;
  }
  get textHash() {
    if (!this._textHash) {
      this._textHash = this.text.then(generateStringHash);
    }
    return this._textHash;
  }
  set textHash(textHash) {
    this._textHash = BlueBird.resolve(textHash);
    return textHash;
  }
}

module.exports = {
  File
};