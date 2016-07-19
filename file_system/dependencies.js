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
        .then(checks => checks.every(value => value === true));
    });
  return Promise.all(files)
    .then(valid => valid.every(value => value === true));
}

module.exports = {
  validateFileSystemDependencies
};