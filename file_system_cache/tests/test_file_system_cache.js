"use strict";

const fs = require('fs');
const BlueBird = require('bluebird');
const {assert} = require('../../utils/assert');
const {stringToMurmur} = require('../../utils/hash');
const {
  FileSystemCache, FileObject, FileSystemCacheContext, validateFileSystemCacheDependencies,
  StaleFileIntercept
} = require('../file_system_cache');

describe('file_system_cache/file_system_cache', () => {
  describe('#FileSystemCache', () => {
    it('should produce the expected dataset of a file', () => {
      const fsCache = new FileSystemCache();
      return Promise.all([
        fsCache.stat(__filename),
        fsCache.readModifiedTime(__filename),
        fsCache.isFile(__filename),
        fsCache.readText(__filename),
        fsCache.readTextHash(__filename)
      ]).then(([stat, modifiedTime, isFile, text, textHash]) => {
        const actualText = fs.readFileSync(__filename, 'utf8');
        const actualStat = fs.statSync(__filename);
        assert.equal(stat.mtime.getTime(), actualStat.mtime.getTime());
        assert.equal(modifiedTime, actualStat.mtime.getTime());
        assert.equal(isFile, true);
        assert.equal(text, actualText);
        assert.equal(textHash, stringToMurmur(actualText));
      });
    });
    it('should only hit the filesystem once for a particular job on a file', () => {
      let called = false;

      function readFile() {
        if (called) {
          throw new Error('should not be called twice');
        }
        called = true;
        return Promise.resolve('text');
      }
      const fsCache = new FileSystemCache({readFile});

      return Promise.all([
        fsCache.readText('/some/file.js'),
        fsCache.readText('/some/file.js')
      ])
        .then(([text1, text2]) => {
          assert.equal(text1, 'text');
          assert.equal(text2, 'text');
          return fsCache.readText('/some/file.js')
            .then(text => assert.equal(text, 'text'));
        });
    });
    it('should handle multiple concurrent file requests', () => {
      function readFile(path) {
        if (path === 'test 1') {
          return Promise.resolve('text 1');
        }
        if (path === 'test 2') {
          return Promise.resolve('text 2');
        }
        throw new Error('should not reach this');
      }

      function stat(path) {
        if (path === 'test 1') {
          return Promise.resolve('stat 1');
        }
        if (path === 'test 2') {
          return Promise.resolve('stat 2');
        }
        throw new Error('should not reach this');
      }

      const fsCache = new FileSystemCache({readFile, stat});

      return Promise.all([
        fsCache.readText('test 1'),
        fsCache.stat('test 1'),
        fsCache.readText('test 2'),
        fsCache.stat('test 2')
      ])
        .then(([text1, stat1, text2, stat2]) => {
          assert.equal(text1, 'text 1');
          assert.equal(stat1, 'stat 1');
          assert.equal(text2, 'text 2');
          assert.equal(stat2, 'stat 2');
        });
    });
    it('should intercept jobs for files that are invalidated during processing', () => {
      const fsCache = new FileSystemCache();
      const job = fsCache.stat(__filename)
        .then(() => {
          throw new Error('should not be reached');
        })
        .catch(err => {
          assert.instanceOf(err, StaleFileIntercept);
          return 'done';
        });
      fsCache.invalidateFile(__filename);
      return assert.becomes(job, 'done');
    });
  });
  describe('#createFileSystemCacheContext', () => {
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
        assert.equal(textHash, stringToMurmur(actualText));

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
  describe('#createFileObject', () => {
    const fileSystem = {
      readFile: BlueBird.promisify(fs.readFile),
      stat: BlueBird.promisify(fs.stat)
    };

    it('should produce the expected dataset of a file', () => {
      const file = new FileObject(__filename, fileSystem);
      assert.equal(file.path, __filename);
      return Promise.all([
        file.stat,
        file.modifiedTime,
        file.isFile,
        file.text,
        file.textHash
      ])
        .then(([stat, modifiedTime, isFile, text, textHash]) => {
          const actualText = fs.readFileSync(__filename, 'utf8');
          const actualStat = fs.statSync(__filename);
          assert.equal(stat.mtime.getTime(), actualStat.mtime.getTime());
          assert.equal(modifiedTime, actualStat.mtime.getTime());
          assert.equal(isFile, true);
          assert.equal(text, actualText);
          assert.equal(textHash, stringToMurmur(actualText));
        });
    });
    it('should indicate if a file does not exist', () => {
      const file = new FileObject('___NON_EXISTENT_FILE__', fileSystem);
      return file.isFile
        .then(isFile => {
          assert.equal(isFile, false);
        });
    });
    describe('file system interactions', () => {
      it('should create an object that lazily evaluates text files and preserves the value', () => {
        let called = false;
        function readFile(path, encoding) {
          if (called) {
            throw new Error('should not be called twice');
          }
          called = true;
          assert.equal(path, '/some/file');
          assert.equal(encoding, 'utf8');
          return Promise.resolve('text');
        }
        const file = new FileObject('/some/file', {readFile});
        return assert.isFulfilled(
          file.text
            .then(text => {
              assert.equal(text, 'text');
              return file.text
                .then(text => {
                  assert.equal(text, 'text');
                });
            })
        );
      });
      it('should create an object that lazily evaluates file stats and preserves the value', () => {
        let called = false;
        function stat(path) {
          if (called) {
            throw new Error('should not be called twice');
          }
          called = true;
          assert.equal(path, '/some/file');
          return Promise.resolve('stat');
        }
        const file = new FileObject('/some/file', {stat});
        return assert.isFulfilled(
          file.stat
            .then(text => {
              assert.equal(text, 'stat');
              return file.stat
                .then(text => {
                  assert.equal(text, 'stat');
                });
            })
        );
      });
    });
  });
});