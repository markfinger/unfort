"use strict";

const fs = require('fs');
const BlueBird = require('bluebird');
const {File} = require('./file');

const defaultReadFile = BlueBird.promisify(fs.readFile);
const defaultStat = BlueBird.promisify(fs.stat);

class StaleFileIntercept extends Error {
  constructor(path, job) {
    super();
    this.message = `File "${path}" was intercepted for job "${job}" as the reference was invalidated during processing`;
  }
}

class FileSystemCache {
  constructor(fileSystem={}) {
    this.files = Object.create(null);
    this.fileSystem = {
      readFile: fileSystem.readFile || defaultReadFile,
      stat: fileSystem.stat || defaultStat
    };
    // TODO expose event buses for exposing incoming data
  }
  invalidateFile(path) {
    if (this.files[path]) {
      this.files[path] = null;
    }
  }
  isFile(path) {
    return this._evaluateFileMethod('getIsFile', path);
  }
  stat(path) {
    return this._evaluateFileMethod('getStat', path);
  }
  readModifiedTime(path) {
    return this._evaluateFileMethod('getModifiedTime', path);
  }
  readBuffer(path) {
    return this._evaluateFileMethod('getBuffer', path);
  }
  readText(path) {
    return this._evaluateFileMethod('getText', path);
  }
  readTextHash(path) {
    return this._evaluateFileMethod('getTextHash', path);
  }
  _getOrCreateFile(path) {
    let file = this.files[path];
    if (!file) {
      file = new File(path, this.fileSystem);
      this.files[path] = file;
    }
    return file;
  }
  _evaluateFileMethod(methodName, path) {
    const file = this._getOrCreateFile(path);
    return file[methodName]()
      .catch(err => {
        this._ensureFileIsValid(file, methodName);
        return BlueBird.reject(err);
      })
      .then(data => {
        this._ensureFileIsValid(file, methodName);
        return data;
      });
  }
  /**
   * If a file is invalidated while jobs are being performed on it,
   * this method enables promise chains to be unrolled, so that the
   * jobs can restarted with valid data
   */
  _ensureFileIsValid(file, job) {
    if (this.files[file.path] !== file) {
      throw new StaleFileIntercept(file.path, job);
    }
  }
}

module.exports = {
  StaleFileIntercept,
  FileSystemCache
};