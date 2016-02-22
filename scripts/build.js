#!/usr/bin/env node

const child_process = require('child_process');
const path = require('path');

const argv = require('yargs')
    .alias('o', 'once').default('once', false)
    .argv;

const PROJECT_ROOT = path.dirname(__dirname);

console.log(`Building project from ${PROJECT_ROOT}`);

const SOURCE_DIRS = [
  [path.join(PROJECT_ROOT, 'src'), path.join(PROJECT_ROOT, 'lib')]
];

// Remove the previously built versions
console.log('\nRemoving directories...');
SOURCE_DIRS
  .map(dirs => dirs[1])
  .forEach(function(outputDir) {
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

const once = argv.once;

if (once) {
  console.log('\nRebuilding directories...');
} else {
  console.log('\nRebuilding and watching directories...');
}

SOURCE_DIRS.forEach(dirs => {
  const sourceDir = dirs[0];
  const outputDir = dirs[1];

  const params = [
    sourceDir, '--out-dir', outputDir, '--source-maps', 'inline', '--copy-files'
  ];

  if (!once) {
    params.push('--watch');
  }

  const babel = child_process.spawn(
    path.join(PROJECT_ROOT, 'node_modules', '.bin', 'babel'),
    params
  );

  babel.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  babel.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
});