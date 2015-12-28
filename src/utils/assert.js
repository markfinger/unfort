import chai from 'chai';
import chaiImmutable from 'chai-immutable';

chai.use(chaiImmutable);

chai.config.includeStack = true;

export const assert = chai.assert;
