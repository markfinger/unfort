"use strict";

const fs = require('fs');
const {Buffer} = require('buffer');
const BlueBird = require('bluebird');
const {assert} = require('../../utils/assert');
const {generateStringHash} = require('../../utils/hash');
const {File} = require('../file');

describe('file_system/file', () => {
  describe('#File', () => {
    const fileSystem = {
      readFile: BlueBird.promisify(fs.readFile),
      stat: BlueBird.promisify(fs.stat)
    };

    it('should produce the expected dataset of a file', () => {
      const file = new File(__filename, fileSystem);
      assert.equal(file.path, __filename);
      return Promise.all([
        file.getStat(),
        file.getModifiedTime(),
        file.getIsFile(),
        file.getBuffer(),
        file.getText(),
        file.getTextHash()
      ])
        .then(([stat, modifiedTime, isFile, buffer, text, textHash]) => {
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
    it('should indicate if a file does not exist', () => {
      const file = new File('___NON_EXISTENT_FILE__', fileSystem);
      return file.getIsFile()
        .then(isFile => {
          assert.equal(isFile, false);
        });
    });
    it('should expose resolved stats as an `_resolvedStat` property', () => {
      function stat() {
        return Promise.resolve({});
      }
      const file = new File('/some/file', {stat});
      return file.getStat()
        .then(stat => {
          assert.strictEqual(file._resolvedStat, stat);
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
        const file = new File('/some/file', {readFile});
        return assert.isFulfilled(
          file.getText()
            .then(text => {
              assert.equal(text, 'text');
              return file.getText()
                .then(text => {
                  assert.equal(text, 'text');
                });
            })
        );
      });
      it('should create an object that lazily evaluates buffers and preserves the value', () => {
        let called = false;
        function readFile(path, encoding) {
          if (called) {
            throw new Error('should not be called twice');
          }
          called = true;
          assert.equal(path, '/some/file');
          assert.equal(encoding, undefined);
          return Promise.resolve(new Buffer('buffer'));
        }
        const file = new File('/some/file', {readFile});
        return assert.isFulfilled(
          file.getBuffer()
            .then(buffer => {
              assert.equal(buffer.toString(), 'buffer');
              return file.getBuffer()
                .then(_buffer => {
                  assert.strictEqual(buffer, _buffer);
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
        const file = new File('/some/file', {stat});
        return assert.isFulfilled(
          file.getStat()
            .then(text => {
              assert.equal(text, 'stat');
              return file.getStat()
                .then(text => {
                  assert.equal(text, 'stat');
                });
            })
        );
      });
    });
  });
});