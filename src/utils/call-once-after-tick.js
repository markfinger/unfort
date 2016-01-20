/**
 * Enables multiple call-sites to enqueue an active that will occur
 * both asynchronously and only once per tick.
 *
 * @param {Function} fn
 * @returns {Function}
 */
export function callOnceAfterTick(fn) {
  let latestCallId;
  return function callOnceAfterTickInner() {
    const callId = {};
    latestCallId = callId;

    process.nextTick(() => {
      if (latestCallId !== callId) {
        return;
      }

      fn();
    });
  };
}
