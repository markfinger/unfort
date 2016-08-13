"use strict";
const fs = require('fs');
const buffer_1 = require('buffer');
const ava_1 = require('ava');
const hash_1 = require('../../utils/hash');
const cache_1 = require('../cache');
const trap_1 = require('../trap');
const utils_1 = require('../utils');
ava_1.default('FileSystemCaches should produce the expected dataset of a file', (t) => {
    const cache = new cache_1.FileSystemCache();
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
        t.truthy(buffer instanceof buffer_1.Buffer);
        t.is(buffer.toString(), actualBuffer.toString());
        t.is(text, actualText);
        t.is(textHash, hash_1.generateStringHash(actualText));
    });
});
ava_1.default('FileSystemCaches should only hit the filesystem once for a particular job on a file', (t) => {
    let called = false;
    function readFile() {
        if (called) {
            throw new Error('should not be called twice');
        }
        called = true;
        return Promise.resolve('text');
    }
    const cache = new cache_1.FileSystemCache({ readFile, stat: utils_1.stat });
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
ava_1.default('FileSystemCaches should handle multiple concurrent file requests', (t) => {
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
    const cache = new cache_1.FileSystemCache({ readFile, stat });
    return Promise.all([
        cache.readText('test 1'),
        cache.stat('test 1'),
        cache.readText('test 2'),
        cache.stat('test 2')
    ])
        .then(([text1, stat1, text2, stat2]) => {
        t.is(text1, 'text 1');
        t.is(stat1, 'stat 1');
        t.is(text2, 'text 2');
        t.is(stat2, 'stat 2');
    });
});
ava_1.default('FileSystemCaches should intercept jobs for files that are removed during processing', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: utils_1.stat
    });
    let completed = false;
    cache.readText('/some/file')
        .then(() => completed = true);
    cache.fileRemoved.next({ path: '/some/file' });
    return new Promise(res => {
        process.nextTick(() => {
            t.false(completed);
            res();
        });
    });
});
ava_1.default('FileSystemCaches should provide fs access for traps', (t) => {
    const cache = new cache_1.FileSystemCache({
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
ava_1.default('FileSystemCaches should track the file dependencies for traps', (t) => {
    const date = new Date(2000, 1, 1, 1, 1);
    const cache = new cache_1.FileSystemCache({
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
    t.deepEqual(trap1.describeDependencies(), {});
    t.deepEqual(trap1.describeDependencies(), {});
    t.deepEqual(trap1.describeDependencies(), {});
    return Promise.all([
        trap1.stat('/some/test/file'),
        trap2.stat('/some/test/file'),
        trap3.stat('/some/other/test/file'),
        trap1.readText('/some/test/file'),
        trap2.readText('/some/test/file'),
        trap3.readText('/some/other/test/file'),
    ])
        .then(() => {
        t.deepEqual(trap1.describeDependencies(), {
            '/some/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
            }
        });
        t.deepEqual(trap2.describeDependencies(), {
            '/some/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
            }
        });
        t.deepEqual(trap3.describeDependencies(), {
            '/some/other/test/file': {
                isFile: true,
                modifiedTime: date.getTime(),
                textHash: '3127628307'
            }
        });
    });
});
ava_1.default('FileSystemCaches should trigger traps for file creation', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat() {
            return Promise.resolve({
                isFile() {
                    return false;
                }
            });
        },
        readFile: utils_1.readFile
    });
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
        cache.fileAdded.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap1);
    });
});
ava_1.default('FileSystemCaches should not re-trigger traps for file creation', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => false }),
        readFile: utils_1.readFile
    });
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
        cache.fileAdded.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap1);
        cache.fileAdded.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap1);
    });
});
ava_1.default('FileSystemCaches should trigger traps for file deletion', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true }),
        readFile: utils_1.readFile
    });
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
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap1);
    });
});
ava_1.default('FileSystemCaches should not re-trigger traps for file deletion', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true }),
        readFile: utils_1.readFile
    });
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
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap);
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap);
    });
});
ava_1.default('FileSystemCaches should trigger traps for file changes', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('text'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
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
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap1);
    });
});
ava_1.default('FileSystemCaches should not re-trigger traps for file changes', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('text'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
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
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap);
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap);
    });
});
ava_1.default('FileSystemCaches should prepopulate file stats when possible', (t) => {
    const stat = { mtime: new Date(2000, 1, 1), isFile: () => true, isDirectory: () => false };
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    cache.fileAdded.next({ path: '/some/file', stat });
    return trap.stat('/some/file')
        .then(_stat => {
        t.is(_stat, stat);
    });
});
ava_1.default('FileSystemCaches should trigger if isFile evaluated to False', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => false }),
        readFile: utils_1.readFile
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.isFile('/some/file')
        .then(() => {
        cache.fileAdded.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if isFile evaluated to true', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true }),
        readFile: utils_1.readFile
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.isFile('/some/file')
        .then(() => {
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if stat evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() }),
        readFile: utils_1.readFile
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.stat('/some/file')
        .then(() => {
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if modifiedTime evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() }),
        readFile: utils_1.readFile
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readModifiedTime('/some/file')
        .then(() => {
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if readBuffer evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readBuffer('/some/file')
        .then(() => {
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if readText evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readText('/some/file')
        .then(() => {
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if readTextHash evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readTextHash('/some/file')
        .then(() => {
        cache.fileRemoved.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if stat evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() }),
        readFile: utils_1.readFile
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.stat('/some/file')
        .then(() => {
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if modifiedTime evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() }),
        readFile: utils_1.readFile
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readModifiedTime('/some/file')
        .then(() => {
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if readBuffer evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readBuffer('/some/file')
        .then(() => {
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if readText evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readText('/some/file')
        .then(() => {
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should trigger if readTextHash evaluated', (t) => {
    const cache = new cache_1.FileSystemCache({
        readFile: () => Promise.resolve('test'),
        stat: () => Promise.resolve({ isFile: () => true, mtime: new Date() })
    });
    const trap = cache.createTrap();
    let triggered;
    cache.trapTriggered.subscribe(obj => {
        triggered = obj.trap;
    });
    return trap.readTextHash('/some/file')
        .then(() => {
        cache.fileChanged.next({ path: '/some/file' });
        t.is(triggered, trap);
    });
});
ava_1.default('FileSystemCaches should validate rehydrated trap dependencies', (t) => {
    const cache = new cache_1.FileSystemCache();
    const validating = cache.rehydrateTrap({
        [__filename]: {
            isFile: true,
            modifiedTime: fs.statSync(__filename).mtime.getTime(),
            textHash: hash_1.generateStringHash(fs.readFileSync(__filename, 'utf8'))
        }
    });
    return validating
        .then(trap => {
        t.truthy(trap instanceof trap_1.FileSystemTrap);
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: fs.statSync(__filename).mtime.getTime(),
                textHash: hash_1.generateStringHash(fs.readFileSync(__filename, 'utf8'))
            }
        });
    });
});
ava_1.default('FileSystemCaches should invalidate rehydrated trap dependencies', (t) => {
    const cache = new cache_1.FileSystemCache();
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
ava_1.default('FileSystemCaches should track rehydrated trap dependencies that are valid', (t) => {
    const cache = new cache_1.FileSystemCache();
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
        cache.fileRemoved.next({ path: __filename });
        t.is(triggered.length, 1);
        t.is(triggered[0], trap);
    });
});
ava_1.default('FileSystemCaches should not track rehydrated trap dependencies that are invalid', () => {
    const cache = new cache_1.FileSystemCache();
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
        cache.fileRemoved.next({ path: __filename });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9jYWNoZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRlc3RfY2FjaGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLHlCQUF1QixRQUFRLENBQUMsQ0FBQTtBQUNoQyxzQkFBaUIsS0FBSyxDQUFDLENBQUE7QUFDdkIsdUJBQW1DLGtCQUFrQixDQUFDLENBQUE7QUFDdEQsd0JBQWdDLFVBQVUsQ0FBQyxDQUFBO0FBQzNDLHVCQUErQixTQUFTLENBQUMsQ0FBQTtBQUV6Qyx3QkFBK0IsVUFBVSxDQUFDLENBQUE7QUFHMUMsYUFBSSxDQUFDLGdFQUFnRSxFQUFFLENBQUMsQ0FBQztJQUN2RSxNQUFNLEtBQUssR0FBRyxJQUFJLHVCQUFlLEVBQUUsQ0FBQztJQUNwQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztRQUNqQixLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUN0QixLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDO1FBQ2xDLEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ3hCLEtBQUssQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDO1FBQzVCLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO1FBQzFCLEtBQUssQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDO0tBQy9CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDO1FBQzNELE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDakQsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdkQsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FB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QUMsQ0FBQztRQUNsRCwwQkFBUTtLQUNjLENBQUMsQ0FBQztJQUMxQixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDakMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUc7UUFDL0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsQ0FBQztRQUM3QixDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekIsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDM0IsQ0FBQyxDQUFDLENBQUM7SUFDSCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUM7U0FDOUIsSUFBSSxDQUFDLE1BQU07UUFDVixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQixLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFDLElBQUksRUFBRSxZQUFZLEVBQUMsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQixDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxQixLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFDLElBQUksRUFBRSxZQUFZLEVBQUMsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMs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