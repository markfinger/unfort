import fs from 'fs';

// Original source: https://github.com/substack/node-resolve/commit/e83630d9769342a771903b60322c2c0de6325a92
export function isFile(filename, cb) {
  fs.stat(filename, (err, stat) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return cb(null, false);
      }
      return cb(err);
    }

    cb(null, stat.isFile() || stat.isFIFO());
  });
}