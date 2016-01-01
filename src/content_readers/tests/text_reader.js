import * as path from 'path';
import * as imm from 'immutable';
import {assert} from '../../utils/assert';
import {createPipeline} from '../../pipeline/pipeline'
import {createTextReader} from '../text_reader';

describe('content_readers/text_reader', () => {
  describe('#textReader', () => {
    it('should accept a record pipeline and provide the text file\'s content', (done) => {
      const textReader = createTextReader();

      const file = path.join(__dirname, 'text_reader', 'test.txt');
      const pipeline = createPipeline();

      textReader({file}, pipeline, (err, content) => {
        assert.isNull(err);
        assert.equal(content, 'TEST_CONTENT');
        done();
      });
    });
    it('should produce an error if a file does not exist', (done) => {
      const textReader = createTextReader();

      const file = path.join(__dirname, 'text_reader', 'missing.txt');
      const pipeline = createPipeline();

      textReader({file}, pipeline, (err) => {
        assert.instanceOf(err, Error);
        assert.equal(err.message, `Text file "${file}" is not a file`);
        done();
      });
    });
  });
});