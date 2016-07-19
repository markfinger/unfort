"use strict";

const BlueBird = require('bluebird');

class FileSystemScope {
  constructor(cache) {
    this.traps = [];
    this.cache = cache;
  }
  createTrap() {
    const trap = new FileSystemTrap(this.cache);
    this.traps.push(trap);
    return trap;
  }
  getDependenciesFromTrap(trap) {
    return trap.dependencies;
  }
}

class FileSystemTrap {
  constructor(cache) {
    this.cache = cache;
    this.dependencies = Object.create(null);
  }
  // isValid() {
  //   return validateFileSystemCacheDependencies(this.cache, this.dependencies);
  // }
  isFile(path) {
    return BlueBird.all([
      this.cache.isFile(path),
      this._addIsFileDependency(path)
    ])
      .then(data => data[0]);
  }
  stat(path) {
    return BlueBird.all([
      this.cache.stat(path),
      this._addIsFileDependency(path),
      this._addModifiedTimeDependency(path)
    ])
      .then(data => data[0]);
  }
  readModifiedTime(path) {
    return BlueBird.all([
      this.cache.readModifiedTime(path),
      this._addIsFileDependency(path),
      this._addModifiedTimeDependency(path)
    ])
      .then(data => data[0]);
  }
  readBuffer(path) {
    return BlueBird.all([
      this.cache.readBuffer(path),
      this._addIsFileDependency(path),
      this._addModifiedTimeDependency(path)
    ])
      .then(data => data[0]);
  }
  readText(path) {
    return BlueBird.all([
      this.cache.readText(path),
      this._addIsFileDependency(path),
      // We add a dependency for both the modified time and the
      // text hash as our hashing mechanism (murmur) is designed
      // for performance, not collision resistance
      this._addModifiedTimeDependency(path),
      this._addTextHashDependency(path)
    ])
      .then(data => data[0]);
  }
  readTextHash(path) {
    return BlueBird.all([
      this.cache.readTextHash(path),
      this._addIsFileDependency(path),
      // We add a dependency for both the modified time and the
      // text hash as our hashing mechanism (murmur) is designed
      // for performance, not collision resistance
      this._addModifiedTimeDependency(path),
      this._addTextHashDependency(path)
    ])
      .then(data => data[0]);
  }
  _getDependency(path) {
    let dependency = this.dependencies[path];
    if (!dependency) {
      dependency = {};
      this.dependencies[path] = dependency;
    }
    return dependency;
  }
  _addIsFileDependency(path) {
    return this.cache.isFile(path)
      .then(isFile => {
        this._getDependency(path).isFile = isFile;
      });
  }
  _addModifiedTimeDependency(path) {
    return this.cache.readModifiedTime(path)
      .then(modifiedTime => {
        this._getDependency(path).modifiedTime = modifiedTime;
      });
  }
  _addTextHashDependency(path) {
    return this.cache.readTextHash(path)
      .then(textHash => {
        this._getDependency(path).textHash = textHash;
      });
  }
}

// function validateFileSystemCacheDependencies(cache, dependencies) {
//   const files = Object.keys(dependencies)
//     .map(path => {
//       const dependency = dependencies[path];
//       const jobs = [];
//       if (dependency.isFile !== undefined) {
//         jobs.push(
//           cache.isFile(path)
//             .then(isFile => isFile === dependency.isFile)
//         );
//       }
//       if (dependency.modifiedTime !== undefined) {
//         jobs.push(
//           cache.readModifiedTime(path)
//             .then(modifiedTime => modifiedTime === dependency.modifiedTime)
//         );
//       }
//       if (dependency.textHash !== undefined) {
//         jobs.push(
//           cache.readTextHash(path)
//             .then(textHash => textHash === dependency.textHash)
//         );
//       }
//       return BlueBird.all(jobs)
//         .then(checks => checks.every(value => value === true));
//     });
//   return BlueBird.all(files)
//     .then(valid => valid.every(value => value === true));
// }

module.exports = {
  FileSystemScope,
  FileSystemTrap
};