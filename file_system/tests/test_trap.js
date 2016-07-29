"use strict";

const fs = require('fs');
const {Buffer} = require('buffer');
const test = require('ava');
const {generateStringHash} = require('../../utils/hash');
const {FileSystemCache} = require('../cache');
const {FileSystemTrap} = require('../trap');


test('FileSystemTrap should indicate a file dependency for a set of jobs', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  t.truthy(trap instanceof FileSystemTrap);
  return Promise.all([
    trap.stat(__filename),
    trap.readModifiedTime(__filename),
    trap.isFile(__filename),
    trap.readBuffer(__filename),
    trap.readText(__filename),
    trap.readTextHash(__filename)
  ]).then(([stat, modifiedTime, isFile, buffer, text, textHash]) => {
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

    t.deepEqual(
      trap.describeDependencies(),
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

test('FileSystemTrap should indicate multiple file dependencies from multiple jobs', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return Promise.all([
    trap.isFile(__filename),
    trap.isFile('__NON_EXISTENT_FILE_1__'),
    trap.isFile('__NON_EXISTENT_FILE_2__')
  ]).then(([isFile1, isFile2, isFile3]) => {
    t.is(isFile1, true);
    t.is(isFile2, false);
    t.is(isFile3, false);

    t.deepEqual(
      trap.describeDependencies(),
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

test('FileSystemTrap should describe file dependencies for isFile calls', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return trap.isFile(__filename)
    .then(() => {
      t.deepEqual(
        trap.describeDependencies(),
        {
          [__filename]: {
            isFile: true
          }
        }
      );
    });
});

test('FileSystemTrap should describe file dependencies for stat calls', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return trap.stat(__filename)
    .then(() => {
      t.deepEqual(
        trap.describeDependencies(),
        {
          [__filename]: {
            isFile: true,
            modifiedTime: fs.statSync(__filename).mtime.getTime()
          }
        }
      );
    });
});

test('FileSystemTrap should describe file dependencies for readModifiedTime calls', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return trap.readModifiedTime(__filename)
    .then(() => {
      t.deepEqual(
        trap.describeDependencies(),
        {
          [__filename]: {
            isFile: true,
            modifiedTime: fs.statSync(__filename).mtime.getTime()
          }
        }
      );
    });
});

test('FileSystemTrap should describe file dependencies for readBuffer calls', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return trap.readBuffer(__filename)
    .then(() => {
      t.deepEqual(
        trap.describeDependencies(),
        {
          [__filename]: {
            isFile: true,
            modifiedTime: fs.statSync(__filename).mtime.getTime()
          }
        }
      );
    });
});

test('FileSystemTrap should describe file dependencies for readText calls', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return trap.readText(__filename)
    .then(() => {
      t.deepEqual(
        trap.describeDependencies(),
        {
          [__filename]: {
            isFile: true,
            modifiedTime: fs.statSync(__filename).mtime.getTime(),
            textHash: generateStringHash(fs.readFileSync(__filename, 'utf8'))
          }
        }
      );
    });
});

test('FileSystemTrap should describe file dependencies for readTextHash calls', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return trap.readTextHash(__filename)
    .then(() => {
      t.deepEqual(
        trap.describeDependencies(),
        {
          [__filename]: {
            isFile: true,
            modifiedTime: fs.statSync(__filename).mtime.getTime(),
            textHash: generateStringHash(fs.readFileSync(__filename, 'utf8'))
          }
        }
      );
    });
});