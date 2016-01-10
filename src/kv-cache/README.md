kv-cache
========

A collection of key/value caches that guarantee immutability and varying degrees of persistence.

All caches follow the following API:

```javascript
const cache = ...;

cache.get(key, (err, data) => { });

cache.set(key, value, (err) => { });

cache.invalidate(key, (err) => { });

cache.events.on('error', (err) => { });
```

`key` should be a string. Keys are murmur hashed to produce consistent mappings.

`value` should be a JSON-serializable value.

`get` callbacks are required due to the potential for asynchronous operations. `set`
and `invalidate` callbacks are optional, but if provided, they will be called either
when an error occurs, or once the operation has completed.

`events` is an EventEmitter instance that emits `'error'` events. You can use it to
trap errors if you omit callbacks from `set` and `invalidate`.

Note: operations may complete either synchronously or asynchronously. While this is
inconsistent, it is by design and is intended to reduce system load, and increase
both performance and the clarity of stack traces.

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


### Memory cache

```javascript
import {createMemoryCache} from 'kv-cache';

const cache = createMemoryCache();
```

Similar to file caches, only it never touches the file system.


### Mock cache

```javascript
import {createMockCache} from 'kv-cache';

const cache = createMockCache();
```

Does nothing, and immediately calls any provided callbacks.

Useful as a drop-in replacement if you want to debug, or profile without the serialization
or IO overheads.


TODO
----

### Reference cache

Might be useful to persist references and avoid deserialization costs on repeated gets.
Loses immutability guarantee though.

Might want to accept a cache as an argument: proxy gets for missing data, sets should
maintain a reference and pass the key/value/cb along.
