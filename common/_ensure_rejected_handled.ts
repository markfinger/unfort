// Intended to handle edge-cases where the test suite
// swallows errors in promises and observables
process.on('unhandledRejection', (err) => {
  throw err;
});
