"use strict";

const fs = require('fs');
const {Buffer} = require('buffer');
const {assert} = require('../../utils/assert');
const {generateStringHash} = require('../../utils/hash');
const {FileSystemCache, StaleFileIntercept, FileSystemTrap} = require('../cache');

describe('file_system/cache', () => {
  describe('#FileSystemCache', () => {
    it('should produce the expected dataset of a file', () => {
      const cache = new FileSystemCache();
      return Promise.all([
        cache.stat(__filename),
        cache.readModifiedTime(__filename),
        cache.isFile(__filename),
        cache.readBuffer(__filename),
        cache.readText(__filename),
        cache.readTextHash(__filename)
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
      const cache = new FileSystemCache({readFile});

      return Promise.all([
        cache.readText('/some/file.js'),
        cache.readText('/some/file.js')
      ])
        .then(([text1, text2]) => {
          assert.equal(text1, 'text');
          assert.equal(text2, 'text');
          return cache.readText('/some/file.js')
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

      const cache = new FileSystemCache({readFile, stat});

      return Promise.all([
        cache.readText('test 1'),
        cache.stat('test 1'),
        cache.readText('test 2'),
        cache.stat('test 2')
      ])
        .then(([text1, stat1, text2, stat2]) => {
          assert.equal(text1, 'text 1');
          assert.equal(stat1, 'stat 1');
          assert.equal(text2, 'text 2');
          assert.equal(stat2, 'stat 2');
        });
    });
    it('should intercept jobs for files that are removed during processing', () => {
      const cache = new FileSystemCache();
      const job = cache.stat(__filename)
        .then(() => {
          throw new Error('should not be reached');
        })
        .catch(err => {
          assert.instanceOf(err, StaleFileIntercept);
          return 'done';
        });
      cache.fileRemoved.push(__filename);
      return assert.becomes(job, 'done');
    });
    it('should provide fs access for traps', () => {
      const cache = new FileSystemCache({
        readFile() {
          return Promise.resolve('test');
        },
        stat() {
          return Promise.resolve({
            mtime: new Date()
          });
        }
      });
      const trap = cache.createTrap();
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
      const trap1 = cache.createTrap();
      const trap2 = cache.createTrap();
      const trap3 = cache.createTrap();
      assert.deepEqual(
        trap1.files,
        {}
      );
      assert.deepEqual(
        trap1.files,
        {}
      );
      assert.deepEqual(
        trap1.files,
        {}
      );
      return Promise.all([
        trap1.stat('/some/test/file'),
        trap2.stat('/some/test/file'),
        trap3.stat('/some/other/test/file'),
        trap1.readText('/some/test/file'),
        trap2.readText('/some/test/file'),
        trap3.readText('/some/other/test/file'),
      ])
        .then(() => {
          assert.deepEqual(
            trap1.files,
            {
              '/some/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
              }
            }
          );
          assert.deepEqual(
            trap2.files,
            {
              '/some/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
              }
            }
          );
          assert.deepEqual(
            trap3.files,
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
    it('should trigger traps for file creation', () => {
      const cache = new FileSystemCache({
        stat() {
          return Promise.resolve({
            isFile() {
              return false;
            }
          });
        }
      });
      const trap1 = cache.createTrap();
      const trap2 = cache.createTrap();
      const triggered = [];
      cache.trapTriggered.subscribe(obj => {
        assert.equal(obj.trap, trap1);
        assert.equal(obj.path, '/some/file');
        assert.equal(obj.cause, 'added');
        triggered.push(obj.trap);
      });
      return Promise.all([
        trap1.isFile('/some/file'),
        trap2.isFile('/some/other/file')
      ])
        .then(data => {
          assert.deepEqual(data, [false, false]);
          assert.equal(triggered.length, 0);
          cache.fileAdded.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap1);
        });
    });
    it('should not re-trigger traps for file creation', () => {
      const cache = new FileSystemCache({
        stat: () => Promise.resolve({isFile: () => false})
      });
      const trap1 = cache.createTrap();
      const triggered = [];
      cache.trapTriggered.subscribe(obj => {
        assert.equal(obj.trap, trap1);
        assert.equal(obj.path, '/some/file');
        assert.equal(obj.cause, 'added');
        triggered.push(obj.trap);
      });
      return trap1.isFile('/some/file')
        .then(isFile => {
          assert.isFalse(isFile);
          assert.equal(triggered.length, 0);
          cache.fileAdded.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap1);
          cache.fileAdded.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap1);
        });
    });
    it('should trigger traps for file deletion', () => {
      const cache = new FileSystemCache({
        stat: () => Promise.resolve({isFile: () => true})
      });
      const trap1 = cache.createTrap();
      const trap2 = cache.createTrap();
      const triggered = [];
      cache.trapTriggered.subscribe(obj => {
        assert.equal(obj.trap, trap1);
        assert.equal(obj.path, '/some/file');
        assert.equal(obj.cause, 'removed');
        triggered.push(obj.trap);
      });
      return Promise.all([
        trap1.isFile('/some/file'),
        trap2.isFile('/some/other/file')
      ])
        .then(data => {
          assert.deepEqual(data, [true, true]);
          assert.equal(triggered.length, 0);
          cache.fileRemoved.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap1);
        });
    });
    it('should not re-trigger traps for file deletion', () => {
      const cache = new FileSystemCache({
        stat: () => Promise.resolve({isFile: () => true})
      });
      const trap = cache.createTrap();
      const triggered = [];
      cache.trapTriggered.subscribe(obj => {
        assert.equal(obj.trap, trap);
        assert.equal(obj.path, '/some/file');
        assert.equal(obj.cause, 'removed');
        triggered.push(obj.trap);
      });
      return trap.isFile('/some/file')
        .then(isFile => {
          assert.deepEqual(isFile, true);
          assert.equal(triggered.length, 0);
          cache.fileRemoved.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap);
          cache.fileRemoved.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap);
        });
    });
    it('should trigger traps for file changes', () => {
      const cache = new FileSystemCache({
        readFile: () => Promise.resolve('text'),
        stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
      });
      const trap1 = cache.createTrap();
      const trap2 = cache.createTrap();
      const triggered = [];
      cache.trapTriggered.subscribe(obj => {
        assert.equal(obj.trap, trap1);
        assert.equal(obj.path, '/some/file');
        assert.equal(obj.cause, 'changed');
        triggered.push(obj.trap);
      });
      return Promise.all([
        trap1.readText('/some/file'),
        trap2.readText('/some/other/file')
      ])
        .then(data => {
          assert.deepEqual(data, ['text', 'text']);
          assert.equal(triggered.length, 0);
          cache.fileChanged.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap1);
        });
    });
    it('should not re-trigger traps for file changes', () => {
      const cache = new FileSystemCache({
        readFile: () => Promise.resolve('text'),
        stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
      });
      const trap = cache.createTrap();
      const triggered = [];
      cache.trapTriggered.subscribe(obj => {
        assert.equal(obj.trap, trap);
        assert.equal(obj.path, '/some/file');
        assert.equal(obj.cause, 'changed');
        triggered.push(obj.trap);
      });
      return trap.readText('/some/file')
        .then(text => {
          assert.deepEqual(text, 'text');
          assert.equal(triggered.length, 0);
          cache.fileChanged.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap);
          cache.fileChanged.push('/some/file');
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap);
        });
    });
    describe('file added trigger conditions', () => {
      it('should trigger if isFile evaluated to False', () => {
        const cache = new FileSystemCache({
          stat: () => Promise.resolve({isFile: () => false})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.isFile('/some/file')
          .then(() => {
            cache.fileAdded.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
    });
    describe('file removed trigger conditions', () => {
      it('should trigger if isFile evaluated to true', () => {
        const cache = new FileSystemCache({
          stat: () => Promise.resolve({isFile: () => true})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.isFile('/some/file')
          .then(() => {
            cache.fileRemoved.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if stat evaluated', () => {
        const cache = new FileSystemCache({
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.stat('/some/file')
          .then(() => {
            cache.fileRemoved.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if modifiedTime evaluated', () => {
        const cache = new FileSystemCache({
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readModifiedTime('/some/file')
          .then(() => {
            cache.fileRemoved.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if readBuffer evaluated', () => {
        const cache = new FileSystemCache({
          readFile: () => Promise.resolve('test'),
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readBuffer('/some/file')
          .then(() => {
            cache.fileRemoved.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if readText evaluated', () => {
        const cache = new FileSystemCache({
          readFile: () => Promise.resolve('test'),
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readText('/some/file')
          .then(() => {
            cache.fileRemoved.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if readTextHash evaluated', () => {
        const cache = new FileSystemCache({
          readFile: () => Promise.resolve('test'),
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readTextHash('/some/file')
          .then(() => {
            cache.fileRemoved.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
    });
    describe('file changed trigger conditions', () => {
      it('should trigger if stat evaluated', () => {
        const cache = new FileSystemCache({
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.stat('/some/file')
          .then(() => {
            cache.fileChanged.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if modifiedTime evaluated', () => {
        const cache = new FileSystemCache({
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readModifiedTime('/some/file')
          .then(() => {
            cache.fileChanged.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if readBuffer evaluated', () => {
        const cache = new FileSystemCache({
          readFile: () => Promise.resolve('test'),
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readBuffer('/some/file')
          .then(() => {
            cache.fileChanged.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if readText evaluated', () => {
        const cache = new FileSystemCache({
          readFile: () => Promise.resolve('test'),
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readText('/some/file')
          .then(() => {
            cache.fileChanged.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
      it('should trigger if readTextHash evaluated', () => {
        const cache = new FileSystemCache({
          readFile: () => Promise.resolve('test'),
          stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
        });
        const trap = cache.createTrap();
        let triggered;
        cache.trapTriggered.subscribe(obj => {
          triggered = obj.trap;
        });
        return trap.readTextHash('/some/file')
          .then(() => {
            cache.fileChanged.push('/some/file');
            assert.strictEqual(triggered, trap);
          });
      });
    });
    it('should validate rehydrated trap dependencies', () => {
      const cache = new FileSystemCache();
      const validating = cache.rehydrateTrap({
        [__filename]: {
          isFile: true,
          modifiedTime: fs.statSync(__filename).mtime.getTime(),
          textHash: generateStringHash(fs.readFileSync(__filename, 'utf8'))
        }
      });
      return validating
        .then(trap => {
          assert.instanceOf(trap, FileSystemTrap);
          assert.deepEqual(
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
    it('should invalidate rehydrated trap dependencies', () => {
      const cache = new FileSystemCache();
      const validating = cache.rehydrateTrap({
        [__filename]: {
          isFile: false
        }
      });
      return validating
        .then(trap => {
          assert.isNull(trap);
        });
    });
    it('should track rehydrated trap dependencies that are valid', () => {
      const cache = new FileSystemCache();
      const validating = cache.rehydrateTrap({
        [__filename]: {
          isFile: true
        }
      });
      return validating
        .then(trap => {
          const triggered = [];
          cache.trapTriggered.subscribe(obj => {
            assert.strictEqual(obj.trap, trap);
            assert.strictEqual(obj.path, __filename);
            assert.strictEqual(obj.cause, 'removed');
            triggered.push(obj.trap);
          });
          cache.fileRemoved.push(__filename);
          assert.equal(triggered.length, 1);
          assert.strictEqual(triggered[0], trap);
        });
    });
    it('should not track rehydrated trap dependencies that are invalid', () => {
      const cache = new FileSystemCache();
      const validating = cache.rehydrateTrap({
        [__filename]: {
          isFile: false
        }
      });
      return validating
        .then(() => {
          cache.trapTriggered.subscribe(() => {
            throw new Error('Should not be reached');
          });
          cache.fileRemoved.push(__filename);
        });
    });
  });
  describe('#FileSystemTrap', () => {
    it('should indicate a file dependency for a set of jobs', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
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
        assert.equal(stat.mtime.getTime(), actualStat.mtime.getTime());
        assert.equal(modifiedTime, actualStat.mtime.getTime());
        assert.equal(isFile, true);
        assert.instanceOf(buffer, Buffer);
        assert.equal(buffer.toString(), actualBuffer.toString());
        assert.equal(text, actualText);
        assert.equal(textHash, generateStringHash(actualText));

        assert.deepEqual(
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
    it('should indicate multiple file dependencies from multiple jobs', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return Promise.all([
        trap.isFile(__filename),
        trap.isFile('__NON_EXISTENT_FILE_1__'),
        trap.isFile('__NON_EXISTENT_FILE_2__')
      ]).then(([isFile1, isFile2, isFile3]) => {
        assert.equal(isFile1, true);
        assert.equal(isFile2, false);
        assert.equal(isFile3, false);

        assert.deepEqual(
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
    it('should describe file dependencies for isFile calls', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return trap.isFile(__filename)
        .then(() => {
          assert.deepEqual(
            trap.describeDependencies(),
            {
              [__filename]: {
                isFile: true
              }
            }
          );
        });
    });
    it('should describe file dependencies for stat calls', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return trap.stat(__filename)
        .then(() => {
          assert.deepEqual(
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
    it('should describe file dependencies for readModifiedTime calls', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return trap.readModifiedTime(__filename)
        .then(() => {
          assert.deepEqual(
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
    it('should describe file dependencies for readBuffer calls', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return trap.readBuffer(__filename)
        .then(() => {
          assert.deepEqual(
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
    it('should describe file dependencies for readText calls', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return trap.readText(__filename)
        .then(() => {
          assert.deepEqual(
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
    it('should describe file dependencies for readTextHash calls', () => {
      const cache = new FileSystemCache();
      const trap = cache.createTrap();
      return trap.readTextHash(__filename)
        .then(() => {
          assert.deepEqual(
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
  });
});