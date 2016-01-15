export function getCachedData({cache, key, compute}, cb) {
  cache.get(key, (err, data) => {
    if (err || data) return cb(err, data);

    compute((err, data) => {
      if (err) return cb(err);

      if (data) {
        cache.set(key, data);
      }

      cb(null, data);
    });
  });
}
