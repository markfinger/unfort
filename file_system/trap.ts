import {FileSystemCache} from './cache';
import {fileSystemCache, fileSystemDependency} from './interfaces';

export class FileSystemTrap implements fileSystemCache {
  cache: FileSystemCache;
  bindings: Map<string, fileSystemDependency>;
  boundFiles: Map<string, boolean>;
  triggerOnChange: Map<string, boolean>;
  constructor(cache) {
    this.cache = cache;
    this.bindings = new Map();
    this.boundFiles = new Map();
    this.triggerOnChange = new Map();
  }
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
  isFileCallBack(path, cb) {
    return this.isFile(path)
      .then(
        isFile => cb(null, isFile),
        err => cb(err)
      );
  }
  stat(path) {
    this._ensureBindingToFile(path);
    this.triggerOnChange[path] = true;
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
    this._ensureBindingToFile(path);
    this.triggerOnChange[path] = true;
    return this.cache.readModifiedTime(path)
      .then(modifiedTime => {
        const bindings = this._getFileBindings(path);
        bindings.isFile = true;
        bindings.modifiedTime = modifiedTime;
        return modifiedTime;
      });
  }
  readBuffer(path) {
    this._ensureBindingToFile(path);
    this.triggerOnChange[path] = true;
    return this.cache.readBuffer(path)
      .then(buffer => {
        // Rely on `readModifiedTime` to bind its dependencies
        return this.readModifiedTime(path)
          .then(() => buffer);
      });
  }
  readText(path) {
    this._ensureBindingToFile(path);
    this.triggerOnChange[path] = true;
    return this.cache.readText(path)
      .then(text => {
        // Rely on `readTextHash` to bind its dependencies
        return this.readTextHash(path)
          .then(() => text);
      });
  }
  readTextCallBack(path, cb) {
    return this.readText(path)
      .then(
        text => cb(null, text),
        err => cb(err)
      );
  }
  readTextHash(path) {
    this._ensureBindingToFile(path);
    this.triggerOnChange[path] = true;
    return this.cache.readTextHash(path)
      .then(textHash => {
        // Rely on `readModifiedTime` to bind its dependencies
        return this.readModifiedTime(path)
          .then(() => {
            const bindings = this._getFileBindings(path);
            if (bindings.textHash === undefined) {
              bindings.textHash = textHash;
            }
            return textHash;
          });
      });
  }
  describeDependencies(): any {
    const description = {};
    for (const [key, value] of this.bindings) {
      description[key] = value;
    }
    return description;
  }
  _ensureBindingToFile(path) {
    if (!this.boundFiles.has(path)) {
      this.boundFiles.set(path, true);
      this.cache._bindTrapToFile(this, path);
    }
  }
  _getFileBindings(path): fileSystemDependency {
    let bindings = this.bindings.get(path);
    if (!bindings) {
      bindings = {} as fileSystemDependency;
      this.bindings.set(path, bindings);
      this._ensureBindingToFile(path);
    }
    return bindings;
  }
}