"use strict";

const fs = require('fs');
const {assert} = require('../../utils/assert');
const {FileSystemCache} = require('../cache');
const {validateFileSystemDependencies} = require('../dependencies');

describe('file_system/dependencies', () => {
  describe('validateFileSystemDependencies', () => {
    it('should accept dependencies from a trap and indicate if they are still true', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return Promise.all([
        trap.isFile(__filename),
        trap.isFile('__NON_EXISTENT_FILE_1__'),
        trap.isFile('__NON_EXISTENT_FILE_2__')
      ]).then(data => {
        assert.deepEqual(data, [true, false, false]);
        return assert.becomes(
          validateFileSystemDependencies(cache, trap.describeDependencies()),
          true
        );
      });
    });
    it('should validate the specified dependencies for isFile checks 1', () => {
      const cache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemDependencies(
          cache,
          {[__filename]: {'isFile': false}}
        ),
        false
      );
    });
    it('should validate the specified dependencies for isFile checks 2', () => {
      const cache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemDependencies(
          cache,
          {[__filename]: {'isFile': true}}
        ),
        true
      );
    });
    it('should validate the specified dependencies for modifiedTime checks 1', () => {
      const cache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemDependencies(
          cache,
          {[__filename]: {'modifiedTime': 0}}
        ),
        false
      );
    });
    it('should validate the specified dependencies for modifiedTime checks 2', () => {
      const cache = new FileSystemCache();
      return assert.becomes(
        validateFileSystemDependencies(
          cache,
          {[__filename]: {'modifiedTime': fs.statSync(__filename).mtime.getTime()}}
        ),
        true
      );
    });
  });
});