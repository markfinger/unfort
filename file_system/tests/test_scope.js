"use strict";

// const fs = require('fs');
const {assert} = require('../../utils/assert');
const {FileSystemCache} = require('../cache');
const {FileSystemScope} = require('../scope');

describe('file_system/scope', () => {
  describe('#FileSystemScope', () => {
    it('should provide fs access for traps via cache', () => {
      const cache = new FileSystemCache({
        readFile() {
          return Promise.resolve('test');
        },
        stat() {
          return Promise.resolve({
            isFile: () => true,
            mtime: new Date()
          });
        }
      });
      const scope = new FileSystemScope(cache);
      const trap = scope.createTrap();
      return assert.becomes(trap.readText('/some/test/file'), 'test');
    });
    it('should track the file dependencies for traps', () => {
      const date = new Date(2000, 1, 1, 1, 1);
      const cache = new FileSystemCache({
        readFile() {
          return Promise.resolve('test');
        },
        stat() {
          return Promise.resolve({
            isFile: () => true,
            mtime: date
          });
        }
      });
      const scope = new FileSystemScope(cache);
      const trap1 = scope.createTrap();
      const trap2 = scope.createTrap();
      const trap3 = scope.createTrap();
      assert.deepEqual(
        scope.getDependenciesFromTrap(trap1),
        {}
      );
      assert.deepEqual(
        scope.getDependenciesFromTrap(trap2),
        {}
      );
      assert.deepEqual(
        scope.getDependenciesFromTrap(trap3),
        {}
      );
      Promise.all([
        trap1.stat('/some/test/file'),
        trap2.stat('/some/test/file'),
        trap3.stat('/some/other/test/file'),
        trap1.readText('/some/test/file'),
        trap2.readText('/some/test/file'),
        trap3.readText('/some/other/test/file'),
      ])
        .then(() => {
          assert.deepEqual(
            scope.getDependenciesFromTrap(trap1),
            {
              '/some/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
              }
            }
          );
          assert.deepEqual(
            scope.getDependenciesFromTrap(trap2),
            {
              '/some/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
              }
            }
          );
          assert.deepEqual(
            scope.getDependenciesFromTrap(trap3),
            {
              '/some/other/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
              }
            }
          );
        });
    });
    // it('should validate rehydrated trap dependencies', () => {
    //   assert.isTrue(true);
    // });
    // it('should track rehydrated trap dependencies', () => {
    //   assert.isTrue(true);
    // });
    // it('it should trigger traps for file creation', () => {
    //   assert.isTrue(true);
    // });
    // it('it should trigger traps for file deletion', () => {
    //   assert.isTrue(true);
    // });
    // Maybe check textHash only during rehydration, and simply nuke any deps during runtime?
    // it('should triggers traps for file change', () => {
    //   return new Promise(() => {});
    // });
  });
});