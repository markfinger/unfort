import {isUndefined} from 'lodash/lang';
import {createNodeFS} from '../fs/node_fs';
import {createMockWorkers} from '../workers/mock_workers';
import {createMockCache} from '../caches/mock_cache';

export function createPipeline(options) {
  let pipeline = Object.assign({}, options);

  if (isUndefined(pipeline.fs)) {
    pipeline.fs = createNodeFS();
  }

  if (isUndefined(pipeline.workers)) {
    pipeline.workers = createMockWorkers();
  }

  if (isUndefined(pipeline.cache)) {
    pipeline.cache = createMockCache();
  }

  return pipeline;
}