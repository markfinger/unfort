import path from 'path';
import fs from 'fs';
import murmur from 'imurmurhash';
import {zip, flatten} from 'lodash/array';
import {assign} from 'lodash/object';

export function join(root, file) {
  if (path.isAbsolute(file)) {
    return file;
  } else {
    return path.join(root, file);
  }
}

export function getContent(file) {
  return new Promise((res, rej) => {
    fs.readFile(file, 'utf8', (err, content) => {
      if (err) {
        err.message = `${file} - ${err.message}`;
        return rej(err);
      }
      res(content);
    });
  });
}

export function getModifiedTime(file) {
  return new Promise((res, rej) => {
    fs.stat(file, (err, stat) => {
      if (err) {
        err.message = `${file} - ${err.message}`;
        return rej(err);
      }
      res(stat.mtime.getTime());
    });
  });
}

export function getDirectoryContents(directory) {
  return new Promise((res, rej) => {
    fs.readdir(directory, (err, dirs) => {
      if (err) {
        err.message = `${directory} - ${err.message}`;
        return rej(err);
      }
      res(dirs);
    });
  });
}

export function readFileData(files) {
  return Promise.all([
    Promise.all(files.map(getContent)),
    Promise.all(files.map(getModifiedTime))
  ]).then(data => zip(...data));
}

export function readDirectoryData(directories) {
  return Promise
    .all(directories.map(getDirectoryContents))
    .then(lists => Promise.all(
      lists.map((contents, i) => {
        const root = directories[i];
        return Promise.all(
          contents.map(item => {
            const absPath = path.join(root, item);
            return getModifiedTime(absPath).then(mtime => [absPath, mtime]);
          })
        );
      })
    ))
    .then(lists => flatten(lists));
}

export function hashFileSystemDataLists(data) {
  if (!data.length) {
    return '';
  }

  let hash = new murmur(data[0][0]);

  data.forEach((entry, i) => {
    // On the first iteration, skip the first cell as we applied it above
    if (i !== 0) {
      hash.hash(entry[0]);
    }
    hash.hash(String(entry[1]));
  });

  return hash.result();
}

export function getOptions(overrides={}) {
  return assign({
    root: process.cwd(),
    files: ['package.json'],
    directories: ['node_modules']
  }, overrides);
}

export function envHash(options) {
  options = getOptions(options);

  let {root, files, directories} = options;

  files = files.map(file => join(root, file));
  directories = directories.map(dir => join(root, dir));

  return Promise.all([
    readFileData(files),
    readDirectoryData(directories)
  ]).then(
    data => data.map(hashFileSystemDataLists).join('_')
  );
}