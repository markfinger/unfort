import fs from 'fs';
import path from 'path';
import http from 'http';
import socketIo from 'socket.io';
import async from 'async';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import * as mimeTypes from 'mime-types';
import * as babel from 'babel-core';
import * as babylon from 'babylon';
import imm from 'immutable'
import stripAnsi from 'strip-ansi';
import babelCodeFrame from 'babel-code-frame';
import babelGenerator from 'babel-generator';
import chokidar from 'chokidar';
import murmur from 'imurmurhash';
import postcss from 'postcss';
import promisify from 'promisify-node';
import chalk from 'chalk';
import {startsWith, repeat} from 'lodash/string';
import {pull, flatten, zipObject} from 'lodash/array';
import {forOwn, values, assign} from 'lodash/object';
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
  createGraph, getNewNodesFromDiff, getPrunedNodesFromDiff, mergeDiffs, resolveExecutionOrder
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

const runtimeFile = require.resolve('../../runtime/runtime');
const entryPoints = [
  require.resolve('../../runtime/hot-runtime'),
  require.resolve('../../test-src/entry')
];

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const sockets = [];

const fileEndpoint = '/file/';

function createRelativeUrl(absPath) {
  const relPath = path.relative(sourceRoot, absPath);
  return fileEndpoint + relPath;
}

function createRecordUrl(record) {
  const filename = record.data.get('filename');
  const dirname = path.dirname(record.name);
  return createRelativeUrl(path.join(dirname, filename));
}

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
  hash(ref, store) {
    // TODO handle binary files - prob just mtime
    return store.readText(ref).then(text => {
      return new murmur(text).result();
    });
  },
  cacheKey(ref, store) {
    return Promise.all([
      ref.name,
      store.readText(ref),
      store.mtime(ref)
    ])
  },
  filename(ref, store) {
    return store.hash(ref).then(hash => {
      const basename = path.basename(ref.name, ref.ext);
      return `${basename}-${hash}${ref.ext}`;
    });
  },
  url(ref, store) {
    return store.filename(ref).then(filename => {
      const dirname = path.dirname(ref.name);
      return createRelativeUrl(path.join(dirname, filename));
    });
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
        ['react-transform', {
          transforms: [
            //{
            //transform: 'react-transform-hmr',
            //imports: ['react'],
            //locals: ['module']
            //},
            {
            transform: 'react-transform-catch-errors',
            imports: ['react', 'redbox-react']
          }]
        }]
      ],
      presets: [
        'es2015',
        'react'
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
    if (ref.ext === '.css') {
      return store.postcssAst(ref);
    }

    if (ref.ext === '.js') {
      if (startsWith(ref.name, rootNodeModules)) {
        return store.babylonAst(ref);
      }
      // TODO
      // Given we have the `code` job, should we use babylon for everything?
      // Will need to handle new deps added by transforms as well. Currently
      // the babelAst job is throwing away any generated code or maps, so
      // we'll need to clean this up at some point
      return store.babelAst(ref);
    }

    throw new Error(`Unknown extension "${ref.ext}", cannot parse "${ref.name}"`);
  },
  analyzeDependencies(ref, store) {
    if (ref.ext === '.css') {
      return store.ast(ref).then(ast => postcssAstDependencies(ast));
    }

    if (ref.ext === '.js') {
      return store.ast(ref).then(ast => babylonAstDependencies(ast));
    }

    return [];
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
      .then(ids => {
        return store.resolveOptions(ref)
          .then(options => {
            return Promise.all(
              ids.map(id => resolve(id, options))
            )
          }).then(resolved => zipObject(ids, resolved));
      });
  },
  resolvePackageDependencies(ref, store) {
    return store.packageDependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)))
      .then(ids => {
        return store.resolveOptions(ref)
          .then(options => {
            return Promise.all(
              ids.map(id => resolve(id, options))
            )
          }).then(resolved => zipObject(ids, resolved));
      });
  },
  resolvedDependencies(ref, store) {
    const cache = resolvedDependenciesCache;
    const key = store.cacheKey(ref);

    // Aggressively cache resolved paths for files that live in node_modules
    if (startsWith(ref.name, rootNodeModules)) {
      return getCachedData(cache, key, () => {
        return Promise.all([
          store.resolvePathDependencies(ref),
          store.resolvePackageDependencies(ref)
        ]).then(([pathDeps, packageDeps]) => assign({}, pathDeps, packageDeps))
      });
    }

    // To avoid any edge-cases caused by caching path-based dependencies,
    // we only cache the resolved paths which relate to packages
    return Promise.all([
      store.resolvePathDependencies(ref),
      getCachedData(cache, key, () => store.resolvePackageDependencies(ref))
    ]).then(([pathDeps, packageDeps]) => assign({}, pathDeps, packageDeps))
  },
  code(ref, store) {
    if (ref.ext === '.css') {
      return store.ast(ref).then(ast => {
        // Remove import rules
        ast.walkAtRules('import', rule => rule.remove());

        const result = ast.toResult({
          // Generate a source map, but keep it separate from the code
          map: {
            inline: false,
            annotation: false
          }
        });

        return result.css;
      });
    }

    if (ref.ext === '.js') {
      if (ref.name === runtimeFile) {
        return store.readText(ref);
      }

      return Promise.all([
        store.readText(ref),
        store.ast(ref),
        store.resolvedDependencies(ref),
        store.hash(ref)
      ]).then(([text, ast, dependencies, hash]) => {

        // TODO: if we're using the babel transform, the code will already have been generated
        const result = babelGenerator(ast, null, text);

        const code = result.code;

        const moduleData = {
          name: ref.name,
          dependencies,
          hash
        };

        const lines = [
          `__modules.addModule({name: ${JSON.stringify(ref.name)}, deps: ${JSON.stringify(dependencies)}, hash: ${JSON.stringify(hash)}, factory: function(module, exports, require, process, global) {`,
          code,
          '}});'
        ];

        return lines.join('\n');
      });
    }

    // TODO: handle `.json`
    // TODO: handle binary files (images, etc)
    return Promise.reject(`Cannot generate code for extension: ${ref.ext}. File: ${ref.name}`);
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
  });
}

