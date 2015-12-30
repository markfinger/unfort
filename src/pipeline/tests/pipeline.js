import {parse as babylonParse} from 'babylon';
import {assert} from '../../utils/assert';
import {createPipeline} from '../pipeline';

describe('pipeline/pipeline', () => {
  describe('#createPipeline', () => {
    it('should define properties, if they are not defined in arguments', () => {
      const pipeline = createPipeline();

      assert.isObject(pipeline);
      assert.isObject(pipeline.fs);
      assert.isObject(pipeline.workers);
      assert.isObject(pipeline.cache);
    });
    it('should allow the pipeline object to be defined', () => {
      const pipeline = createPipeline({fs: true, workers: true, cache: true, foo: true});

      assert.isObject(pipeline);
      assert.isTrue(pipeline.fs);
      assert.isTrue(pipeline.workers);
      assert.isTrue(pipeline.cache);
      assert.isTrue(pipeline.foo);
    });
  });
});