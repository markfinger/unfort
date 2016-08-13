import {Promise} from 'bluebird';
import * as fs from 'fs';

// We used hand-rolled promise versions of the fs methods as they
// are much, much faster than bluebird's `promisify` function

export function readFile(path, encoding) {
  return new Promise((res, rej) => {
    fs.readFile(path, encoding, (err, data) => {
      if (err) return rej(err);
      res(data);
    });
  });
}

export function stat(path) {
  return new Promise((res, rej) => {
    fs.stat(path, (err, data) => {
      if (err) return rej(err);
      res(data);
    });
  });
}