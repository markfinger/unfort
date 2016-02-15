/**
 * Enables multiple call-sites to enqueue a function call that will
 * occur both asynchronously and only once per tick.
 *
 * @param {Function} fn
 * @returns {Function}
 */
module.exports = function callOnceAfterTick(fn) {
  var latestCallId;
  return function callOnceAfterTickInner() {
    var callId = {};
    latestCallId = callId;

    process.nextTick(function() {
      if (latestCallId !== callId) {
        return;
      }

      fn();
    });
  };
};
