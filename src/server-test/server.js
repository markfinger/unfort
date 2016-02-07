import fs from 'fs';
import path from 'path';
import http from 'http';
import socketIo from 'socket.io';
import async from 'async';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import * as babel from 'babel-core';
import * as babylon from 'babylon';
import babelCodeFrame from 'babel-code-frame';
import babelGenerator from 'babel-generator';
import chokidar from 'chokidar';
import murmur from 'imurmurhash';
import postcss from 'postcss';
import promisify from 'promisify-node';
import chalk from 'chalk';
import {startsWith, repeat} from 'lodash/string';
import {pull, flatten} from 'lodash/array';
import {forOwn, values} from 'lodash/object';
import {isUndefined, isObject, isNumber} from 'lodash/lang';
import {includes} from 'lodash/collection';
import envHash from '../env-hash';
import babylonAstDependencies from '../babylon-ast-dependencies';
import postcssAstDependencies from '../postcss-ast-dependencies';
import {
  getAggressivelyCachedResolvedDependencies, getCachedResolvedDependencies, getCachedAst,
  getCachedDependencyIdentifiers
} from '../dependencies/cached-dependencies';
import {getCachedStyleSheetImports, buildPostCssAst} from '../dependencies/css-dependencies';
import {nodeCoreLibs} from '../dependencies/node-core-libs';
import browserResolve from 'browser-resolve';
import {createFileCache} from '../kv-cache';
import {
  createGraph, getNewNodesFromDiff, getPrunedNodesFromDiff, mergeDiffs
} from '../cyclic-dependency-graph';
import createRecordStore from '../record-store';

sourceMapSupport.install();

process.on('unhandledRejection', err => {
  throw err;
});

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const resolve = promisify(browserResolve);

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');
const entryFile = path.join(sourceRoot, 'src', 'server-test', 'entry.js');
const runtimeFile = require.resolve('../../runtime/runtime');
const hmrRuntimeFile = require.resolve('./hmr-runtime');

let analyzedDependenciesCache;
let resolvedDependenciesCache;

