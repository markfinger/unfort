import fs from 'fs';
import path from 'path';
import http from 'http';
import socketIo from 'socket.io';
import async from 'async';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import * as babel from 'babel-core';
import chokidar from 'chokidar';
import murmur from 'imurmurhash';
import postcss from 'postcss';
import promisify from 'promisify-node';
import {startsWith, repeat} from 'lodash/string';
import {pull} from 'lodash/array';
import {forOwn, values} from 'lodash/object';
import {contains} from 'lodash/collection';
import {envHash} from '../env-hash';
import {
  getAggressivelyCachedResolvedDependencies, getCachedResolvedDependencies, getCachedAst,
  getCachedDependencyIdentifiers
} from '../dependencies/cached-dependencies';
import {getCachedStyleSheetImports, buildPostCssAst} from '../dependencies/css-dependencies';
import {browserResolver} from '../dependencies/browser-resolver';
import {createMockCaches, createFileCaches} from '../tests/tracer-perf';
import {
  createGraph, getNewNodesFromDiff, getPrunedNodesFromDiff, mergeDiffs
} from '../cyclic-dependency-graph';
import {createFileStore} from './store';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

sourceMapSupport.install();

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');
const entryFile = path.join(sourceRoot, 'src', 'server-test', 'entry.js');
const runtimeFile = require.resolve('../../runtime/runtime');
const hmrRuntimeFile = require.resolve('./hmr-runtime');

const graph = createGraph({
  getDependencies
});

const store = createFileStore();

const entryPoints = [
  runtimeFile,
  hmrRuntimeFile,
  entryFile
];

const tree = Object.create(null);
const files = Object.create(null);
const sockets = [];
const caches = createMockCaches();

//const watcher = chokidar.watch([], {
//  persistent: true
//});
//
//watcher.on('change', (file) => {
//  console.log(`File changed: ${file}`);
//
//  graph.pruneNode(file);
//
//  if (contains(entryPoints, file)) {
//    graph.setNodeAsEntry(file);
//  }
//  graph.traceFromNode(file);
//});

//startServer(3000);

console.log('Inspecting env...');
envHash().then(hash => {
  console.log(`Env hash: ${hash}`);

  let traceStart;
  graph.events.on('started', () => {
    traceStart = (new Date()).getTime();

    console.log(repeat('=', 80));
    process.stdout.write('Tracing: ');
  });

  graph.events.on('traced', ({node}) => {
    process.stdout.write('.');

    //if (shouldWatchFile(node)) {
    //  watcher.add(node);
    //}
  });

  graph.events.on('error', () => {
    process.stdout.write('*');
  });

  graph.events.on('completed', ({errors, diff}) => {
    process.stdout.write('\n'); // clear the progress line

    const elapsed = (new Date()).getTime() - traceStart;

    const disconnectedDiff = graph.pruneDisconnectedNodes();

    logGraphDiff(mergeDiffs(diff, disconnectedDiff), elapsed);

    if (errors.length) {
      console.error(`Errors: ${errors.length} error(s) encountered during trace...`);
      errors.forEach(({node, error}) => {
        console.error(`\nFile: ${node}\nMessage: ${error.message}\nStack: ${error.stack}\n`);
      });
    }
  });

  entryPoints.forEach(file => {
    graph.setNodeAsEntry(file);
    graph.traceFromNode(file);
  });
});

function logGraphDiff(diff, elapsed) {
  console.log(repeat('-', 80));

  const newNodes = getNewNodesFromDiff(diff);
  if (newNodes.length) {
    console.log(`Traced: ${newNodes.length} file(s)`);
  }

  const prunedNodes = getPrunedNodesFromDiff(diff);
  if (prunedNodes.length) {
    console.log(`Pruned: ${prunedNodes.length} file(s)`);
  }

  console.log(`Tracing completed in ${elapsed}ms`);

  console.log(repeat('=', 80));
}

//function onFileChange(file) {
//  transformedFiles[file] = undefined;
//  files[file] = undefined;
//
//  traceFile(file, tree, caches, (err) => {
//    if (err) throw err;
//
//    console.log(`traced ${file}`);
//    sockets.forEach(socket => {
//      socket.emit('hmr', {file, url: file.split(sourceRoot)[1]});
//    });
//  });
//}

