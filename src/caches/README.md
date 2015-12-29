Cache spec
--------------

```javascript
cache.set({
  key: '...',
  value: {},
  fileDependencyTimestamp: Number()
}, (err) => {
  //
});

cache.get({
  key: '...',
  fileDependencies: [
    '/path/to/file',
    '...'
  ],
  packageDependencies: [
    'somePackage',
    '...'
  ]
}, (err, value) => {
  // value is null for a miss
  // ...
});
```

