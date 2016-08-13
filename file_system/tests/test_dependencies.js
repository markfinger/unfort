import * as fs from 'fs';
import test from 'ava';
import {FileSystemCache} from '../cache';
import {validateFileSystemDependencies} from '../dependencies';

test('should accept dependencies from a trap and indicate if they are still true', (t) => {
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  return Promise.all([
    trap.isFile(__filename),
    trap.isFile('__NON_EXISTENT_FILE_1__'),
    trap.isFile('__NON_EXISTENT_FILE_2__')
  ]).then(data => {
    t.deepEqual(data, [true, false, false]);
    return validateFileSystemDependencies(cache, trap.describeDependencies())
      .then(isValid => t.true(isValid));
  });
});

test('should validate the specified dependencies for isFile checks 1', (t) => {
  const cache = new FileSystemCache();
  return validateFileSystemDependencies(
    cache,
    {[__filename]: {'isFile': false}}
  )
    .then(isValid => t.false(isValid));
});

test('should validate the specified dependencies for isFile checks 2', (t) => {
  const cache = new FileSystemCache();
  return validateFileSystemDependencies(
    cache,
    {[__filename]: {'isFile': true}}
  )
    .then(isValid => t.true(isValid));
});

test('should validate the specified dependencies for modifiedTime checks 1', (t) => {
  const cache = new FileSystemCache();
  return validateFileSystemDependencies(
    cache,
    {[__filename]: {'modifiedTime': 0}}
  )
    .then(isValid => t.false(isValid));
});

test('should validate the specified dependencies for modifiedTime checks 2', (t) => {
  const cache = new FileSystemCache();
  return validateFileSystemDependencies(
    cache,
    {[__filename]: {'modifiedTime': fs.statSync(__filename).mtime.getTime()}}
  )
    .then(isValid => t.true(isValid));
});