const graphEntryPoints = [runtimeFile, ...entryPoints];

envHash({files: [__filename, 'package.json']}).then(hash => {
  console.log(chalk.bold('EnvHash: ') + hash + '\n');

  const cacheRoot = path.join(__dirname, hash);
  analyzedDependenciesCache = createFileCache(path.join(cacheRoot, 'dependency_identifiers'));
  resolvedDependenciesCache = createFileCache(path.join(cacheRoot, 'resolved_dependencies'));

  analyzedDependenciesCache.events.on('error', err => emitError(err));
  resolvedDependenciesCache.events.on('error', err => emitError(err));

  const graph = createGraph({
    getDependencies: (file) => {
      if (!records.has(file)) {
        records.create(file);
      }

      const watched = watcher.getWatched();
      // We reduce system load by only watching files outside
      // of the root node_modules directory
      if (!startsWith(file, rootNodeModules)) {
        const dirname = path.dirname(file);
        if (!includes(watched[dirname], path.basename(file))) {
          watcher.add(file);
        }
      }

      return records.resolvedDependencies(file).then(resolved => {
        return values(resolved);
      });
    }
  });

  let traceStart;
  graph.events.on('started', () => {
    traceStart = (new Date()).getTime();

    sockets.forEach(socket => socket.emit('build:started'));
  });

  graphEntryPoints.forEach(file => {
    graph.setNodeAsEntry(file);
    graph.traceFromNode(file);
  });

  const watcher = chokidar.watch([], {
    persistent: true
  });

  function handleFileChange(file) {
    // Update the records and graph
    records.remove(file);
    const node = graph.getState().get(file);
    graph.pruneNode(file);
    if (includes(graphEntryPoints, file)) {
      graph.setNodeAsEntry(file);
      graph.traceFromNode(file);
    }
    // Re-trace any dependents of the file
    node.dependents.forEach(dependent => graph.traceFromNode(dependent));
  }

  watcher.on('change', (file) => {
    console.log(`\n${chalk.italic('File change:')} ${file}\n`);
    handleFileChange(file);
  });

  watcher.on('unlink', (file) => {
    console.log(`\n${chalk.italic('File unlink:')} ${file}\n`);
    handleFileChange(file);
  });

  graph.events.on('error', ({node, error}) => {
    emitError(error, node);
  });

  graph.events.on('traced', () => {
    const known = graph.getState().size;
    const done = known - graph.pendingJobs.length;
    const message = `\r${chalk.bold('Trace:')} ${done} / ${known}`;
    process.stdout.write(message);
  });

  graph.events.on('completed', ({errors, diff}) => {
    process.stdout.write('\n'); // clear the progress indicator

    const elapsed = (new Date()).getTime() - traceStart;

    if (errors.length) {
      console.log(`${chalk.bold('Errors:')} ${errors.length}`);
      return;
    }

    console.log(`${chalk.bold('Elapsed:')} ${elapsed}ms`);

    const disconnectedDiff = graph.pruneDisconnectedNodes();
    const mergedDiff = mergeDiffs(diff, disconnectedDiff);
    const prunedNodes = getPrunedNodesFromDiff(mergedDiff);
    const newNodes = getNewNodesFromDiff(mergedDiff);

    const nodes = graph.getState().keySeq().toArray();

    // Clean up any data associated with any files that were
    // removing during the tracing
    prunedNodes.forEach(node => {
      watcher.unwatch(node);
      records.remove(node);
    });

    // Start watching any new files
    const watched = watcher.getWatched();
    newNodes
      // We reduce system load by only watching files outside
      // of the root node_modules directory
      .filter(name => !startsWith(name, rootNodeModules))
      .forEach(name => {
        const dirname = path.dirname(name);
        if (!includes(watched[dirname], path.basename(name))) {
          watcher.add(name);
        }
      });

    console.log(chalk.bold(`\nGenerating code...`));

    const graphState = graph.getState();
    const buildStart = (new Date()).getTime();
    const fileErrors = [];

    Promise.all(
      nodes.map(node => {
        return Promise.all([
          node,
          records.hash(node),
          records.code(node),
          records.filename(node),
          records.url(node)
        ]).catch(err => {
          emitError(err, node);
          fileErrors.push(err);
          return Promise.reject(err);
        });
      })
    ).then(() => {
      const buildElapsed = (new Date()).getTime() - buildStart;
      console.log(`${chalk.bold('Elapsed:')} ${buildElapsed}ms`);

      if (graph.getState() === graphState) {
        const recordsState = records.getState();
        onCodeGenerated({
          recordsState,
          graphState,
          prunedNodes
        });
      }
    })
    .catch(err => {
      if (includes(fileErrors, err)) {
        // We've already emitted it
        console.error(err);
        return;
      }
      emitError(err);
    });
  });
});

