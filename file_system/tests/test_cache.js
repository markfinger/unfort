"use strict";

const fs = require('fs');
const {Buffer} = require('buffer');
const {assert} = require('../../utils/assert');
const {generateStringHash} = require('../../utils/hash');
const {FileSystemCache, StaleFileIntercept} = require('../cache');

describe('file_system/cache', () => {
  describe('#FileSystemCache', () => {
    it('should produce the expected dataset of a file', () => {
      const fsCache = new FileSystemCache();
      return Promise.all([
        fsCache.stat(__filename),
        fsCache.readModifiedTime(__filename),
        fsCache.isFile(__filename),
        fsCache.readBuffer(__filename),
        fsCache.readText(__filename),
        fsCache.readTextHash(__filename)
      ]).then(([stat, modifiedTime, isFile, buffer, text, textHash]) => {
        const actualBuffer = fs.readFileSync(__filename);
        const actualText = fs.readFileSync(__filename, 'utf8');
        const actualStat = fs.statSync(__filename);
        assert.equal(stat.mtime.getTime(), actualStat.mtime.getTime());
        assert.equal(modifiedTime, actualStat.mtime.getTime());
        assert.equal(isFile, true);
        assert.instanceOf(buffer, Buffer);
        assert.equal(buffer.toString(), actualBuffer.toString());
        assert.equal(text, actualText);
        assert.equal(textHash, generateStringHash(actualText));
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
      fsCache.removeFile(__filename);
      return assert.becomes(job, 'done');
    });
    it('should allow file stats to be set manually', () => {
      const fsCache = new FileSystemCache();
      const stat = fs.statSync(__filename);
      fsCache.addFileStat('___NON_EXISTENT_FILE__', stat);
      return fsCache.stat('___NON_EXISTENT_FILE__')
        .then(_stat => {
          assert.strictEqual(_stat, stat);
        });
    });
    it('should allow file objects to be populated', () => {
      const fsCache = new FileSystemCache();
      fsCache.addFile('test');
      assert.isTrue(fsCache.hasFile('test'));
    });
    it('should allow file objects to be removed', () => {
      const fsCache = new FileSystemCache();
      fsCache.addFile('test');
      fsCache.removeFile('test');
      assert.isFalse(fsCache.hasFile('test'));
    });
  });
});