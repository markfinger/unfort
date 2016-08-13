"use strict";
const bluebird_1 = require('bluebird');
const rxjs_1 = require('rxjs');
const file_1 = require('./file');
const dependencies_1 = require('./dependencies');
const trap_1 = require('./trap');
const utils_1 = require('./utils');
class FileSystemCache {
    constructor(fileSystemOverrides) {
        this.files = new Map();
        this.trapsByFile = new Map();
        // Incoming data
        this.fileAdded = new rxjs_1.Subject();
        this.fileChanged = new rxjs_1.Subject();
        this.fileRemoved = new rxjs_1.Subject();
        // Outgoing data
        this.trapTriggered = new rxjs_1.Subject();
        this.fileSystem = {
            readFile: (fileSystemOverrides && fileSystemOverrides.readFile) || utils_1.readFile,
            stat: (fileSystemOverrides && fileSystemOverrides.stat) || utils_1.stat
        };
        // Handle incoming data
        this.fileAdded.subscribe((data) => this._handleFileAdded(data.path, data.stat));
        this.fileChanged.subscribe((data) => this._handleFileChanged(data.path, data.stat));
        this.fileRemoved.subscribe((data) => this._handleFileRemoved(data.path));
    }
    isFile(path) {
        return this._evaluateFileMethod('getIsFile', path);
    }
    stat(path) {
        return this._evaluateFileMethod('getStat', path);
    }
    readModifiedTime(path) {
        return this._evaluateFileMethod('getModifiedTime', path);
    }
    readBuffer(path) {
        return this._evaluateFileMethod('getBuffer', path);
    }
    readText(path) {
        return this._evaluateFileMethod('getText', path);
    }
    readTextHash(path) {
        return this._evaluateFileMethod('getTextHash', path);
    }
    createTrap() {
        return new trap_1.FileSystemTrap(this);
    }
    rehydrateTrap(dependencies) {
        return dependencies_1.validateFileSystemDependencies(this, dependencies)
            .then(isValid => {
            if (isValid) {
                const trap = this.createTrap();
                for (var path in dependencies) {
                    if (dependencies.hasOwnProperty(path)) {
                        trap.bindings.set(path, dependencies[path]);
                        this._bindTrapToFile(trap, path);
                    }
                }
                return trap;
            }
            return null;
        });
    }
    _bindTrapToFile(trap, path) {
        let traps = this.trapsByFile.get(path);
        if (!traps) {
            traps = new Set();
            this.trapsByFile.set(path, traps);
        }
        traps.add(trap);
    }
    _handleFileAdded(path, stat) {
        if (!this.files.has(path)) {
            this._createFile(path, stat);
        }
        const traps = this.trapsByFile.get(path);
        if (traps && traps.size) {
            const trapsToTrigger = [];
            for (const trap of traps) {
                const bindings = trap.bindings.get(path);
                if (bindings && bindings.isFile === false) {
                    trapsToTrigger.push(trap);
                }
            }
            this._triggerTraps(trapsToTrigger, path, 'added');
        }
    }
    _handleFileChanged(path, stat) {
        this._removeFile(path);
        this._createFile(path, stat);
        const traps = this.trapsByFile.get(path);
        if (traps && traps.size) {
            const trapsToTrigger = [];
            for (const trap of traps) {
                if (trap.triggerOnChange.get(path)) {
                    trapsToTrigger.push(trap);
                }
                else {
                    const bindings = trap.bindings.get(path);
                    if (bindings && (bindings.modifiedTime !== undefined || bindings.textHash !== undefined)) {
                        trapsToTrigger.push(trap);
                    }
                }
            }
            this._triggerTraps(trapsToTrigger, path, 'changed');
        }
    }
    _handleFileRemoved(path) {
        this._removeFile(path);
        const file = this._createFile(path);
        // Pre-populate the file's data
        file.setIsFile(false);
        const traps = this.trapsByFile.get(path);
        if (traps && traps.size) {
            const trapsToTrigger = [];
            for (const trap of traps) {
                if (trap.bindings.get(path).isFile === true) {
                    trapsToTrigger.push(trap);
                }
            }
            this._triggerTraps(trapsToTrigger, path, 'removed');
        }
    }
    _createFile(path, stat) {
        const file = new file_1.File(path, this.fileSystem);
        if (stat) {
            // Prepopulate the file's data
            file.setStat(stat);
            file.setIsFile(stat.isFile());
            file.setModifiedTime(stat.mtime.getTime());
        }
        this.files.set(path, file);
        return file;
    }
    _removeFile(path) {
        this.files.delete(path);
    }
    _evaluateFileMethod(methodName, path) {
        let file = this.files.get(path);
        if (!file) {
            file = this._createFile(path);
        }
        return file[methodName]()
            .then((data) => {
            const block = this._blockStaleFilesFromResolving(file);
            return block || data;
        }, (err) => {
            const block = this._blockStaleFilesFromResolving(file);
            return block || bluebird_1.Promise.reject(err);
        });
    }
    _blockStaleFilesFromResolving(file) {
        // If the file was removed during processing, we prevent the promise
        // chain from continuing and rely on the traps to signal the change
        if (file !== this.files.get(file.path)) {
            return new bluebird_1.Promise(() => { });
        }
        return null;
    }
    _triggerTraps(traps, path, cause) {
        const length = traps.length;
        if (length === 0) {
            return;
        }
        let i = length;
        // To avoid any inexplicable behaviour due to synchronous code evaluation
        // feeding back into the cache, we disengage every trap before signalling
        // any subscribers
        while (--i !== -1) {
            const trap = traps[i];
            for (const path of trap.bindings.keys()) {
                this.trapsByFile.get(path).delete(trap);
            }
        }
        i = length;
        while (--i !== -1) {
            this.trapTriggered.next({
                trap: traps[i],
                path,
                cause
            });
        }
    }
}
exports.FileSystemCache = FileSystemCache;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjYWNoZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsMkJBQXNCLFVBQVUsQ0FBQyxDQUFBO0FBQ2pDLHVCQUFzQixNQUFNLENBQUMsQ0FBQTtBQUM3Qix1QkFBbUIsUUFBUSxDQUFDLENBQUE7QUFDNUIsK0JBQTZDLGdCQUFnQixDQUFDLENBQUE7QUFDOUQsdUJBQTZCLFFBQVEsQ0FBQyxDQUFBO0FBQ3RDLHdCQUE2QixTQUFTLENBQUMsQ0FBQTtBQWV2QztJQVVFLFlBQVksbUJBQXlDO1FBUnJELFVBQUssR0FBRyxJQUFJLEdBQUcsRUFBZ0IsQ0FBQztRQUNoQyxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUErQixDQUFDO1FBQ3JELGdCQUFnQjtRQUNoQixjQUFTLEdBQUcsSUFBSSxjQUFPLEVBQVksQ0FBQztRQUNwQyxnQkFBVyxHQUFHLElBQUksY0FBTyxFQUFZLENBQUM7UUFDdEMsZ0JBQVcsR0FBRyxJQUFJLGNBQU8sRUFBWSxDQUFDO1FBQ3RDLGdCQUFnQjtRQUNoQixrQkFBYSxHQUFHLElBQUksY0FBTyxFQUFpQixDQUFDO1FBRTNDLElBQUksQ0FBQyxVQUFVLEdBQUc7WUFDaEIsUUFBUSxFQUFFLENBQUMsbUJBQW1CLElBQUksbUJBQW1CLENBQUMsUUFBUSxDQUFDLElBQUksZ0JBQVE7WUFDM0UsSUFBSSxFQUFFLENBQUMsbUJBQW1CLElBQUksbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksWUFBSTtTQUNoRSxDQUFDO1FBRUYsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxr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