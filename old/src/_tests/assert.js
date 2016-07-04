import * as chai from 'chai';
import chaiImmutable from 'chai-immutable';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiImmutable);
chai.use(chaiAsPromised);

chai.config.includeStack = true;

export const assert = chai.assert;
