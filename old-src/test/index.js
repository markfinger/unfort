import sourceMapSupport from 'source-map-support';
import chai from 'chai';

sourceMapSupport.install({
  handleUncaughtExceptions: false
});

chai.config.includeStack = true;

export const assert = chai.assert;