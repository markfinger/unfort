TODO
====

Intercepts
----------

If your build pipeline is half-way through processing some data when an
associated file suddenly changes, you would expect all pending jobs to respond
to the change and exit early.

While this seems simple enough, it ends up requiring your subsystems to
periodically check the state of other subsystems. This introduces more code,
more complex control flow and more tightly couples the various parts of your
system together.

To avoid these issues, jobs are passed back and forth within the the store,
which allows us to apply some small abstraction layers that enable jobs to be
intercepted and exited early.

Once a job has exited early, you can handle the intercept at a higher level and
interrogate the store for the reasoning behind the exit.


### Handling intercepts

```
function buildFile(name) {
  return store.someFunc(name)
    .then(data => {
      // Handle success
      // ...
    })
    .catch(err => {
      if (store.intercepts.wasRecordRemoved(err)) {
        // Handle record removal
        // ...
      }

      if (store.intercepts.wasRecordInvalid(err)) {
        // The record was invalidated, so we
        // restart the build
        return buildFile(name);
      }

      return Promise.reject(err);
    });
}
```