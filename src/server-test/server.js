import fs from 'fs';
import path from 'path';
import http from 'http';
import socketIo from 'socket.io';
import async from 'async';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import * as babel from 'babel-core';
import chokidar from 'chokidar';
import {startsWith} from 'lodash/string';
import {forOwn} from 'lodash/object';
import {hashNpmDependencyTree} from '../hash-npm-dependency-tree';
import {
  getAggressivelyCachedResolvedDependencies, getCachedResolvedDependencies, getCachedAst,
  getCachedDependencyIdentifiers
} from '../dependencies/cached_dependencies';
import {browserResolver} from '../dependencies/browser_resolver';
import {createMockCaches, createFileCaches} from '../tests/tracer_perf';
import * as graph from '../directed-dependency-graph';

sourceMapSupport.install();

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');
const entryFile = path.join(sourceRoot, 'src', 'server-test', 'entry.js');
const runtimeFile = require.resolve('./runtime');
const hmrRuntimeFile = require.resolve('./hmr_runtime');

const tree = Object.create(null);
const files = Object.create(null);
const transformedFiles = Object.create(null);
const nodes = Object.create(null);
const sockets = [];

const caches = createMockCaches();

const watcher = chokidar.watch([], {
  persistent: true
});

watcher.on('change', (file) => {
  console.log(`File changed: ${file}`);
  onFileChange(file);
});

const start = (new Date()).getTime();

function onFileChange(file) {
  transformedFiles[file] = undefined;
  files[file] = undefined;

  traceFile(file, tree, caches, (err) => {
    if (err) throw err;

    console.log(`traced ${file}`);
    sockets.forEach(socket => {
      socket.emit('hmr', {file, url: file.split(sourceRoot)[1]});
    })
  });
}

function startWatcher() {
  const files = Object.keys(tree).filter(file => {
    return (
      tree[file] && !startsWith(file, rootNodeModules)
    );
  });
  watcher.add(files);
  console.log('Watching', files);
}

function clusterPackages(cb) {
  const files = Object.keys(tree);
  const relFiles = files.filter(file => !startsWith(file, rootNodeModules));
  const packageFiles = files.filter(file => startsWith(file, rootNodeModules));

  const clustered = Object.create(null);
  packageFiles.forEach(file => {
    const relative = file.split(rootNodeModules)[1];
    const parts = relative.split(path.sep);
    const dir = parts[1];

    if (!clustered[dir]) {
      clustered[dir] = [];
    }
    clustered[dir].push(file);
  });

  forOwn(clustered, (files, name) => {
    console.log(name, clustered[name].length);
  });

  cb(null);
}

function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server);

  io.on('connection', (socket) => {
    sockets.push(socket);

    console.log('a user connected');

    socket.on('disconnect', () => {
      if (sockets.indexOf(socket)) {
        sockets.splice(sockets.indexOf(socket), 1);
      }

      console.log('user disconnected');
    });
  });

  app.get('/', (req, res) => {
    function generateScriptElement(file) {
      const relPath = file.split(sourceRoot)[1];
      return `<script src="${relPath}"></script>`;
    }

    const runtimeScript = generateScriptElement(runtimeFile);
    const scripts = Object.keys(tree)
      .filter(file => file !== runtimeFile)
      .map(generateScriptElement)
      .join('\n');

    res.end(`
      <html>
      <body>
        ${runtimeScript}
        ${scripts}
        <script>
          __modules.executeModule(${JSON.stringify(hmrRuntimeFile)});
          __modules.executeModule(${JSON.stringify(entryFile)});
        </script>
      </body>
      </html>
    `);
  });

  app.get('/*', (req, res) => {
    const file = req.path;

    if (!file) {
      return res.status(404).send('Not found');
    }

    const abs = path.join(sourceRoot, file);

    if (!tree[abs]) {
      return res.status(404).send('Not found');
    }

    if (files[abs]) {
      return res.end(files[abs]);
    }

    if (transformedFiles[abs]) {
      if (!files[abs]) {
        files[abs] = wrapCommonJSModule({file: abs, dependencies: tree[abs], code: transformedFiles[abs]});
      }

      res.end(files[abs]);
    } else {
      fs.readFile(abs, 'utf8', (err, text) => {
        if (err) return res.status(500).send(`File: ${abs}\n\n${err.stack}`);

        if (abs === runtimeFile) {
          files[abs] = text;
        } else {
          files[abs] = wrapCommonJSModule({file: abs, dependencies: tree[abs], code: text});
        }

        res.end(files[abs]);
      });
    }
  });

  server.listen(3000, '0.0.0.0', () => {
    console.log('listening at http://127.0.0.1:3000');
  });
}

