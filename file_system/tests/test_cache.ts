import * as fs from 'fs';
import { Buffer } from 'buffer';
import test from 'ava';
import { generateStringHash } from '../../utils/hash';
import { FileSystemCache } from '../cache';
import { FileSystemTrap } from '../trap';
import { fileSystemInterface } from "../interfaces";
import { readFile, stat } from '../utils';
import {Stats} from "fs";

test('FileSystemCaches should produce the expected dataset of a file', (t) => {
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
    t.is(stat.mtime.getTime(), actualStat.mtime.getTime());
    t.is(modifiedTime, actualStat.mtime.getTime());
    t.true(isFile);
    t.truthy(buffer instanceof Buffer);
    t.is(buffer.toString(), actualBuffer.toString());
    t.is(text, actualText);
    t.is(textHash, generateStringHash(actualText));
  });
});

test('FileSystemCaches should only hit the filesystem once for a particular job on a file', (t) => {
  let called = false;

  function readFile() {
    if (called) {
      throw new Error('should not be called twice');
    }
    called = true;
    return Promise.resolve('text');
  }
  const cache = new FileSystemCache({readFile, stat} as fileSystemInterface);

  return Promise.all([
    cache.readText('/some/file.js'),
    cache.readText('/some/file.js')
  ])
    .then(([text1, text2]) => {
      t.is(text1, 'text');
      t.is(text2, 'text');
      return cache.readText('/some/file.js')
        .then(text => t.is(text, 'text'));
    });
});

test('FileSystemCaches should handle multiple concurrent file requests', (t) => {
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

  const cache = new FileSystemCache({readFile, stat} as fileSystemInterface);

  return Promise.all([
    cache.readText('test 1'),
    cache.stat('test 1'),
    cache.readText('test 2'),
    cache.stat('test 2')
  ])
    .then(([text1, stat1, text2, stat2]) => {
      t.is(text1, 'text 1');
      t.is(stat1 as any, 'stat 1');
      t.is(text2, 'text 2');
      t.is(stat2 as any, 'stat 2');
    });
});

test('FileSystemCaches should intercept jobs for files that are removed during processing', (t) => {
  const cache = new FileSystemCache({
    readFile: () => Promise.resolve('test'),
    stat
  } as fileSystemInterface);
  let completed = false;
  cache.readText('/some/file')
    .then(() => completed = true);
  cache.fileRemoved.next({path: '/some/file'});
  return new Promise(res => {
    process.nextTick(() => {
      t.false(completed);
      res();
    });
  });
});

test('FileSystemCaches should provide fs access for traps', (t) => {
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
  return trap.readText('/some/test/file')
    .then(text => t.is(text, 'test'));
});

test('FileSystemCaches should track the file dependencies for traps', (t) => {
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
  t.deepEqual(
    trap1.describeDependencies(),
    {}
  );
  t.deepEqual(
    trap1.describeDependencies(),
    {}
  );
  t.deepEqual(
    trap1.describeDependencies(),
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
      t.deepEqual(
        trap1.describeDependencies() as any,
        {
          '/some/test/file': {
            isFile: true,
            modifiedTime: date.getTime(),
            textHash: '3127628307'
          }
        }
      );
      t.deepEqual(
        trap2.describeDependencies() as any,
        {
          '/some/test/file': {
            isFile: true,
            modifiedTime: date.getTime(),
            textHash: '3127628307'
          }
        }
      );
      t.deepEqual(
        trap3.describeDependencies() as any,
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

test('FileSystemCaches should trigger traps for file creation', (t) => {
  const cache = new FileSystemCache({
    stat() {
      return Promise.resolve({
        isFile() {
          return false;
        }
      });
    },
    readFile
  } as fileSystemInterface);
  const trap1 = cache.createTrap();
  const trap2 = cache.createTrap();
  const triggered = [];
  cache.trapTriggered.subscribe(obj => {
    t.is(obj.trap, trap1);
    t.is(obj.path, '/some/file');
    t.is(obj.cause, 'added');
    triggered.push(obj.trap);
  });
  return Promise.all([
    trap1.isFile('/some/file'),
    trap2.isFile('/some/other/file')
  ])
    .then(data => {
      t.deepEqual(data, [false, false]);
      t.is(triggered.length, 0);
      cache.fileAdded.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap1);
    });
});

test('FileSystemCaches should not re-trigger traps for file creation', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => false}),
    readFile
  } as fileSystemInterface);
  const trap1 = cache.createTrap();
  const triggered = [];
  cache.trapTriggered.subscribe(obj => {
    t.is(obj.trap, trap1);
    t.is(obj.path, '/some/file');
    t.is(obj.cause, 'added');
    triggered.push(obj.trap);
  });
  return trap1.isFile('/some/file')
    .then(isFile => {
      t.false(isFile);
      t.is(triggered.length, 0);
      cache.fileAdded.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap1);
      cache.fileAdded.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap1);
    });
});

test('FileSystemCaches should trigger traps for file deletion', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true}),
    readFile
  } as fileSystemInterface);
  const trap1 = cache.createTrap();
  const trap2 = cache.createTrap();
  const triggered = [];
  cache.trapTriggered.subscribe(obj => {
    t.is(obj.trap, trap1);
    t.is(obj.path, '/some/file');
    t.is(obj.cause, 'removed');
    triggered.push(obj.trap);
  });
  return Promise.all([
    trap1.isFile('/some/file'),
    trap2.isFile('/some/other/file')
  ])
    .then(data => {
      t.deepEqual(data, [true, true]);
      t.is(triggered.length, 0);
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap1);
    });
});

