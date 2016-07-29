"use strict";

const fs = require('fs');
const {Buffer} = require('buffer');
const BlueBird = require('bluebird');
const test = require('ava');
const {generateStringHash} = require('../../utils/hash');
const {File} = require('../file');

const fileSystem = {
  readFile: BlueBird.promisify(fs.readFile),
  stat: BlueBird.promisify(fs.stat)
};

test('File should produce the expected dataset of a file', (t) => {
  const file = new File(__filename, fileSystem);
  t.is(file.path, __filename);
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
      t.is(stat.mtime.getTime(), actualStat.mtime.getTime());
      t.is(modifiedTime, actualStat.mtime.getTime());
      t.true(isFile);
      t.truthy(buffer instanceof Buffer);
      t.is(buffer.toString(), actualBuffer.toString());
      t.is(text, actualText);
      t.is(textHash, generateStringHash(actualText));
    });
});

test('File should indicate if a file does not exist', (t) => {
  const file = new File('___NON_EXISTENT_FILE__', fileSystem);
  return file.getIsFile()
    .then(isFile => {
      t.is(isFile, false);
    });
});

test('File should allow a stat to be set manually', (t) => {
  const file = new File('/some/file');
  const stat = {mtime: new Date(2000, 1, 1)};
  file.setStat(stat);
  return Promise.all([
    file.getStat(),
    file.getModifiedTime()
  ])
    .then(data => {
      t.deepEqual(data, [stat, (new Date(2000, 1, 1)).getTime()]);
    });
});

test('File should allow a modified time to be set manually', (t) => {
  const file = new File('/some/file');
  file.setModifiedTime('test');
  return file.getModifiedTime()
    .then(modifiedTime => {
      t.is(modifiedTime, 'test');
    });
});

test('File should allow isFile to be set manually', (t) => {
  const file = new File('/some/file');
  file.setIsFile('test');
  return file.getIsFile()
    .then(isFile => {
      t.is(isFile, 'test');
    });
});

test('File should create an object that lazily evaluates text files and preserves the value', (t) => {
  let called = false;
  function readFile(path, encoding) {
    if (called) {
      throw new Error('should not be called twice');
    }
    called = true;
    t.is(path, '/some/file');
    t.is(encoding, 'utf8');
    return Promise.resolve('text');
  }
  const file = new File('/some/file', {readFile});
  return file.getText()
    .then(text => {
      t.is(text, 'text');
      return file.getText()
        .then(text => {
          t.is(text, 'text');
        });
    });
});

test('File should create an object that lazily evaluates buffers and preserves the value', (t) => {
  let called = false;
  function readFile(path, encoding) {
    if (called) {
      throw new Error('should not be called twice');
    }
    called = true;
    t.is(path, '/some/file');
    t.is(encoding, undefined);
    return Promise.resolve(new Buffer('buffer'));
  }
  const file = new File('/some/file', {readFile});
  return file.getBuffer()
    .then(buffer => {
      t.is(buffer.toString(), 'buffer');
      return file.getBuffer()
        .then(_buffer => {
          t.is(buffer, _buffer);
        });
    });
});

test('File should create an object that lazily evaluates file stats and preserves the value', (t) => {
  let called = false;
  function stat(path) {
    if (called) {
      throw new Error('should not be called twice');
    }
    called = true;
    t.is(path, '/some/file');
    return Promise.resolve('stat');
  }
  const file = new File('/some/file', {stat});
  return file.getStat()
    .then(text => {
      t.is(text, 'stat');
      return file.getStat()
        .then(text => {
          t.is(text, 'stat');
        });
    });
});