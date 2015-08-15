#!/usr/bin/env node

import child_process from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(path.join(__dirname, '..', '..'));

console.log(`Building project from ${PROJECT_ROOT}`);

const SOURCE_DIRS = {
  [path.join(PROJECT_ROOT, 'src')]: path.join(PROJECT_ROOT, 'lib')
};

// Remove the previously built versions
console.log('\nRemoving directories...');
Object.values(SOURCE_DIRS).forEach(function(outputDir) {
  console.log(`Removing ${outputDir}`);
  const rm = child_process.spawnSync('rm', ['-rf', outputDir]);

  const stderr = rm.stderr.toString();
  if (stderr) {
    throw new Error(stderr);
  }

  const stdout = rm.stdout.toString();
  if (stdout) {
    console.log(stdout);
  }
});

// Rebuild from the source files
console.log('\nRebuilding and watching directories...');
Object.keys(SOURCE_DIRS).forEach(sourceDir => {
  const outputDir = SOURCE_DIRS[sourceDir];

  const babel = child_process.spawn(
    path.join(PROJECT_ROOT, 'node_modules', '.bin', 'babel'),
    [sourceDir, '--out-dir', outputDir, '--source-maps', '--watch']
  );

  babel.stderr.on('data', function(data) {
    process.stderr.write(data);
  });

  babel.stdout.on('data', function(data) {
    process.stdout.write(data);
  });
});