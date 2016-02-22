import path from 'path';
import rimraf from 'rimraf';
import EventEmitter from 'events';
import {assert} from '../../utils/assert';
import {createFileCache} from '../file-cache';
import {createMockCache} from '../mock-cache';

describe('index', () => {
  it('all caches should expose similar APIs', () => {
    const dirname = path.join(__dirname, 'cache_test_dir');
    const fileCache = createFileCache(dirname);
    assert.isFunction(fileCache.set);
    assert.isFunction(fileCache.get);
    assert.isFunction(fileCache.invalidate);
    assert.instanceOf(fileCache.events, EventEmitter);
    rimraf.sync(dirname);

    const mockCache = createMockCache();
    assert.isFunction(mockCache.set);
    assert.isFunction(mockCache.get);
    assert.isFunction(mockCache.invalidate);
    assert.instanceOf(mockCache.events, EventEmitter);
  });
});