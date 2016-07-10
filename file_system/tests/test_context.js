"use strict";

const fs = require('fs');
const {assert} = require('../../utils/assert');
const {generateStringHash} = require('../../utils/hash');
const {FileSystemCache} = require('../cache');
const {FileSystemCacheContext, validateFileSystemCacheDependencies} = require('../context');

describe('file_system/context', () => {
  describe('#FileSystemCacheContext', () => {
    it('should enable contexts to be applied that indicate the nature of a file dependency', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return Promise.all([
        context.stat(__filename),
        context.readModifiedTime(__filename),
        context.isFile(__filename),
        context.readText(__filename),
        context.readTextHash(__filename)
      ]).then(([stat, modifiedTime, isFile, text, textHash]) => {
        const actualText = fs.readFileSync(__filename, 'utf8');
        const actualStat = fs.statSync(__filename);
        assert.equal(stat.mtime.getTime(), actualStat.mtime.getTime());
        assert.equal(modifiedTime, actualStat.mtime.getTime());
        assert.equal(isFile, true);
        assert.equal(text, actualText);
        assert.equal(textHash, generateStringHash(actualText));

        assert.deepEqual(
          context.describeDependencies(),
          {
            [__filename]: {
              isFile: true,
              modifiedTime: modifiedTime,
              textHash: textHash
            }
          }
        );
      });
    });
    it('should enable contexts to be applied that indicate multiple files dependencies', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return Promise.all([
        context.isFile(__filename),
        context.isFile('__NON_EXISTENT_FILE_1__'),
        context.isFile('__NON_EXISTENT_FILE_2__')
      ]).then(([isFile1, isFile2, isFile3]) => {
        assert.equal(isFile1, true);
        assert.equal(isFile2, false);
        assert.equal(isFile3, false);

        assert.deepEqual(
          context.describeDependencies(),
          {
            [__filename]: {
              isFile: true
            },
            __NON_EXISTENT_FILE_1__: {
              isFile: false
            },
            __NON_EXISTENT_FILE_2__: {
              isFile: false
            }
          }
        );
      });
    });
    it('should describe file dependencies for isFile calls', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return context.isFile(__filename)
        .then(() => {
          assert.deepEqual(
            context.describeDependencies(),
            {
              [__filename]: {
                isFile: true
              }
            }
          );
        });
    });
    it('should describe file dependencies for stat calls', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return context.stat(__filename)
        .then(() => {
          assert.deepEqual(
            context.describeDependencies(),
            {
              [__filename]: {
                modifiedTime: fs.statSync(__filename).mtime.getTime()
              }
            }
          );
        });
    });
    it('should describe file dependencies for readModifiedTime calls', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return context.readModifiedTime(__filename)
        .then(() => {
          assert.deepEqual(
            context.describeDependencies(),
            {
              [__filename]: {
                modifiedTime: fs.statSync(__filename).mtime.getTime()
              }
            }
          );
        });
    });
    it('should describe file dependencies for readText calls', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return context.readText(__filename)
        .then(() => {
          assert.deepEqual(
            context.describeDependencies(),
            {
              [__filename]: {
                modifiedTime: fs.statSync(__filename).mtime.getTime(),
                textHash: generateStringHash(fs.readFileSync(__filename, 'utf8'))
              }
            }
          );
        });
    });
    it('should describe file dependencies for readTextHash calls', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return context.readTextHash(__filename)
        .then(() => {
          assert.deepEqual(
            context.describeDependencies(),
            {
              [__filename]: {
                modifiedTime: fs.statSync(__filename).mtime.getTime(),
                textHash: generateStringHash(fs.readFileSync(__filename, 'utf8'))
              }
            }
          );
        });
    });
  });
  describe('validateFileSystemCacheDependencies', () => {
    it('should accept dependencies from a context and indicate if they are still true', () => {
      const fsCache = new FileSystemCache();
      const context = new FileSystemCacheContext(fsCache);
      return Promise.all([
        context.isFile(__filename),
        context.isFile('__NON_EXISTENT_FILE_1__'),
        context.isFile('__NON_EXISTENT_FILE_2__')
      ]).then(data => {
        assert.deepEqual(data, [true, false, false]);
        return assert.becomes(
          validateFileSystemCacheDependencies(fsCache, context.describeDependencies()),
          true
        );
      });
    });
    it('should validate the specified dependencies for isFile checks 1', () => {
      const fsCache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemCacheDependencies(
          fsCache,
          {[__filename]: {'isFile': false}}
        ),
        false
      );
    });
    it('should validate the specified dependencies for isFile checks 2', () => {
      const fsCache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemCacheDependencies(
          fsCache,
          {[__filename]: {'isFile': true}}
        ),
        true
      );
    });
    it('should validate the specified dependencies for modifiedTime checks 1', () => {
      const fsCache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemCacheDependencies(
          fsCache,
          {[__filename]: {'modifiedTime': 0}}
        ),
        false
      );
    });
    it('should validate the specified dependencies for modifiedTime checks 2', () => {
      const fsCache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemCacheDependencies(
          fsCache,
          {[__filename]: {'modifiedTime': fs.statSync(__filename).mtime.getTime()}}
        ),
        true
      );
    });
  });
});