Cache spec
--------------

```javascript
cache.set(
  // key
  {
    namespace: '...',
    key: '...',
    value: ,
    fileDependencyTimestamp: Number()
  },
  // value
  {},
  // callback
  (err) => {}
});

cache.get(
  // key
  {
    key: '...',
    fileDependencies: [
      '/path/to/file',
      '...'
    ],
    packageDependencies: [
      'somePackage',
      '...'
    ]
  },
  // callback
  (err, value) => {
    // value is null for a miss
    // ...
  }
);
```