//function startServer(port) {
//  const app = express();
//  const server = http.createServer(app);
//  const io = socketIo(server);
//
//  io.on('connection', (socket) => {
//    console.log('hmr connection opened');
//
//    socket.on('disconnect', () => {
//      console.log('hmr connection closed');
//
//      pull(sockets, socket);
//    });
//
//    sockets.push(socket);
//  });
//
//  app.get('/', (req, res) => {
//
//    function getUrl(file) {
//      if (!fileRefs[file]) {
//        fileRefs[file] = file.split(sourceRoot)[1];
//      }
//      return fileRefs[file];
//    }
//
//    function generateScriptElement(file) {
//      return `<script src="${getUrl(file)}"></script>`;
//    }
//
//    function generateLinkElement(file) {
//      return `<link rel="stylesheet" href="${getUrl(file)}">`;
//    }
//
//    const runtimeScript = generateScriptElement(runtimeFile);
//
//    const styles = Object.keys(tree)
//      .filter(file => path.parse(file).ext === '.css')
//      .map(generateLinkElement)
//      .join('\n');
//
//    const scripts = Object.keys(tree)
//      .filter(file => file !== runtimeFile)
//      .filter(file => path.parse(file).ext !== '.css')
//      .map(generateScriptElement)
//      .join('\n');
//
//    res.end(`
//      <html>
//      <head>
//        ${styles}
//      </head>
//      <body>
//        ${runtimeScript}
//        ${scripts}
//        <script>
//          __modules.executeModule(${JSON.stringify(hmrRuntimeFile)});
//          __modules.executeModule(${JSON.stringify(entryFile)});
//        </script>
//      </body>
//      </html>
//    `);
//  });
//
//  app.get('/*', (req, res) => {
//    const file = req.path;
//
//    if (!file) {
//      return res.status(404).send('Not found');
//    }
//
//    const abs = path.join(sourceRoot, file);
//
//    if (!tree[abs]) {
//      return res.status(404).send('Not found');
//    }
//
//    if (files[abs]) {
//      return res.end(files[abs]);
//    }
//
//    if (transformedFiles[abs]) {
//      if (!files[abs]) {
//        files[abs] = wrapCommonJSModule({file: abs, dependencies: tree[abs], code: transformedFiles[abs]});
//      }
//
//      res.end(files[abs]);
//    } else {
//      fs.readFile(abs, 'utf8', (err, text) => {
//        if (err) return res.status(500).send(`File: ${abs}\n\n${err.stack}`);
//
//        const pathObj = path.parse(file);
//
//        if (abs === runtimeFile || pathObj.ext === '.css') {
//          files[abs] = text;
//        } else {
//          files[abs] = wrapCommonJSModule({file: abs, dependencies: tree[abs], code: text});
//        }
//
//        res.end(files[abs]);
//      });
//    }
//  });
//
//  server.listen(port, '0.0.0.0', () => {
//    console.log(`Server: http://127.0.0.1:${port}`);
//  });
//}

function wrapCommonJSModule({code, file, dependencies}) {
  const moduleData = {
    name: file,
    dependencies: dependencies,
    version: murmur(code).result()
  };

  return `__modules.addModule(${JSON.stringify(moduleData)}, function(module, exports, require, process, global) {

${code}

});`;
}

function getDependencies(file) {
  return stat(file).then(stat => {
    const key = file + stat.mtime.getTime();

    function getFile() {
      return readFile(file, 'utf8');
    }

    function getJsAst() {
      if (startsWith(file, rootNodeModules) || file === runtimeFile) {
        return getCachedAst({cache: caches.ast, key, getFile});
      }

      return new Promise((res, rej) => {
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
            if (err) return rej(err);
            res(transformed.ast);
          }
        )
      });
    }

    function getCssAst() {
      return getFile()
        .then(text => buildPostCssAst({name: file, text}));
    }

    function getDependencyIdentifiers() {
      const pathObj = path.parse(file);

      return Promise.resolve()
        .then(() => {
          if (pathObj.ext === '.css') {
            return getCachedStyleSheetImports({
              cache: caches.dependencyIdentifiers,
              key,
              getAst: getCssAst
            });
          }

          return getCachedDependencyIdentifiers({
            cache: caches.dependencyIdentifiers,
            key,
            getAst: getJsAst
          });
        })
        .then(identifiers => identifiers.map(identifier => identifier.source));
    }

    function resolveIdentifier(identifier) {
      return browserResolver(identifier, path.dirname(file));
    }

    return Promise.resolve()
      .then(() => {
        // If the file is within the root node_modules, we can aggressively
        // cache its resolved dependencies
        if (startsWith(file, rootNodeModules)) {
          return getAggressivelyCachedResolvedDependencies({
            cache: caches.resolvedDependencies,
            key,
            getDependencyIdentifiers,
            resolveIdentifier
          });
        } else {
          return getCachedResolvedDependencies({
            cache: caches.resolvedDependencies,
            key,
            getDependencyIdentifiers,
            resolveIdentifier
          });
        }
      })
      .then(resolved => values(resolved));
  });
}

function shouldWatchFile(file) {
  return !startsWith(rootNodeModules, file);
}