const records = createRecordStore({
  readText(ref) {
    return readFile(ref.name, 'utf8');
  },
  stat(ref) {
    return stat(ref.name);
  },
  mtime(ref, store) {
    return store.stat(ref).then(stat => {
      return stat.mtime.getTime()
    })
  },
  cacheKey(ref, store) {
    return Promise.all([
      ref.name,
      store.readText(ref),
      store.mtime(ref)
    ])
  },
  postcssAst(ref, store) {
    return store.readText(ref).then(text => {
      return postcss.parse(text, {from: ref.name})
    });
  },
  babelTransformOptions(ref) {
    return {
      filename: ref.name,
      sourceRoot,
      sourceType: 'module',
      babelrc: false,
      plugins: [
        'transform-react-jsx',
        'check-es2015-constants',
        'transform-es2015-modules-commonjs'
      ]
    };
  },
  babelTransform(ref, store) {
    return Promise.all([
      store.readText(ref),
      store.babelTransformOptions(ref)
    ]).then(([text, options]) => {
      return babel.transform(text, options)
    });
  },
  babelAst(ref, store) {
    return store.babelTransform(ref).then(file => file.ast);
  },
  babylonAst(ref, store) {
    return store.readText(ref).then(text => {
      return babylon.parse(text, {
        sourceType: 'script'
      });
    });
  },
  ast(ref, store) {
    const ext = path.extname(ref.name);

    if (ext === '.css') {
      return store.postcssAst(ref);
    }

    if (ext === '.js') {
      if (startsWith(ref.name, rootNodeModules)) {
        return store.babylonAst(ref);
      }
      return store.babelAst(ref);
    }

    throw new Error(`Unknown extension "${ext}", cannot parse "${ref.name}"`);
  },
  analyzeDependencies(ref, store) {
    const ext = path.extname(ref.name);

    if (ext === '.css') {
      return store.ast(ref).then(ast => postcssAstDependencies(ast));
    }

    if (ext === '.js') {
      return store.ast(ref).then(ast => babylonAstDependencies(ast));
    }

    return [];
  },
  cachedAnalyzedDependencies(ref, store) {
    return getCachedData(
      analyzedDependenciesCache,
      store.cacheKey(ref),
      () => store.analyzeDependencies(ref)
    );
  },
  dependencyIdentifiers(ref, store) {
    return store.analyzeDependencies(ref)
      .then(ids => ids.map(id => id.source));
  },
  packageDependencyIdentifiers(ref, store) {
    return store.dependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)));
  },
  resolveOptions(ref) {
    return {
      basedir: path.dirname(ref.name),
      extensions: ['.js', '.json'],
      modules: nodeCoreLibs
    }
  },
  resolvePathDependencies(ref, store) {
    return store.dependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] === '.' || path.isAbsolute(id)))
      .then(ids => store.resolveOptions(ref)
        .then(options => {
          return Promise.all(
            ids.map(id => resolve(id, options))
          )
        })
      );
  },
  resolvePackageDependencies(ref, store) {
    return store.packageDependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)))
      .then(ids => store.resolveOptions(ref)
        .then(options => {
          return Promise.all(
            ids.map(id => resolve(id, options))
          )
        })
      );
  },
  resolvedDependencies(ref, store) {
    const cache = resolvedDependenciesCache;
    const key = store.cacheKey(ref);

    // Aggressively cache node module paths
    if (startsWith(ref.name, rootNodeModules)) {
      return getCachedData(cache, key, () => {
        return Promise.all([
          store.resolvePathDependencies(ref),
          store.resolvePackageDependencies(ref)
        ]).then(flatten)
      });
    }

    return Promise.all([
      store.resolvePathDependencies(ref),
      getCachedData(cache, key, () => store.resolvePackageDependencies(ref))
    ]).then(flatten)
  },
  transformAst(ref, store) {
    const ext = path.extname(ref.name);

    if (ext === '.css') {
      return store.ast(ref).then(ast => {
        // Remove import rules
        ast.walkAtRules('import', decl => decl.remove());

        return ast.toResult({
          // Generate a source map, but keep it separate from the code
          map: {
            inline: false,
            annotation: false
          }
        });
      });
    }

    if (ext === '.js') {
      return Promise.all([
        store.readText(ref),
        store.ast(ref)
      ]).then(([text, ast]) => {
        return babelGenerator(ast, null, text);
      });
    }
  },
  code(ref, store) {
    const ext = path.extname(ref.name);

    if (ext === '.css') {
      return store.transformAst(ref).then(ast => {
        return ast.css;
      });
    }

    if (ext === '.js') {
      return store.transformAst(ref).then(ast => {
        return ast.code;
      });
    }

    return store.readText(ref);
  },
  sourceMap(ref, store) {
    const ext = path.extname(ref.name);

    if (ext === '.css') {
      return store.transformAst(ref).then(ast => {
        if (ast.map) {
          return ast.map.toString();
        }
        return null;
      });
    }

    if (ext === '.js') {
      return store.transformAst(ref).then(ast => {
        if (ast.map) {
          return ast.map.toString();
        }
        return null;
      });
    }

    return null;
  }
});

function getCachedData(cache, key, compute) {
  return key.then(key => getCachedDataOrCompute(cache, key, compute))
}

function getCachedDataOrCompute(cache, key, compute) {
  return cache.get(key).then(data => {
    if (data) {
      return data;
    }

    return compute().then(computed => {
      cache.set(key, computed);
      return computed;
    });
  })
}

const entryPoints = [
  runtimeFile,
  hmrRuntimeFile,
  entryFile
];

//const sockets = [];

