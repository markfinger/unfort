import path from 'path';
import fs from 'fs';
import async from 'async';
import murmur from 'imurmurhash';

export function hashNpmDependencyTree(basedir, cb) {
  const rootPackageJson = path.join(basedir, 'package.json');
  const rootNodeModules = path.join(basedir, 'node_modules');

  async.parallel([
    (cb) => fs.readFile(rootPackageJson, 'utf8', cb),
    (cb) => fs.readdir(rootNodeModules, cb)
  ], (err, data) => {
    if (err) return cb(err);

    const [packageJson, dirs] = data;
    const hash = murmur(packageJson);

    async.map(
      dirs,
      (dir, cb) => {
        const dirname = path.join(rootNodeModules, dir);
        fs.stat(dirname, cb)
      },
      (err, stats) => {
        if (err) return cb(err);

        stats.forEach((stat, i) => {
          const dir = dirs[i];
          const mtime = stat.mtime.getTime();
          hash.hash(dir + mtime);
        });

        cb(null, hash.result());
      }
    )
  });
}