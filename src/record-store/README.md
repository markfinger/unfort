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
intercepted and rejected either before they start or once they have completed.

If a job was intercepted and rejected, you can handle the intercept further
along the promise chain. You can also interrogate the intercept via the
store's API, if you want to handle things more gracefully.


### Handling intercepts

```js
store.someJob(name)
  .catch(err => {
    if (store.isIntercept(err)) {
      // Handle the intercept
      // ...
    }

    if (store.isRecordRemovedIntercept(err)) {
      // Handle record removal
      // ...
    }

    if (store.isRecordInvalidIntercept(err)) {
      // The record was removed but then re-created,
      // so the data was job can be restarted
      // ...
    }

    return Promise.reject(err);
  })
  .then(data => {
    // Handle success
    // ...
  });
```