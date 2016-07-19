"use strict";

const BlueBird = require('bluebird');

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
  addIsFileDependency(path) {
    return this.cache.isFile(path)
      .then(isFile => {
        this.getDependency(path).isFile = isFile;
      });
  }
  addModifiedTimeDependency(path) {
    return this.cache.readModifiedTime(path)
      .then(modifiedTime => {
        this.getDependency(path).modifiedTime = modifiedTime;
      });
  }
  addTextHashDependency(path) {
    return this.cache.readTextHash(path)
      .then(textHash => {
        this.getDependency(path).textHash = textHash;
      });
  }
  isFile(path) {
    return BlueBird.all([
      this.cache.isFile(path),
      this.addIsFileDependency(path)
    ])
      .then(data => data[0]);
  }
  stat(path) {
    return BlueBird.all([
      this.cache.stat(path),
      this.addIsFileDependency(path),
      this.addModifiedTimeDependency(path)
    ])
      .then(data => data[0]);
  }
  readModifiedTime(path) {
    return BlueBird.all([
      this.cache.readModifiedTime(path),
      this.addIsFileDependency(path),
      this.addModifiedTimeDependency(path)
    ])
      .then(data => data[0]);
  }
  readBuffer(path) {
    return BlueBird.all([
      this.cache.readBuffer(path),
      this.addIsFileDependency(path),
      this.addModifiedTimeDependency(path)
    ])
      .then(data => data[0]);
  }
  readText(path) {
    return Promise.all([
      this.cache.readText(path),
      this.addIsFileDependency(path),
      // We add a dependency for both the modified time and the
      // text hash as our hashing mechanism (murmur) is designed
      // for performance, not collision resistance
      this.addModifiedTimeDependency(path),
      this.addTextHashDependency(path)
    ])
      .then(data => data[0]);
  }
  readTextHash(path) {
    return BlueBird.all([
      this.cache.readTextHash(path),
      this.addIsFileDependency(path),
      // We add a dependency for both the modified time and the
      // text hash as our hashing mechanism (murmur) is designed
      // for performance, not collision resistance
      this.addModifiedTimeDependency(path),
      this.addTextHashDependency(path)
    ])
      .then(data => data[0]);
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
  FileSystemCacheContext,
  validateFileSystemCacheDependencies
};