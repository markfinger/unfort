import * as path from 'path';
import * as fs from 'fs';
import {Buffer} from 'buffer';
import test from 'ava';
import * as tmp from 'tmp';
import {generateStringHash} from '../../common';
import {File} from '../file';
import {readFile, stat, readDirectory} from '../utils';

const fileSystem = {
  readFile,
  stat
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
  const file = new File('/some/file', fileSystem);
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
  const file = new File('/some/file', fileSystem);
  file.setModifiedTime(-1);
  return file.getModifiedTime()
    .then(modifiedTime => {
      t.is(modifiedTime, -1);
    });
});

test('File should allow isFile to be set manually', (t) => {
  const file = new File('/some/file', fileSystem);
  file.setIsFile(true);
  return file.getIsFile()
    .then(isFile => {
      t.is(isFile, true);
    });
});

test('File should allow isDirectory to be set manually', (t) => {
  const file = new File('/some/file', fileSystem);
  file.setIsDirectory(true);
  return file.getIsDirectory()
    .then(isDirectory => {
      t.is(isDirectory, true);
    });
});

test('File should allow textHash to be set manually', (t) => {
  const file = new File('/some/file', fileSystem);
  file.setTextHash('test');
  return file.getTextHash()
    .then(textHash => {
      t.is(textHash, 'test');
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
    .then((text: any) => {
      t.is(text, 'stat');
      return file.getStat()
        .then((text: any) => {
          t.is(text, 'stat');
        });
    });
});

test('File should indicate if it is a directory', (t) => {
  const file = new File(__filename, {stat});
  return file.getIsDirectory()
    .then(isDirectory => {
      t.is(isDirectory, false);
      const file = new File(__dirname, {stat});
      return file.getIsDirectory()
        .then(isDirectory => {
          t.is(isDirectory, true);
        });
    });
});

test('File should be able to list its directory contents', (t) => {
  const dir = tmp.dirSync().name;
  fs.writeFileSync(path.join(dir, 'test1'), 'test');
  fs.writeFileSync(path.join(dir, 'test2'), 'test');
  const file = new File(dir, {readDirectory});
  return file.getDirectoryContents()
    .then((contents) => {
      t.deepEqual(contents, ['test1', 'test2']);
    });
});