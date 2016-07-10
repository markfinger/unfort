"use strict";

const fs = require('fs');
const BlueBird = require('bluebird');
const {stringToMurmur} = require('../utils/hash');
const {LazyPromise} = require('../utils/lazy_promise');

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
  /**
   * If a file is invalidated while jobs are being performed on it,
   * this method enables promise chains to be unrolled, so that the
   * jobs can restarted with valid data
   */
  ensureFileIsValid(file, job) {
    if (this.files[file.path] !== file) {
      throw new StaleFileIntercept(file.path, job);
    }
  }
  getOrCreateFile(path) {
    let file = this.files[path];
    if (!file) {
      file = new FileObject(path, this.fileSystem);
      this.files[path] = file;
    }
    return file;
  }
  evaluateFileDataProperty(property, path) {
    const file = this.getOrCreateFile(path);
    return file[property]
      .catch(err => {
        this.ensureFileIsValid(file, property);
        return BlueBird.reject(err);
      })
      .then(data => {
        this.ensureFileIsValid(file, property);
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
  invalidateFile(path) {
    this.files[path] = null;
  }
}

class FileObject {
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
    this.textHash = new LazyPromise(() => this.text.then(stringToMurmur));
  }
}

class FileSystemCacheContext {
  constructor(cache) {
    this.dependencies = Object.create(null);
    this.cache = cache;
  }
  getDependency(path) {
    let dependency = this.dependencies[path];
    if (!dependency) {
      dependency = {};
      this.dependencies[path] = dependency;
    }
    return dependency;
  }
  describeDependencies() {
    return this.dependencies;
  }
  isFile(path) {
    return this.cache.isFile(path)
      .then(isFile => {
        this.getDependency(path).isFile = isFile;
        return isFile;
      });
  }
  stat(path) {
    return BlueBird.all([
      this.cache.readModifiedTime(path),
      this.cache.stat(path)
    ])
      .then(data => {
        this.getDependency(path).modifiedTime = data[0];
        return data[1];
      });
  }
  readModifiedTime(path) {
    return this.cache.readModifiedTime(path)
      .then(modifiedTime => {
        this.getDependency(path).modifiedTime = modifiedTime;
        return modifiedTime;
      });
  }
  readText(path) {
    return BlueBird.all([
      this.cache.readTextHash(path),
      this.cache.readText(path)
    ])
      .then(data => {
        this.getDependency(path).textHash = data[0];
        return data[1];
      });
  }
  readTextHash(path) {
    return this.cache.readTextHash(path)
      .then(textHash => {
        this.getDependency(path).textHash = textHash;
        return textHash;
      });
  }
}

function validateFileSystemCacheDependencies(cache, dependencies) {
  const files = Object.keys(dependencies)
    .map(path => {
      const dependency = dependencies[path];
      const jobs = [];
      if ('isFile' in dependency) {
        jobs.push(
          cache.isFile(path)
            .then(isFile => isFile === dependency.isFile)
        );
      }
      if ('modifiedTime' in dependency) {
        jobs.push(
          cache.readModifiedTime(path)
            .then(modifiedTime => modifiedTime === dependency.modifiedTime)
        );
      }
      if ('textHash' in dependency) {
        jobs.push(
          cache.readTextHash(path)
            .then(textHash => textHash === dependency.textHash)
        );
      }
      return BlueBird.all(jobs)
        .then(checks => checks.every(value => value === true));
    });
  return BlueBird.all(files)
    .then(valid => valid.every(value => value === true));
}

module.exports = {
  StaleFileIntercept,
  FileSystemCache,
  FileSystemCacheContext,
  FileObject,
  validateFileSystemCacheDependencies
};