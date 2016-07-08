"use strict";

const fs = require('fs');
const {assert} = require('../../utils/assert');
const {stringToMurmur} = require('../../utils/hash');
const {createFileSystemCache, createFileObject, createFileSystemObject} = require('../file_system_cache');

describe('file_system_cache/file_system_cache', () => {
  describe('#createFileSystemCache', () => {
    it('should produce the expected dataset of a file', () => {
      const fsCache = createFileSystemCache();
      return Promise.all([
        fsCache.stat(__filename),
        fsCache.readFileModifiedTime(__filename),
        fsCache.isFile(__filename),
        fsCache.readTextFile(__filename),
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

      const fsCache = createFileSystemCache({readFile});

      return Promise.all([
        fsCache.readTextFile('/some/file.js'),
        fsCache.readTextFile('/some/file.js')
      ])
        .then(([text1, text2]) => {
          assert.equal(text1, 'text');
          assert.equal(text2, 'text');
          return fsCache.readTextFile('/some/file.js')
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

      const fsCache = createFileSystemCache({readFile, stat});

      return Promise.all([
        fsCache.readTextFile('test 1'),
        fsCache.stat('test 1'),
        fsCache.readTextFile('test 2'),
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
      const fsCache = createFileSystemCache();
      const job = fsCache.stat(__filename)
        .then(() => {
          throw new Error('should not be reached');
        })
        .catch(err => {
          assert.instanceOf(err, fsCache.StaleFileIntercept);
          return 'done';
        });
      fsCache.invalidateFile(__filename);
      return assert.becomes(job, 'done');
    });
    it('should enable contexts to be applied that indicate the nature of a file dependency', () => {
      const fsCache = createFileSystemCache();
      const context = fsCache.createContext();
      return Promise.all([
        context.stat(__filename),
        context.readFileModifiedTime(__filename),
        context.isFile(__filename),
        context.readTextFile(__filename),
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
      const fsCache = createFileSystemCache();
      const context = fsCache.createContext();
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
  describe('#createFileObject', () => {
    it('should produce the expected dataset of a file', () => {
      const fileSystem = createFileSystemObject();
      const file = createFileObject(__filename, fileSystem);
      assert.equal(file.path, __filename);
      return Promise.all([
        file.stat,
        file.modifiedTime,
        file.isFile,
        file.text,
        file.textHash
      ]).then(([stat, modifiedTime, isFile, text, textHash]) => {
        const actualText = fs.readFileSync(__filename, 'utf8');
        const actualStat = fs.statSync(__filename);
        assert.equal(stat.mtime.getTime(), actualStat.mtime.getTime());
        assert.equal(modifiedTime, actualStat.mtime.getTime());
        assert.equal(isFile, true);
        assert.equal(text, actualText);
        assert.equal(textHash, stringToMurmur(actualText));
      })
    });
    it('should indicate if a file does not exist', () => {
      const fileSystem = createFileSystemObject();
      const file = createFileObject('___NON_EXISTENT_FILE__', fileSystem);
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
        const file = createFileObject('/some/file', {readFile});
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
        const file = createFileObject('/some/file', {stat});
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