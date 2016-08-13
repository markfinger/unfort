"use strict";
const fs = require('fs');
const buffer_1 = require('buffer');
const ava_1 = require('ava');
const hash_1 = require('../../utils/hash');
const cache_1 = require('../cache');
const trap_1 = require('../trap');
ava_1.default('FileSystemTrap should indicate a file dependency for a set of jobs', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    t.truthy(trap instanceof trap_1.FileSystemTrap);
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
        t.truthy(buffer instanceof buffer_1.Buffer);
        t.is(buffer.toString(), actualBuffer.toString());
        t.is(text, actualText);
        t.is(textHash, hash_1.generateStringHash(actualText));
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: modifiedTime,
                textHash: textHash
            }
        });
    });
});
ava_1.default('FileSystemTrap should indicate multiple file dependencies from multiple jobs', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return Promise.all([
        trap.isFile(__filename),
        trap.isFile('__NON_EXISTENT_FILE_1__'),
        trap.isFile('__NON_EXISTENT_FILE_2__')
    ]).then(([isFile1, isFile2, isFile3]) => {
        t.is(isFile1, true);
        t.is(isFile2, false);
        t.is(isFile3, false);
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true
            },
            __NON_EXISTENT_FILE_1__: {
                isFile: false
            },
            __NON_EXISTENT_FILE_2__: {
                isFile: false
            }
        });
    });
});
ava_1.default('FileSystemTrap should describe file dependencies for isFile calls', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return trap.isFile(__filename)
        .then(() => {
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true
            }
        });
    });
});
ava_1.default('FileSystemTrap should describe file dependencies for stat calls', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return trap.stat(__filename)
        .then(() => {
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: fs.statSync(__filename).mtime.getTime()
            }
        });
    });
});
ava_1.default('FileSystemTrap should describe file dependencies for readModifiedTime calls', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return trap.readModifiedTime(__filename)
        .then(() => {
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: fs.statSync(__filename).mtime.getTime()
            }
        });
    });
});
ava_1.default('FileSystemTrap should describe file dependencies for readBuffer calls', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return trap.readBuffer(__filename)
        .then(() => {
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: fs.statSync(__filename).mtime.getTime()
            }
        });
    });
});
ava_1.default('FileSystemTrap should describe file dependencies for readText calls', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return trap.readText(__filename)
        .then(() => {
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: fs.statSync(__filename).mtime.getTime(),
                textHash: hash_1.generateStringHash(fs.readFileSync(__filename, 'utf8'))
            }
        });
    });
});
ava_1.default('FileSystemTrap should describe file dependencies for readTextHash calls', (t) => {
    const cache = new cache_1.FileSystemCache();
    const trap = cache.createTrap();
    return trap.readTextHash(__filename)
        .then(() => {
        t.deepEqual(trap.describeDependencies(), {
            [__filename]: {
                isFile: true,
                modifiedTime: fs.statSync(__filename).mtime.getTime(),
                textHash: hash_1.generateStringHash(fs.readFileSync(__filename, 'utf8'))
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF90cmFwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidGVzdF90cmFwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6Qix5QkFBcUIsUUFBUSxDQUFDLENBQUE7QUFDOUIsc0JBQWlCLEtBQUssQ0FBQyxDQUFBO0FBQ3ZCLHVCQUFpQyxrQkFBa0IsQ0FBQyxDQUFBO0FBQ3BELHdCQUE4QixVQUFVLENBQUMsQ0FBQTtBQUN6Qyx1QkFBNkIsU0FBUyxDQUFDLENBQUE7QUFFdkMsYUFBSSxDQUFDLG9FQUFvRSxFQUFFLENBQUMsQ0FBQztJQUMzRSxNQUFNLEtBQUssR0FBRyxJQUFJLHVCQUFlLEVBQUUsQ0FBQztJQUNwQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDaEMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLFlBQVkscUJBQWMsQ0FBQyxDQUFDO0lBQ3pDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUM7UUFDakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUM7UUFDM0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUM7S0FDOUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUM7UUFDM0QsTUFBTSxZQUFZLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNqRCxNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUMsWUFBWSxD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