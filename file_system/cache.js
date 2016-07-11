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
  }
  addFile(path) {
    this._getOrCreateFile(path);
  }
  /**
   * Sets a file's `stat` property. This enables the cache to be
   * pre-populated with data from another system, such as a file
   * crawler or watcher
   */
  addFileStat(path, stat) {
    const file = this._getOrCreateFile(path);
    file.stat = stat;
  }
  hasFile(path) {
    return Boolean(this.files[path]);
  }
  removeFile(path) {
    if (this.files[path]) {
      this.files[path] = null;
    }
  }
  evaluateFileDataProperty(property, path) {
    const file = this._getOrCreateFile(path);
    return file[property]
      .catch(err => {
        this._ensureFileIsValid(file, property);
        return BlueBird.reject(err);
      })
      .then(data => {
        this._ensureFileIsValid(file, property);
        return data;
      });
  }
  isFile(path) {
    return this.evaluateFileDataProperty('isFile', path);
  }
  stat(path) {
    return this.evaluateFileDataProperty('stat', path);
  }
  readModifiedTime(path) {
    return this.evaluateFileDataProperty('modifiedTime', path);
  }
  readText(path) {
    return this.evaluateFileDataProperty('text', path);
  }
  readTextHash(path) {
    return this.evaluateFileDataProperty('textHash', path);
  }
  _getOrCreateFile(path) {
    let file = this.files[path];
    if (!file) {
      file = new File(path, this.fileSystem);
      this.files[path] = file;
    }
    return file;
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