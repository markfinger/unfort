import { Promise } from 'bluebird';
import { generateStringHash } from '../common';
import { fileSystemInterface } from './interfaces';
import { Stats } from 'fs';

export class File {
  path: string;
  fileSystem: fileSystemInterface;
  protected stat: Promise<Stats>;
  protected modifiedTime: Promise<number>;
  protected isFile: Promise<boolean>;
  protected isDirectory: Promise<boolean>;
  protected buffer: Promise<Buffer>;
  protected text: Promise<string>;
  protected textHash: Promise<string>;
  protected contents: Promise<string[]>;
  constructor(path, fileSystem) {
    this.path = path;
    this.fileSystem = fileSystem;
  }
  getStat() {
    if (!this.stat) {
      this.stat = this.fileSystem.stat(this.path);
    }
    return this.stat;
  }
  setStat(stat) {
    this.stat = Promise.resolve(stat);
  }
  getModifiedTime() {
    if (!this.modifiedTime) {
      this.modifiedTime = this.getStat()
        .then(stat => stat.mtime.getTime());
    }
    return this.modifiedTime;
  }
  setModifiedTime(modifiedTime) {
    this.modifiedTime = Promise.resolve(modifiedTime);
  }
  getIsFile() {
    if (!this.isFile) {
      this.isFile = this.getStat()
        .then(
          (stat) => stat.isFile(),
          (err) => {
            if (err.code === 'ENOENT') {
              return false;
            }
            return Promise.reject(err);
          }
        );
    }
    return this.isFile;
  }
  setIsFile(isFile) {
    this.isFile = Promise.resolve(isFile);
  }
  getIsDirectory() {
    if (!this.isDirectory) {
      this.isDirectory = this.getStat()
        .then(
          (stat) => stat.isDirectory(),
          (err) => {
            if (err.code === 'ENOENT') {
              return false;
            }
            return Promise.reject(err);
          }
        );
    }
    return this.isDirectory;
  }
  setIsDirectory(isDirectory) {
    this.isDirectory = Promise.resolve(isDirectory);
  }
  getBuffer() {
    if (!this.buffer) {
      this.buffer = this.fileSystem.readFile(this.path);
    }
    return this.buffer;
  }
  setBuffer(buffer) {
    this.buffer = Promise.resolve(buffer);
  }
  getText() {
    if (!this.text) {
      // Rather than read this file's buffer, we invoke the file system
      // directly. This does suggest that in certain edge-cases a file
      // may be read twice, but in most cases this will help to reduce
      // memory as we only store one copy of the file's contents
      this.text = this.fileSystem.readFile(this.path, 'utf8');
    }
    return this.text;
  }
  setText(text) {
    this.text = Promise.resolve(text);
  }
  getTextHash() {
    if (!this.textHash) {
      this.textHash = this.getText()
        .then(generateStringHash);
    }
    return this.textHash;
  }
  setTextHash(textHash) {
    this.textHash = Promise.resolve(textHash);
  }
  getDirectoryContents() {
    if (!this.contents) {
      this.contents = this.fileSystem.readDirectory(this.path);
    }
    return this.contents;
  }
  setDirectoryContents(contents) {
    this.contents = Promise.resolve(contents);
  }
}