envHash({
  files: [__filename, 'package.json']
})
  .then(hash => {
    console.log(chalk.bold('EnvHash: ') + hash + '\n');

    const cacheRoot = path.join(__dirname, hash);
    analyzedDependenciesCache = createFileCache(path.join(cacheRoot, 'dependency_identifiers'));
    resolvedDependenciesCache = createFileCache(path.join(cacheRoot, 'resolved_dependencies'));

    analyzedDependenciesCache.events.on('error', err => { throw err });
    resolvedDependenciesCache.events.on('error', err => { throw err });

    const graph = createGraph({
      getDependencies: (file) => {
        if (!records.has(file)) {
          records.create(file);
        }
        return records.resolvedDependencies(file)
          .then(resolved => values(resolved));
      }
    });

    let traceStart;
    graph.events.on('started', () => {
      traceStart = (new Date()).getTime();
    });

    graph.events.on('error', ({node, error}) => {
      const lines = [
        chalk.red(node),
        '',
        error.message
      ];

      if (error.loc && !error.codeFrame) {
        let text;
        try {
          text = fs.readFileSync(node, 'utf8');
        } catch (err) {}
        if (text) {
          error.codeFrame = babelCodeFrame(text, error.loc.line, error.loc.column);
        }
      }

      if (error.codeFrame && !includes(error.stack, error.codeFrame)) {
        lines.push(error.codeFrame);
      }

      lines.push(error.stack);

      console.error(lines.join('\n'));
    });

    graph.events.on('traced', () => {
      const known = graph.getState().size;
      const done = known - graph.pendingJobs.length;
      process.stdout.write(`\r${chalk.bold('Trace:')} ${done} / ${known}`);
    });

    graph.events.on('completed', ({errors}) => {
      process.stdout.write('\n'); // clear the progress indicator

      graph.pruneDisconnectedNodes();

      const elapsed = (new Date()).getTime() - traceStart;

      if (errors.length) {
        console.log(`${chalk.bold('Errors:')} ${errors.length}`);
      }

      console.log(`${chalk.bold('Elapsed:')} ${elapsed}ms`);

      const nodes = graph.getState().keySeq().toArray();

      console.log(chalk.bold(`\nCode generation`));

      const buildStart = (new Date()).getTime();
      Promise.all(
        nodes.map(node => Promise.all([
          node,
          records.code(node),
          records.sourceMap(node)
        ]))
      ).then(list => {
        const buildElapsed = (new Date()).getTime() - buildStart;
        console.log(`${chalk.bold('Elapsed:')} ${buildElapsed}ms`);
      });
    });

    entryPoints.forEach(file => {
      graph.setNodeAsEntry(file);
      graph.traceFromNode(file);
    });
  });

//function getDependencies(file) {
//  return stat(file).then(stat => {
//    const key = file + stat.mtime.getTime();
//
//    function getFile() {
//      return readFile(file, 'utf8');
//    }
//
//    function getJsAst() {
//      if (startsWith(file, rootNodeModules) || file === runtimeFile) {
//        return getCachedAst({cache: caches.ast, key, getFile});
//      }
//
//      return new Promise((res, rej) => {
//        babel.transformFile(
//          file,
//          {
//            plugins: [
//              ['react-transform', {
//                transforms: [{
//                  transform: 'react-transform-hmr',
//                  imports: ['react'],
//                  locals: ['module']
//                }]
//              }]
//            ]
//          },
//          (err, transformed) => {
//            if (err) return rej(err);
//            res(transformed.ast);
//          }
//        )
//      });
//    }
//
//    function getCssAst() {
//      return getFile()
//        .then(text => buildPostCssAst({name: file, text}));
//    }
//
//    function getDependencyIdentifiers() {
//      const pathObj = path.parse(file);
//
//      return Promise.resolve()
//        .then(() => {
//          if (pathObj.ext === '.css') {
//            return getCachedStyleSheetImports({
//              cache: caches.dependencyIdentifiers,
//              key,
//              getAst: getCssAst
//            });
//          }
//
//          return getCachedDependencyIdentifiers({
//            cache: caches.dependencyIdentifiers,
//            key,
//            getAst: getJsAst
//          });
//        })
//        .then(identifiers => identifiers.map(identifier => identifier.source));
//    }
//
//    function resolveIdentifier(identifier) {
//      return browserResolver(identifier, path.dirname(file));
//    }
//
//    return Promise.resolve()
//      .then(() => {
//        // If the file is within the root node_modules, we can aggressively
//        // cache its resolved dependencies
//        if (startsWith(file, rootNodeModules)) {
//          return getAggressivelyCachedResolvedDependencies({
//            cache: caches.resolvedDependencies,
//            key,
//            getDependencyIdentifiers,
//            resolveIdentifier
//          });
//        } else {
//          return getCachedResolvedDependencies({
//            cache: caches.resolvedDependencies,
//            key,
//            getDependencyIdentifiers,
//            resolveIdentifier
//          });
//        }
//      })
//      .then(resolved => values(resolved));
//  });
//}

//function wrapCommonJSModule({code, file, dependencies}) {
//  const moduleData = {
//    name: file,
//    dependencies: dependencies,
//    version: murmur(code).result()
//  };
//
//  return `__modules.addModule(${JSON.stringify(moduleData)}, function(module, exports, require, process, global) {
//
//${code}
//
//});`;
//}

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