test('FileSystemCaches should not re-trigger traps for file deletion', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  const triggered = [];
  cache.trapTriggered.subscribe(obj => {
    t.is(obj.trap, trap);
    t.is(obj.path, '/some/file');
    t.is(obj.cause, 'removed');
    triggered.push(obj.trap);
  });
  return trap.isFile('/some/file')
    .then(isFile => {
      t.deepEqual(isFile, true);
      t.is(triggered.length, 0);
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap);
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap);
    });
});

test('FileSystemCaches should trigger traps for file changes', (t) => {
  const cache = new FileSystemCache({
    readFile: () => Promise.resolve('text'),
    stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
  });
  const trap1 = cache.createTrap();
  const trap2 = cache.createTrap();
  const triggered = [];
  cache.trapTriggered.subscribe(obj => {
    t.is(obj.trap, trap1);
    t.is(obj.path, '/some/file');
    t.is(obj.cause, 'changed');
    triggered.push(obj.trap);
  });
  return Promise.all([
    trap1.readText('/some/file'),
    trap2.readText('/some/other/file')
  ])
    .then(data => {
      t.deepEqual(data, ['text', 'text']);
      t.is(triggered.length, 0);
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap1);
    });
});

test('FileSystemCaches should not re-trigger traps for file changes', (t) => {
  const cache = new FileSystemCache({
    readFile: () => Promise.resolve('text'),
    stat: () => Promise.resolve({isFile: () => true, mtime: new Date()})
  });
  const trap = cache.createTrap();
  const triggered = [];
  cache.trapTriggered.subscribe(obj => {
    t.is(obj.trap, trap);
    t.is(obj.path, '/some/file');
    t.is(obj.cause, 'changed');
    triggered.push(obj.trap);
  });
  return trap.readText('/some/file')
    .then(text => {
      t.is(text, 'text');
      t.is(triggered.length, 0);
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap);
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap);
    });
});

test('FileSystemCaches should prepopulate file stats when possible', (t) => {
  const stat = {mtime: new Date(2000, 1, 1), isFile: () => true, isDirectory: () => false} as Stats;
  const cache = new FileSystemCache();
  const trap = cache.createTrap();
  cache.fileAdded.next({path: '/some/file', stat});
  return trap.stat('/some/file')
    .then(_stat => {
      t.is(_stat, stat);
    });
});

test('FileSystemCaches should trigger if isFile evaluated to False', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => false}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  let triggered;
  cache.trapTriggered.subscribe(obj => {
    triggered = obj.trap;
  });
  return trap.isFile('/some/file')
    .then(() => {
      cache.fileAdded.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if isFile evaluated to true', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  let triggered;
  cache.trapTriggered.subscribe(obj => {
    triggered = obj.trap;
  });
  return trap.isFile('/some/file')
    .then(() => {
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if stat evaluated', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true, mtime: new Date()}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  let triggered;
  cache.trapTriggered.subscribe(obj => {
    triggered = obj.trap;
  });
  return trap.stat('/some/file')
    .then(() => {
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if modifiedTime evaluated', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true, mtime: new Date()}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  let triggered;
  cache.trapTriggered.subscribe(obj => {
    triggered = obj.trap;
  });
  return trap.readModifiedTime('/some/file')
    .then(() => {
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if readBuffer evaluated', (t) => {
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
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if readText evaluated', (t) => {
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
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if readTextHash evaluated', (t) => {
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
      cache.fileRemoved.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if stat evaluated', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true, mtime: new Date()}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  let triggered;
  cache.trapTriggered.subscribe(obj => {
    triggered = obj.trap;
  });
  return trap.stat('/some/file')
    .then(() => {
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if modifiedTime evaluated', (t) => {
  const cache = new FileSystemCache({
    stat: () => Promise.resolve({isFile: () => true, mtime: new Date()}),
    readFile
  } as fileSystemInterface);
  const trap = cache.createTrap();
  let triggered;
  cache.trapTriggered.subscribe(obj => {
    triggered = obj.trap;
  });
  return trap.readModifiedTime('/some/file')
    .then(() => {
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if readBuffer evaluated', (t) => {
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
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if readText evaluated', (t) => {
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
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should trigger if readTextHash evaluated', (t) => {
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
      cache.fileChanged.next({path: '/some/file'});
      t.is(triggered, trap);
    });
});

test('FileSystemCaches should validate rehydrated trap dependencies', (t) => {
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
      t.truthy(trap instanceof FileSystemTrap);
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

test('FileSystemCaches should invalidate rehydrated trap dependencies', (t) => {
  const cache = new FileSystemCache();
  const validating = cache.rehydrateTrap({
    [__filename]: {
      isFile: false
    }
  });
  return validating
    .then(trap => {
      t.is(trap, null);
    });
});

test('FileSystemCaches should track rehydrated trap dependencies that are valid', (t) => {
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
        t.is(obj.trap, trap);
        t.is(obj.path, __filename);
        t.is(obj.cause, 'removed');
        triggered.push(obj.trap);
      });
      cache.fileRemoved.next({path: __filename});
      t.is(triggered.length, 1);
      t.is(triggered[0], trap);
    });
});

test('FileSystemCaches should not track rehydrated trap dependencies that are invalid', () => {
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
      cache.fileRemoved.next({path: __filename});
    });
});