io.on('connection', (socket) => {
  sockets.push(socket);
  socket.on('disconnect', () => {
    pull(sockets, socket);
  });
});

function emitError(err, file) {
  const lines = [];

  if (file) {
    lines.push(chalk.red(file), '');
  }

  lines.push(err.message);

  if (err.loc && !err.codeFrame) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {}
    if (text) {
      err.codeFrame = babelCodeFrame(text, err.loc.line, err.loc.column);
    }
  }

  if (err.codeFrame && !includes(err.stack, err.codeFrame)) {
    lines.push(err.codeFrame);
  }

  lines.push(err.stack);

  const message = lines.join('\n');

  emitErrorMessage(message);
}

function emitErrorMessage(message) {
  console.error('\n' + message);

  const cleanedMessage = stripAnsi(message);
  sockets.forEach(socket => socket.emit('build:error', cleanedMessage));
}

const serverState = {
  records: null,
  graph: null,
  recordsByUrl: null,
  isListening: false
};

function onCodeGenerated({recordsState, graphState, prunedNodes}) {
  serverState.records = recordsState;
  serverState.graph = graphState;
  serverState.recordsByUrl = {};

  if (!serverState.isListening) {
    serverState.isListening = true;
    server.listen(3000, '127.0.0.1', () => {
      console.log(`\n${chalk.bold('Server:')} http://127.0.0.1:3000`);
    });
  }

  const files = {};

  recordsState.forEach(record => {
    serverState.recordsByUrl[record.data.get('url')] = record;

    if (record.name !== runtimeFile) {
      files[record.name] = {
        name: record.name,
        hash: record.data.get('hash'),
        url: createRecordUrl(record)
      };
    }
  });

  const signal = {
    files: files,
    removed: prunedNodes
    //graph: graphState.toJS()
  };

  sockets.forEach(socket => socket.emit('build:complete', signal));
}

app.get('/', (req, res) => {
  const records = serverState.records;
  const graph = serverState.graph;

  const scripts = [];
  const styles = [];
  const styleShims = [];

  const runtimeUrl = records.get(runtimeFile).data.get('url');

  const executionOrder = resolveExecutionOrder(graph, entryPoints);

  executionOrder.forEach(name => {
    const record = records.get(name);
    const filename = record.data.get('filename');
    const url = record.data.get('url');
    const ext = path.extname(filename);

    if (ext === '.css') {
      styles.push(`<link rel="stylesheet" href="${url}" data-unfort-name="${record.name}">`);
      styleShims.push(
        `__modules.addModule({name: ${JSON.stringify(record.name)}, hash: ${record.data.get('hash')}, factory: function(module) {
          module.exports = '';
        }});`
      );
    }

    if (ext === '.js' && record.name !== runtimeFile) {
      scripts.push(`<script src="${url}" data-unfort-name="${record.name}"></script>`);
    }
  });

  const entryPointsInit = entryPoints.map(file => {
    return `__modules.executeModule(${JSON.stringify(file)});`;
  });

  res.end(`
    <html>
    <head>
      ${styles.join('\n')}
    </head>
    <body>
      <script src="${runtimeUrl}"></script>
      ${scripts.join('\n')}
      <script>
        ${styleShims.join('\n')}
        ${entryPointsInit.join('\n')}
      </script>
    </body>
    </html>
  `);
});

app.get(fileEndpoint + '*', (req, res) => {
  const url = req.path;

  const record = serverState.recordsByUrl[url];

  if (!record) {
    return res.status(404).send('Not found');
  }

  const mimeType = mimeTypes.lookup(record.data.get('filename'));
  if (mimeType) {
    res.contentType(mimeType);
  }

  return res.end(record.data.get('code'));
});
