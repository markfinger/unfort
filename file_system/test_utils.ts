import {FileSystemCache} from './cache';

// Creates a prepopulated fs cache. Intended for removing file IO requirements from test suites
export function createVirtualFileSystemCache(files: any, directories?: any): FileSystemCache {
  const cache = new FileSystemCache();
  for (const path of Object.keys(files)) {
    const file = cache._createFile(path);
    file.setIsFile(true);
    file.setIsDirectory(false);
    file.setModifiedTime(-Infinity);
    file.setText(files[path]);
    file.setBuffer(new Buffer(files[path]));
  }
  if (directories) {
    for (const path of Object.keys(directories)) {
      const directory = cache._createFile(path);
      directory.setDirectoryContents(directories[path]);
      directory.setIsFile(false);
      directory.setIsDirectory(true);
    }
  }
  return cache;
}
