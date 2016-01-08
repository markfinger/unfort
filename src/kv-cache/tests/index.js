import path from 'path';
import rimraf from 'rimraf';
import {assert} from '../../utils/assert';
import {createFileCache} from '../file_cache';
import {createMemoryCache} from '../memory_cache';
import {createMockCache} from '../mock_cache';

describe('index', () => {
  it('all caches should expose similar APIs', () => {
    const dirname = path.join(__dirname, 'cache_test_dir');
    const fileCache = createFileCache(dirname);
    assert.isFunction(fileCache.set);
    assert.isFunction(fileCache.get);
    assert.isFunction(fileCache.invalidate);
    assert.isFunction(fileCache.on);
    assert.isFunction(fileCache.once);
    assert.isFunction(fileCache.off);
    rimraf.sync(dirname);

    const memoryCache = createMemoryCache();
    assert.isFunction(memoryCache.set);
    assert.isFunction(memoryCache.get);
    assert.isFunction(memoryCache.invalidate);
    assert.isFunction(memoryCache.on);
    assert.isFunction(memoryCache.once);
    assert.isFunction(memoryCache.off);

    const mockCache = createMockCache();
    assert.isFunction(mockCache.set);
    assert.isFunction(mockCache.get);
    assert.isFunction(mockCache.invalidate);
    assert.isFunction(mockCache.on);
    assert.isFunction(mockCache.once);
    assert.isFunction(mockCache.off);
  });
});