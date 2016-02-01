export function createIntercept(state, ref) {
  const name = ref.name;
  const record = state.get(name);

  // Handle cases where a record may have been removed
  if (!record) {
    return Promise.reject(
      new RecordRemovedDuringProcessing(`Record "${name}" was removed during processing`)
    );
  }

  // Handle cases where a record reference is no longer valid. An example
  // of a situation where this would occur is a file watcher that removes
  // the record, then recreates it
  if (record.reference !== ref.reference) {
    return Promise.reject(
      new RecordInvalidatedDuringProcessing(`Record "${name}" was invalidated during processing`)
    );
  }

  return null;
}

export function isIntercept(intercept) {
  return intercept instanceof Intercept;
}

export function isRecordRemovedIntercept(intercept) {
  return intercept instanceof RecordRemovedDuringProcessing;
}

export function isRecordInvalidIntercept(intercept) {
  return intercept instanceof RecordInvalidatedDuringProcessing;
}

export class Intercept extends Error {}

export class RecordRemovedDuringProcessing extends Intercept {}

export class RecordInvalidatedDuringProcessing extends Intercept {}