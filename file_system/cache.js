const fs = require('fs');
const {promisify} = require('bluebird');
const {EventBus} = require('../utils/event_bus');
const {File} = require('./file');
const {validateFileSystemDependencies} = require('./dependencies');

class FileSystemCache {
  constructor(fileSystem={}) {
    this.fileSystem = {
      readFile: fileSystem.readFile || promisify(fs.readFile),
      stat: fileSystem.stat || promisify(fs.stat)
    };
    this.files = Object.create(null);
    this.trapsByFile = Object.create(null);

    // Incoming data
    this.fileAdded = new EventBus();
    this.fileChanged = new EventBus();
    this.fileRemoved = new EventBus();

    // Outgoing data
    this.trapTriggered = new EventBus();

    // Handle incoming data
    this.fileAdded.subscribe((path, stat) => this._handleFileAdded(path, stat));
    this.fileChanged.subscribe((path, stat) => this._handleFileChanged(path, stat));
    this.fileRemoved.subscribe(path => this._handleFileRemoved(path));
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
    return new FileSystemTrap(this);
  }
  rehydrateTrap(dependencies) {
    const trap = this.createTrap();
    trap.preventBindingsToCache();
    return validateFileSystemDependencies(trap, dependencies)
      .then(isValid => {
        if (isValid) {
          trap.applyBindingsToCache();
          return trap;
        }
        return null;
      })
  }
  _bindTrapToFile(trap, path) {
    let traps = this.trapsByFile[path];
    if (!traps) {
      traps = new Set();
      this.trapsByFile[path] = traps;
    }
    traps.add(trap);
  }
  _handleFileAdded(path, stat) {
    const file = this.files[path];

    if (!file) {
      this._createFile(path, stat);
      return;
    }

    if (
      stat &&
      file._resolvedStat &&
      file._resolvedStat.mtime.getTime() < stat.mtime.getTime()
    ) {
      this._removeFile(path);
      this._createFile(path, stat);
    }

    const traps = this.trapsByFile[path];
    if (traps && traps.size) {
      const trapsToTrigger = [];
      for (let trap of traps) {
        if (trap.files[path].isFile === false) {
          trapsToTrigger.push(trap);
        }
      }
      this._triggerTraps(trapsToTrigger, path, 'added');
    }
  }
  _handleFileChanged(path, stat) {
    this._removeFile(path);
    this._createFile(path, stat);

    const traps = this.trapsByFile[path];
    if (traps && traps.size) {
      const trapsToTrigger = [];
      for (let trap of traps) {
        const file = trap.files[path];
        if (file.modifiedTime !== undefined || file.textHash !== undefined) {
          trapsToTrigger.push(trap);
        }
      }
      this._triggerTraps(trapsToTrigger, path, 'changed');
    }
  }
  _handleFileRemoved(path) {
    this._removeFile(path);

    const traps = this.trapsByFile[path];
    if (traps && traps.size) {
      const trapsToTrigger = [];
      for (let trap of traps) {
        if (trap.files[path].isFile === true) {
          trapsToTrigger.push(trap);
        }
      }
      this._triggerTraps(trapsToTrigger, path, 'removed');
    }
  }
  _createFile(path, stat) {
    const file = new File(path, this.fileSystem);
    if (stat) {
      file.setStat(stat);
      file.setModifiedTime(stat.mtime.getTime());
    }
    this.files[path] = file;
    return file;
  }
  _removeFile(path) {
    this.files[path] = null;
  }
  _evaluateFileMethod(methodName, path) {
    let file = this.files[path];
    if (!file) {
      file = this._createFile(path);
    }
    return file[methodName]()
      .catch(err => {
        this._ensureFileIsValid(file, methodName);
        return Promise.reject(err);
      })
      .then(data => {
        this._ensureFileIsValid(file, methodName);
        return data;
      });
  }
  /**
   * If a file is invalidated while jobs are being performed on it,
   * this method enables promise chains to be unrolled, so that the
   * jobs can restarted with valid data
   */
  _ensureFileIsValid(file, job) {
    if (this.files[file.path] !== file) {
      throw new StaleFileIntercept(file.path, job);
    }
  }
  _triggerTraps(traps, path, cause) {
    const length = traps.length;
    if (length === 0) {
      return;
    }
    let i = length;
    // To avoid any inexplicable behaviour due to synchronous code evaluating
    // feeding back into the cache, we disengage every trap before signalling
    // any subscribers
    while(--i !== -1) {
      const trap = traps[i];
      for (let path in trap.files) {
        this.trapsByFile[path].delete(trap);
      }
    }
    i = length;
    while(--i !== -1) {
      this.trapTriggered.push({
        trap: traps[i],
        path,
        cause
      });
    }
  }
}

class FileSystemTrap {
  constructor(cache) {
    this.cache = cache;
    this.files = Object.create(null);
    this._shouldBindToCache = true;
  }
  // TODO prevent clobbering previous data
  // TODO concurrent requests
  isFile(path) {
    return this.cache.isFile(path)
      .then(isFile => {
        const bindings = this._getFileBindings(path);
        if (bindings.isFile === undefined) {
          bindings.isFile = isFile;
        }
        return isFile;
      });
  }
  stat(path) {
    return this.cache.stat(path)
      .then(stat => {
        const bindings = this._getFileBindings(path);
        bindings.isFile = true;
        if (bindings.modifiedTime === undefined) {
          bindings.modifiedTime = stat.mtime.getTime();
        }
        return stat;
      });
  }
  readModifiedTime(path) {
    return this.cache.readModifiedTime(path)
      .then(modifiedTime => {
        const bindings = this._getFileBindings(path);
        bindings.isFile = true;
        bindings.modifiedTime = modifiedTime;
        return modifiedTime;
      });
  }
  readBuffer(path) {
    return this.cache.readBuffer(path)
      .then(buffer => {
        // Rely on `readModifiedTime` to bind the dependency
        return this.readModifiedTime(path)
          .then(() => buffer);
      });
  }
  readText(path) {
    return this.cache.readText(path)
      .then(text => {
        // Rely on `readModifiedTime` and `readTextHash` to
        // bind their dependencies
        return this.readTextHash(path)
          .then(() => text);
      });
  }
  readTextHash(path) {
    return this.cache.readTextHash(path)
      .then(textHash => {
        return this.readModifiedTime(path)
          .then(() => {
            const bindings = this._getFileBindings(path);
            if (bindings.textHash === undefined) {
              bindings.textHash = textHash;
            }
            return textHash;
          })
      });
  }
  describeDependencies() {
    return this.files;
  }
  preventBindingsToCache() {
    this._shouldBindToCache = false;
  }
  applyBindingsToCache() {
    if (!this._shouldBindToCache) {
      this._shouldBindToCache = true;
      for (let path in this.files) {
        this.cache._bindTrapToFile(this, path);
      }
    }
  }
  _getFileBindings(path) {
    let bindings = this.files[path];
    if (!bindings) {
      bindings = {};
      if (this._shouldBindToCache) {
        this.cache._bindTrapToFile(this, path);
      }
      this.files[path] = bindings;
    }
    return bindings;
  }
}

class StaleFileIntercept extends Error {
  constructor(path, job) {
    super();
    this.message = `File "${path}" was intercepted for job "${job}" as it had been changed or removed during processing`;
  }
}

module.exports = {
  FileSystemCache,
  StaleFileIntercept,
  FileSystemTrap
};