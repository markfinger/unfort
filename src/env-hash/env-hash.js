import path from 'path';
import fs from 'fs';
import async from 'async';
import murmur from 'imurmurhash';
import {isFunction} from 'lodash/lang';

export function join(root, file) {
  if (path.isAbsolute(file)) {
    return file;
  } else {
    return path.join(root, file);
  }
}

export function readFileData(files, cb) {
  async.map(
    files,
    (file, cb) => {
      async.parallel([
        (cb) => fs.readFile(file, 'utf8', cb),
        (cb) => fs.stat(file, cb)
      ], (err, data) => {
        if (err) {
          err.message = `File: ${file}\n\n${err.message}`;
          return cb(err);
        }

        data[1] = data[1].mtime.getTime();

        return cb(null, data);
      });
    },
    cb
  )
}

export function readDirectoryData(directories, cb) {
  async.map(
    directories,
    (directory, cb) => fs.readdir(directory, (err, dirs) => {
      if (err) {
        err.message = `Directory: ${directory}\n\n${err.message}`;
        return cb(err);
      }
      cb(null, dirs);
    }),
    (err, data) => {
      if (err) return cb(err);

      const absDirLists = data.map((dirs, i) => {
        return dirs.map(dir => path.join(directories[i], dir));
      });

      async.map(
        absDirLists,
        (dirList, cb) => {
          async.map(
            dirList,
            (dir, cb) => fs.stat(dir, (err, stat) => {
              if (err) {
                err.message = `Directory: ${dir}\n\n${err.message}`;
                return cb(err);
              }
              cb(null, [dir, stat.mtime.getTime()]);
            }),
            cb
          );
        },
        (err, data) => {
          if (err) return cb(err);
          return cb(null, data);
        }
      );
    }
  );
}

export function hashFileSystemDataLists(data) {
  if (!data.length) {
    return '';
  }

  let hash = new murmur(data[0][0]);

  data.forEach((entry, i) => {
    if (i !== 0) {
      hash.hash(entry[0]);
    }
    hash.hash(String(entry[1]));
  });

  return hash.result();
}

export function getOptions(overrides={}) {
  return {
    root: process.cwd(),
    files: ['package.json'],
    directories: ['node_modules'],
    ...overrides
  };
}

export function envHash(options, cb) {
  if (!cb && isFunction(options)) {
    cb = options;
    options = getOptions();
  } else {
    options = getOptions(options);
  }

  let {root, files, directories} = options;

  files = files.map(file => join(root, file));
  directories = directories.map(dir => join(root, dir));

  async.parallel([
    (cb) => readFileData(files, cb),
    (cb) => readDirectoryData(directories, cb)
  ], (err, data) => {
    if (err) return cb(err);

    const fileHash = hashFileSystemDataLists(data[0]);
    const dirHash = hashFileSystemDataLists(data[1]);

    cb(null, fileHash + '_' + dirHash);
  });
}