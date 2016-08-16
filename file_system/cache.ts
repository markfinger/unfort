import {Promise} from 'bluebird';
import {Subject} from 'rxjs';
import {File} from './file';
import {validateFileSystemDependencies} from './dependencies';
import {FileSystemTrap} from './trap';
import {readFile, stat, readDirectory} from './utils';
import {fileSystemInterface, fileSystemInterfaceOverrides, fileSystemCache} from "./interfaces";
import {Stats} from "fs";

export interface triggeredTrap {
  trap: FileSystemTrap;
  path: string;
  cause: string;
}

export interface fileFeed {
  path: string;
  stat?: Stats;
}

export class FileSystemCache implements fileSystemCache {
  fileSystem: fileSystemInterface;
  files = new Map<string, File>();
  trapsByFile = new Map<string, Set<FileSystemTrap>>();
  // Incoming data
  fileAdded = new Subject<fileFeed>();
  fileChanged = new Subject<fileFeed>();
  fileRemoved = new Subject<fileFeed>();
  // Outgoing data
  trapTriggered = new Subject<triggeredTrap>();
  constructor(fileSystemOverrides?: fileSystemInterfaceOverrides) {
    this.fileSystem = {
      readFile: (fileSystemOverrides && fileSystemOverrides.readFile) || readFile,
      stat: (fileSystemOverrides && fileSystemOverrides.stat) || stat,
      readDirectory: (fileSystemOverrides && fileSystemOverrides.readDirectory) || readDirectory
    };

    // Handle incoming data
    this.fileAdded.subscribe((data) => this._handleFileAdded(data.path, data.stat));
    this.fileChanged.subscribe((data) => this._handleFileChanged(data.path, data.stat));
    this.fileRemoved.subscribe((data) => this._handleFileRemoved(data.path));
  }
  isFile(path: string): Promise<boolean> {
    return this._evaluateFileMethod('getIsFile', path);
  }
  stat(path: string): Promise<Stats> {
    return this._evaluateFileMethod('getStat', path);
  }
  readModifiedTime(path: string): Promise<number> {
    return this._evaluateFileMethod('getModifiedTime', path);
  }
  readBuffer(path: string): Promise<Buffer> {
    return this._evaluateFileMethod('getBuffer', path);
  }
  readText(path: string): Promise<string> {
    return this._evaluateFileMethod('getText', path);
  }
  readTextHash(path: string): Promise<string> {
    return this._evaluateFileMethod('getTextHash', path);
  }
  readDirectoryContents(path: string): Promise<string[]> {
    return this._evaluateFileMethod('getDirectoryContents', path);
  }
  createTrap() {
    return new FileSystemTrap(this);
  }
  rehydrateTrap(dependencies) {
    return validateFileSystemDependencies(this, dependencies)
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
        } else {
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
  _createFile(path, stat?: Stats): File {
    const file = new File(path, this.fileSystem);
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
      .then(
        (data) => {
          const block = this._blockStaleFilesFromResolving(file);
          return block || data;
        },
        (err) => {
          const block = this._blockStaleFilesFromResolving(file);
          return block || Promise.reject(err);
        }
      );
  }
  _blockStaleFilesFromResolving(file) {
    // If the file was removed during processing, we prevent the promise
    // chain from continuing and rely on the traps to signal the change
    if (file !== this.files.get(file.path)) {
      return new Promise(() => {});
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
    while(--i !== -1) {
      const trap = traps[i];
      for (const path of trap.bindings.keys()) {
        this.trapsByFile.get(path).delete(trap);
      }
    }
    i = length;
    while(--i !== -1) {
      this.trapTriggered.next({
        trap: traps[i],
        path,
        cause
      });
    }
  }
}
