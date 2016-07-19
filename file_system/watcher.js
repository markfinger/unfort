"use strict";

class FileWatcher {
  constructor() {

  }
}

module.exports = {
  FileWatcher
};

/*

Two watchers

1) watches files
2) watches for structural changes in node_modules such that a failed build should be restarted

Eg: a FileTreeWatcher and DirectoryWatcher

FileTreeWatcher:
  - detect readFile + isFile signals
  - start watching the directory containing the file
  - walk up the dir tree and watch every new directory until the root is hit
  - accept `shouldWatchFile(path) { return BlueBird.resolve(true | false); }`
  - accept `shouldWatchDirectory(path) { return BlueBird.resolve(true | false); }`
  - when a file is encountered, signal the fs cache that it exists
  - when a directory is encountered, signal the fs cache that it exists
  - when a file is read, stat it and push it to the fs cache (how? maybe a signal with payload)
  - when a directory is read, stat it and push it to the fs cache (how? maybe a signal with payload)

DirectoryWatcher
  - accept `directory: '/path/to/dir'`
  - accept `debounce: 100`
  - accept `onChange({added: [], removed: []}) { }`
 */
