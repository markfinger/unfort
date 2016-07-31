"use strict";

const path = require('path');
const fs = require('fs');
const bluebird = require('bluebird');
const chokidar = require('chokidar');
const rx = require('rxjs');
const babylon = require('babylon');
const {babylonAstDependencies} = require('../languages/babel/babylon_ast_dependencies');
const _browserResolve = require('browser-resolve');
const browserifyBuiltins = require('browserify/lib/builtins');
const {CyclicDependencyGraph} = require('../cyclic_dependency_graph');
const {FileSystemCache} = require('../file_system');
const v8Profiler = require('v8-profiler');

process.on('unhandledRejection', err => { throw err; });

const ready = new rx.Subject();

const graph = new CyclicDependencyGraph(resolve);
const fsCache = new FileSystemCache();

const fsWatcher = chokidar.watch(__dirname);

fsWatcher.on('add', (path, stat) => {
  fsCache.fileAdded.next({path, stat});
});

fsWatcher.on('ready', () => {
  ready.complete();
});

const browserResolve = bluebird.promisify(_browserResolve);

const readFile = bluebird.promisify(fs.readFile);
const stat = bluebird.promisify(fs.stat);

const realFS = {
  readText: (path) => readFile(path, 'utf8'),
  isFile: (path) => stat(path)
    .then(
      stat => stat.isFile(),
      err => {
        if (err.code === 'ENOENT') {
          return false;
        }
        return Promise.reject(err);
      }
    )
};

function resolveIdentifier(id, origin, fs) {
  const options = {
    filename: origin,
    basedir: path.dirname(origin),
    modules: browserifyBuiltins,
    readFile: (path, cb) => fs.readText(path)
      .then(
        data => cb(null, data),
        err => cb(err)
      ),
    isFile: (path, cb) => fs.isFile(path)
      .then(
        isFile => cb(null, isFile),
        err => cb(err)
      )
  };
  return browserResolve(id, options);
}

function resolve(name) {
  const trap = fsCache.createTrap();
  const pipeline = {
    fs: trap,
    // fs: fsCache,
    // fs: realFS,
    resolveIdentifier: (id, origin) => resolveIdentifier(id, origin, pipeline.fs)
  };
  return pipeline.fs.readText(name)
    .then(text => {
      const ast = babylon.parse(text, {
        sourceType: name.indexOf('node_modules') === -1 ? 'module' : 'script',
      });
      const outcome = babylonAstDependencies(ast, {text});
      const identifiers = outcome.dependencies.map(dep => dep.identifier);
      return Promise.all(
        identifiers.map(id => pipeline.resolveIdentifier(id, name))
      );
    });
}

graph.addEntryPoint(require.resolve('./src/a/a.js'));
const start = (new Date()).getTime();
v8Profiler.startProfiling('1', true);

ready.subscribe(
  null,
  null,
  () => {
    console.log('starting');
    graph.traceFromEntryPoints();
  }
);

graph.error.subscribe(obj => {
  console.error(`Error on file: ${obj.name}`);
  throw obj.error;
});

graph.complete.subscribe(output => {
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
  console.log(`${output.nodes.size} files processed`);
  console.log(`${output.pruned.size} files pruned`);
});