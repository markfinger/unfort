export function getRecordById(store, recordId) {
  const state = store.getState();
  return state.getIn(['records', 'recordsById', recordId]);
}

export function getAvailableRecordId(store) {
  const state = store.getState();
  return state.getIn(['records', 'availableRecordId']);
}
