import fs from 'fs';
import {isFile} from './utils';

export function createNodeFS() {
  return {
    isFile: isFile,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    stat: fs.stat
  }
}