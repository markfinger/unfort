import {Stats} from 'fs';

export interface readFile {
  (path: string, encoding?: string): Promise<string|Buffer>;
}

export interface stat {
  (path: string): Promise<Stats>;
}

export interface fileSystemInterface {
  readFile: readFile;
  stat: stat;
}

export interface fileSystemCache {
  isFile(path: string): Promise<boolean>;
  stat(path: string): Promise<Stats>;
  readModifiedTime(path: string): Promise<number>;
  readBuffer(path: string): Promise<Buffer>;
  readText(path: string): Promise<string>;
  readTextHash(path: string): Promise<string>;
}

export interface fileSystemDependency {
  isFile: boolean;
  modifiedTime: number;
  textHash: string;
}