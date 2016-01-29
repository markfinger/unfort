export function getCachedData({cache, key, compute}) {
  return cache.get(key).then(data => {
    if (data) return data;

    return compute().then(data => {
      if (data) {
        cache.set(key, data);
      }

      return data;
    });
  });
}
