"use strict";

const fs = require('fs');
const Promise = require('bluebird');
const {stringToMurmur} = require('../utils/hash');
const {LazyPromise} = require('../utils/lazy_promise');

const defaultReadFile = Promise.promisify(fs.readFile);
const defaultStat = Promise.promisify(fs.stat);

class StaleFileIntercept extends Error {
  constructor(path, job) {
    super();
    this.message = `File "${path}" was intercepted for job "${job}" as the reference was invalidated during processing`;
  }
}

module.exports = {
  createFileSystemCache,
  createFileObject,
  createFileSystemObject
};

function createFileSystemCache(fileSystemOverrides={}) {
  const fileSystem = createFileSystemObject(fileSystemOverrides);

  let files = Object.create(null);

  function ensureFileIsValid(file, job) {
    if (files[file.path] !== file) {
      throw new StaleFileIntercept(file.path, job);
    }
  }

  function getOrCreateFile(path) {
    let file = files[path];
    if (!file) {
      file = createFileObject(path, fileSystem);
      files[path] = file;
    }
    return file;
  }

  function evaluateFileDataProperty(property, path) {
    const file = getOrCreateFile(path);
    return file[property]
      .catch(err => {
        ensureFileIsValid(file, property);
        return Promise.reject(err);
      })
      .then(data => {
        ensureFileIsValid(file, property);
        return data;
      });
  }

  function stat(path) {
    return evaluateFileDataProperty('stat', path)
  }
  function readFileModifiedTime(path) {
    return evaluateFileDataProperty('modifiedTime', path)
  }
  function isFile(path) {
    return evaluateFileDataProperty('isFile', path)
  }
  function readTextFile(path) {
    return evaluateFileDataProperty('text', path)
  }
  function readTextHash(path) {
    return evaluateFileDataProperty('textHash', path)
  }

  function invalidateFile(path) {
    files[path] = null;
  }

  function createContext() {
    const dependencies = {};

    function getDependency(path) {
      let dependency = dependencies[path];
      if (!dependency) {
        dependency = {};
        dependencies[path] = dependency;
      }
      return dependency;
    }

    return {
      describeDependencies() {
        return dependencies;
      },
      stat(path) {
        return Promise.all([
          readFileModifiedTime(path),
          stat(path)
        ])
          .then(data => {
            getDependency(path).modifiedTime = data[0];
            return data[1];
          });
      },
      readFileModifiedTime(path) {
        return readFileModifiedTime(path)
          .then(modifiedTime => {
            getDependency(path).modifiedTime = modifiedTime;
            return modifiedTime;
          })
      },
      isFile(path) {
        return isFile(path)
          .then(isFile => {
            getDependency(path).isFile = isFile;
            return isFile;
          });
      },
      readTextFile(path) {
        return Promise.all([
          readTextHash(path),
          readTextFile(path)
        ])
          .then(data => {
            getDependency(path).textHash = data[0];
            return data[1];
          });
      },
      readTextHash(path) {
        return readTextHash(path)
          .then(textHash => {
            getDependency(path).textHash = textHash;
            return textHash;
          });
      }
    };
  }

  return {
    StaleFileIntercept,
    invalidateFile,
    createContext,
    stat,
    readFileModifiedTime,
    isFile,
    readTextFile,
    readTextHash
  };
}

function createFileObject(path, fileSystem) {
  // Lazily-evaluated interactions with the file system
  const stat = new LazyPromise(() => fileSystem.stat(path));
  const text = new LazyPromise(() => fileSystem.readFile(path, 'utf8'));

  // Data derived from the file system interactions
  const modifiedTime = new LazyPromise(() => stat.then(stat => stat.mtime.getTime()));
  const isFile = new LazyPromise(() => {
    return stat
      .then(stat => stat.isFile())
      .catch(err => {
        if (err.code === 'ENOENT') {
          return false;
        }
        return Promise.reject(err);
      });
  });
  const textHash = new LazyPromise(() => text.then(stringToMurmur));

  return {
    path,
    stat,
    modifiedTime,
    isFile,
    text,
    textHash
  };
}

function createFileSystemObject(overrides) {
  return Object.assign({
    readFile: defaultReadFile,
    stat: defaultStat
  }, overrides);
}