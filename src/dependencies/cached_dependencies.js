export function getCachedData({cache, key, getData}, cb) {
  return cache.get(key, (err, data) => {
    if (err || data) return cb(err, data);

    getData((err, data) => {
      if (err) return cb(err);

      cache.set(key, data);

      cb(null, data);
    });
  });
}

export function getCachedDependencies({cache, key, getIdentifiers, resolveIdentifier}, cb) {
  function getData(cb) {
    getIdentifiers((err, identifiers) => {
      if (err) return cb(err);

      async.map(
        identifiers,
        (identifier, cb) => resolveIdentifier(identifier, cb),
        cb
      );
    });
  }

  getCachedData({cache, key, getData}, cb);
}