function wrapCommonJSModule({code, file, dependencies}) {
  return `__modules.addModule(${JSON.stringify(file)}, ${JSON.stringify(dependencies)}, function(module, exports, require, process, global){

${code}

});`;
}

function traceFile(file, tree, caches, cb) {
  process.stdout.write('.'); // progress

  tree[file] = [];

  function onTraceComplete(err) {
    if (err) {
      err.message = `Error in file: ${file}\n\n${err.message}`;
      return cb(err);
    }
    cb(null);
  }

  fs.stat(file, (err, stat) => {
    if (err) return cb(err);

    const key = file + stat.mtime.getTime();

    function getFile(cb) {
      fs.readFile(file, 'utf8', cb);
    }

    function getAst(cb) {
      if (startsWith(file, rootNodeModules) || file === runtimeFile) {
        return getCachedAst({cache: caches.ast, key, getFile}, cb);
      }

      babel.transformFile(
        file,
        {
          plugins: [
            ['react-transform', {
              transforms: [{
                transform: 'react-transform-hmr',
                imports: ['react'],
                locals: ['module']
              }]
            }]
          ]
        },
        (err, transformed) => {
          if (err) return cb(err);

          transformedFiles[file] = transformed.code;

          cb(null, transformed.ast);
        }
      );
    }

    function getDependencyIdentifiers(cb) {
      getCachedDependencyIdentifiers(
        {cache: caches.dependencyIdentifiers, key, getAst},
        cb
      )
    }

    function resolveIdentifier(identifier, cb) {
      browserResolver(identifier, path.dirname(file), cb);
    }

    // If the file is within the root node_modules, we can aggressively
    // cache its resolved dependencies
    if (startsWith(file, rootNodeModules)) {
      getAggressivelyCachedResolvedDependencies(
        {cache: caches.resolvedDependencies, key, getDependencyIdentifiers, resolveIdentifier},
        onDependenciesResolved
      );
    } else {
      getCachedResolvedDependencies(
        {cache: caches.resolvedDependencies, key, getDependencyIdentifiers, resolveIdentifier},
        onDependenciesResolved
      );
    }

    function onDependenciesResolved(err, resolved) {
      if (err) return onTraceComplete(err);

      tree[file] = resolved;

      const untracedFiles = resolved
        .filter(dep => !tree[dep[1]])
        .map(dep => dep[1]);

      if (!untracedFiles.length) {
        return onTraceComplete(null);
      }

      untracedFiles.forEach(file => {
        tree[file] = {};
      });

      async.map(
        untracedFiles,
        (file, cb) => traceFile(file, tree, caches, cb),
        onTraceComplete
      );
    }
  });
}

function updateNodesFromFileTree(fileTree) {
  forOwn(fileTree, (deps, file) => {
    if (deps) { // Handle files removed from the tree
      if (!nodes[file]) {
        graph.addNode(nodes, file);
      }
      deps.forEach(([id, depFile]) => {
        if (!nodes[depFile]) {
          graph.addNode(nodes, depFile);
        }
        graph.addEdge(nodes, file, depFile);
      });
    }
  });
}

hashNpmDependencyTree(process.cwd(), (err, hash) => {
  if (err) throw err;

  async.parallel([
    (cb) => traceFile(runtimeFile, tree, caches, cb),
    (cb) => traceFile(hmrRuntimeFile, tree, caches, cb),
    (cb) => traceFile(entryFile, tree, caches, cb)
  ], (err) => {
    process.stdout.write('\n'); // clear the progress line

    if (err) throw err;
    const end = (new Date()).getTime() - start;
    console.log(`traced ${Object.keys(tree).length} records in ${end}ms`);

    updateNodesFromFileTree(tree);

    startWatcher();

    clusterPackages((err) => {
      if (err) throw err;

      startServer();
    });
  });
});