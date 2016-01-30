kv-cache
========

TODO: document current API, which has diverged somewhat from the notes below

A collection of key/value caches that guarantee immutability and varying degrees of persistence.

All caches follow the following API:

```javascript
const cache = ...;

cache.get(key, (err, data) => { });

cache.set(key, value, (err) => { });

cache.invalidate(key, (err) => { });

cache.events.on('error', (err) => { });
```

`key` should be a string or an array of strings. Keys are hashed with murmur to produce
consistent mappings.

`value` should be a JSON-serializable value.

`get` callbacks are required due to the potential for asynchronous operations. `set`
and `invalidate` callbacks are optional, but if provided, they will be called either
when an error occurs, or once the operation has completed.

`events` is an EventEmitter instance that emits `'error'` events. If you omit callbacks
from `set` and `invalidate`, it can be used it to respond to error conditions.


Caches
------

The following caches are available:

```javascript
import {
  createFileCache,
  createMemoryCache,
  createMockCache
} from 'kv-cache';
```


### File cache

```javascript
import {createFileCache} from 'kv-cache';

const cache = createFileCache('/path/to/directory');
```

Persists data to a directory where each key is mapped to specific file. Spreading keys
across files avoids IO overhead associated with stale data. To reduce filesystem reads
on repeated gets, it maintains an in-memory map from a key to the serialized object.

When `get` is called, it looks for JSON data in either memory or the filesystem, then
parses the stored JSON and provides the object. If no associated data exists, `null`
is provided.

When `set` is called, the value is immediately serialized to JSON, preserved in memory,
then asynchronously written to disk.

When `invalidate` is called, it removes any related data in memory and then asynchronously
remove the related file. Note: invalidating a missing key will not produce an error.

```javascript
// You can optionally override the hashing mechanism
createFileCache('/path/to/directory', {
  generateHash: (key) => {
    return '...';
  }
});
```


### Memory cache

```javascript
import {createMemoryCache} from 'kv-cache';

const cache = createMemoryCache();
```

Presents a similar API to file caches. Unlike the file cache, it will never touches the file
system, instead it will only preserve data in memory.

```javascript
// You can optionally override the hashing mechanism
createMemoryCache({
  generateHash: (key) => {
    return '...';
  }
});
```


### Mock cache

```javascript
import {createMockCache} from 'kv-cache';

const cache = createMockCache();
```

Presents a similar API to file caches and memory caches. However, it does nothing, and
will immediately call any provided callbacks with `null` as the argument(s).

This is useful as a drop-in replacement, if you want to debug or profile without the
serialization or IO overheads.
