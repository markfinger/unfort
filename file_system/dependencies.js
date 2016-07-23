"use strict";

function validateFileSystemDependencies(cache, dependencies) {
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
      return Promise.all(jobs)
        .then(validateChecks);
    });
  return Promise.all(files)
    .then(validateChecks);
}

function validateChecks(arr) {
  return arr.every(validateCheck);
}

function validateCheck(value) {
  return value === true;
}

module.exports = {
  validateFileSystemDependencies
};