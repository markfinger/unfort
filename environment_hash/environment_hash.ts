import * as path from 'path';
import {Promise} from 'bluebird';
import {zip, flatten} from 'lodash';
import {FileSystemCache} from '../file_system';
import {IncrementalStringHash} from '../common';

export interface environmentHashOptions {
  root?: string;
  files?: string[];
  directories?: string[];
}

export function environmentHash(fileSystemCache: FileSystemCache, options?: environmentHashOptions): Promise<string> {
  options = options || {};

  const root = options.root || process.cwd();
  const files = (options.files || []).map(file => ensureAbsolute(root, file));
  const directories = (options.directories || []).map(directory => ensureAbsolute(root, directory));

  return Promise.all([
    generateFilesHash(fileSystemCache, files),
    generateDirectoriesHash(fileSystemCache, directories)
  ]).then(([fileHash, directoryHash]) => {
    return fileHash + '_' + directoryHash;
  });
}


export function ensureAbsolute(root: string, file: string) {
  if (path.isAbsolute(file)) {
    return file;
  } else {
    return path.join(root, file);
  }
}

export function generateFilesHash(fileSystemCache: FileSystemCache, files: string[]): Promise<string> {
  if (!files.length) {
    return Promise.resolve('_');
  }

  const hashes = files.map((fileName) => fileSystemCache.readText(fileName));
  const modifiedTimes = files.map((fileName) => fileSystemCache.readModifiedTime(fileName));

  return Promise.all([
    Promise.all(hashes),
    Promise.all(modifiedTimes)
  ]).then(([hashData, modifiedTimeData]) => {
    return hashItems(hashData) + '_' + hashItems(modifiedTimeData);
  });
}

export function generateDirectoriesHash(fileSystemCache: FileSystemCache, directories: string[]): Promise<string> {
  if (!directories.length) {
    return Promise.resolve('_');
  }

  const allContents = directories.map(directory => {
    return fileSystemCache.readDirectoryContents(directory)
      .then(contents => contents.map((baseName) => {
        return path.join(directory, baseName);
      }));
  });

  return Promise.all(allContents)
    .then((allContents: string[][]) => {
      const allContentsHashed = allContents.map((contents): string[] => {
        const modifiedTimes = contents.map((item) => fileSystemCache.readModifiedTime(item));
        return Promise.all(modifiedTimes)
          .then((modifiedTimes) => hashItems(modifiedTimes));
      });
      return Promise.all(allContentsHashed);
    })
    .then((hashes: string[]) => hashes.join('_'));
}

export function hashItems(data: string[]): string {
  if (!data.length) {
    return '';
  }
  const hash = new IncrementalStringHash(data[0]);
  for (let i=1; i<data.length; i++) {
    hash.add(data[i]);
  }
  return hash.generateHash();
}