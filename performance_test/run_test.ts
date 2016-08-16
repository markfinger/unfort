import * as fs from 'fs';
import {Subject} from 'rxjs';
import {FSWatcher} from 'chokidar';
import {Compiler} from '../compiler';

const v8Profiler = require('v8-profiler');

const ENTRY_POINTS = [
  require.resolve('./src/a/a.js')
];

process.on('unhandledRejection', err => {
  throw err;
});

const ready = new Subject();

const compiler = new Compiler();

ENTRY_POINTS.forEach((fileName) => {
  compiler.addEntryPoint(fileName);
});

const fsWatcher = new FSWatcher().add(__dirname);

fsWatcher.on('add', (path, stat) => {
  compiler.fileSystemCache.fileAdded.next({path, stat});
});

fsWatcher.on('ready', () => {
  ready.complete();
});

const start = (new Date()).getTime();
v8Profiler.startProfiling('1', true);

ready.subscribe(
  null,
  null,
  () => {
    console.log('starting');
    compiler.startCompilation();
  }
);

compiler.error.subscribe(obj => {
  console.error(obj.description);
  throw obj.error;
});

compiler.complete.subscribe(output => {
  const end = (new Date()).getTime();
  const profile = v8Profiler.stopProfiling();
  // Export the profiler's data as JSON
  profile.export(function(err, result) {
    if (err) throw err;

    // Dump the data to a timestamped file in the current working directory
    fs.writeFileSync((new Date()).getTime() + '.cpuprofile', result);

    // Cleanup
    profile.delete();
  });
  console.log(`Completed build in ${end - start}ms`);
  console.log(`${output.files.size} files processed`);
  console.log(`${output.built.size} files built`);
});