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
io.on('connection', (socket) => {
  sockets.push(socket);
  socket.on('disconnect', () => {
    pull(sockets, socket);
  });
});

server.listen(3000, '127.0.0.1', () => {
  console.log(`${chalk.bold('Server:')} http://127.0.0.1:3000`);
});

const fileEndpoint = '/file/';

let state = imm.Map({
  records: imm.Map(),
  graph: imm.Map(),
  recordsByUrl: imm.Map()
});

function createRelativeUrl(absPath) {
  const relPath = path.relative(sourceRoot, absPath);
  return fileEndpoint + relPath;
}

function createRecordUrl(record) {
  const hashedFilename = record.data.get('hashedFilename');
  const dirname = path.dirname(record.name);
  return createRelativeUrl(path.join(dirname, hashedFilename));
}

let analyzedDependenciesCache;
let resolvedDependenciesCache;

const records = createRecordStore({
  isTextFile(ref) {
    return (
      ref.ext === '.js' ||
      ref.ext === '.css' ||
      ref.ext === '.json'
    );
  },
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
  hashedFilename(ref, store) {
    return store.hash(ref).then(hash => {
      const basename = path.basename(ref.name, ref.ext);
      return `${basename}-${hash}${ref.ext}`;
    });
  },
  url(ref, store) {
    return store.isTextFile(ref).then(isTextFile => {
      if (!isTextFile) {
        return createRelativeUrl(ref.name);
      }

      return store.hashedFilename(ref).then(filename => {
        const dirname = path.dirname(ref.name);
        return createRelativeUrl(path.join(dirname, filename));
      });
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
      return babel.transform(text, options);
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
    return store.isTextFile(ref).then(isTextFile => {
      if (!isTextFile) {
        return null;
      }

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

      function createJSModule({name, deps, hash, code}) {
        const lines = [
          `__modules.defineModule({name: ${JSON.stringify(name)}, deps: ${JSON.stringify(deps)}, hash: ${JSON.stringify(hash)}, factory: function(module, exports, require, process, global) {`,
          code,
          '}});'
        ];

        return lines.join('\n');
      }

      if (ref.ext === '.js') {
        if (ref.name === runtimeFile) {
          return store.readText(ref);
        }

        let babelFile;
        if (startsWith(ref.name, rootNodeModules)) {
          babelFile = Promise.all([
            store.readText(ref),
            store.babylonAst(ref)
          ]).then(([text, ast]) => {
            return babelGenerator(ast, null, text);
          });
        } else {
          babelFile = store.babelTransform(ref);
        }

        return Promise.all([
          babelFile,
          store.resolvedDependencies(ref),
          store.hash(ref)
        ]).then(([file, deps, hash]) => {
          return createJSModule({
            name: ref.name,
            deps,
            hash,
            code: file.code
          });
        });
      }

      if (ref.ext === '.json') {
        return Promise.all([
          store.readText(ref),
          store.hash(ref)
        ]).then(([text, hash]) => {
          let code;
          if (startsWith(ref.name, rootNodeModules)) {
            code = 'module.exports = ${text};'
          } else {
            // We fake babel's commonjs shim so that hot swapping can occur
            code = `
            var json=${text};
            exports.default=json;
            if (typeof json == "object") {
              for (var prop in json) {
                if (json.hasOwnProperty(prop)) {
                  exports[prop]=json[prop];
                }
              }
            }
            exports.__esModule = true;
            if (module.hot) {
              module.hot.accept();
            }
          `;
          }

          return createJSModule({
            name: ref.name,
            deps: {},
            hash,
            code
          })
        });
      }

      return Promise.reject(
        `Unknown text file extension: ${ref.ext}. Cannot generate code for extension for file: ${ref.name}`
      );
    });
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

const graphEntryPoints = [runtimeFile, ...entryPoints];

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

graph.events.on('error', ({node, error}) => {
  emitError(error, node);
});

graph.events.on('traced', () => {
  const known = graph.getState().size;
  const done = known - graph.pendingJobs.length;
  const message = `\r${chalk.bold('Trace:')} ${done} / ${known}`;
  process.stdout.write(message);
});

graph.events.on('completed', ({errors}) => {
  process.stdout.write('\n'); // clear the progress indicator

  const elapsed = (new Date()).getTime() - traceStart;

  if (errors.length) {
    console.log(`${chalk.bold('Errors:')} ${errors.length}`);
    return;
  }

  console.log(`${chalk.bold('Elapsed:')} ${elapsed}ms`);

  // Traverse the graph and prune all nodes which are disconnected
  // from the entry points. This ensures that the graph never
  // carries along any unwanted dependencies
  graph.pruneDisconnectedNodes();

  const graphState = graph.getState();

  console.log(chalk.bold(`\nGenerating code...`));

  const buildStart = (new Date()).getTime();
  const emittedErrors = [];

  Promise.all(
    graphState.keySeq().toArray().map(node => {
      return Promise.all([
        node,
        records.hash(node),
        records.code(node),
        records.hashedFilename(node),
        records.url(node),
        records.isTextFile(node)
      ]).catch(err => {
        emitError(err, node);
        emittedErrors.push(err);
        return Promise.reject(err);
      });
    })
  )
    .then(() => {
      // If the graph is still the same as when we started the
      // build, then we start pushing the code towards the user
      if (graph.getState() === graphState) {
        const buildElapsed = (new Date()).getTime() - buildStart;
        console.log(`${chalk.bold('Elapsed:')} ${buildElapsed}ms`);

        emitBuild();
      }
    })
    .catch(err => {
      // Prevent errors from being emitted twice
      if (includes(emittedErrors, err)) {
        return;
      }

      emitError(err);
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

function createRecordDescription(record) {
  // Produce a description of a record that the hot runtime
  // can consume
  return {
    name: record.name,
    hash: record.data.get('hash'),
    url: createRecordUrl(record),
    isTextFile: record.data.get('isTextFile')
  }
}

function emitBuild() {
  const prevState = state;

  const graphState = graph.getState();
  const prevGraphState = prevState.get('graph');

  const recordsState = records.getState();
  const prevRecordsState = prevState.get('records');

  state = state.merge({
    records: recordsState,
    graph: graphState,
    // A map of records so that file endpoint can perform record
    // look ups trivially. This saves us from having to iterate
    // over every record
    recordsByUrl: recordsState.mapKeys((_, record) => record.data.get('url'))
  });

  // Find all nodes that were removed from the graph during
  // the build process
  const prunedNodes = [];
  prevGraphState.forEach((_, name) => {
    if (!graphState.has(name)) {
      prunedNodes.push(name);
    }
  });

  // Clean up any data associated with any files that were
  // removing during the tracing
  prunedNodes.forEach(name => {
    watcher.unwatch(name);
    records.remove(name);
  });

  // The payload that we send with the `build:complete` signal.
  // The hot runtime uses this to reconcile the front-end and
  // start fetching or removing assets
  const payload = {
    records: {},
    removed: {}
  };

  recordsState.forEach(record => {
    if (record.name !== runtimeFile) {
      payload.records[record.name] = createRecordDescription(record);
    }
  });

  prunedNodes.forEach(name => {
    const prevRecord = prevRecordsState.get(name);
    payload.removed[name] = createRecordDescription(prevRecord);
  });

  sockets.forEach(socket => socket.emit('build:complete', payload));
}

app.get('/', (req, res) => {
  const records = state.get('records');
  const graph = state.get('graph');

  const scripts = [];
  const styles = [];
  const shimModules = [];

  const runtimeUrl = records.get(runtimeFile).data.get('url');

  const executionOrder = resolveExecutionOrder(graph, entryPoints);

  function createShimModule(record) {
    const url = record.data.get('url');

    let code;
    if (startsWith(record.name, rootNodeModules)) {
      code = `module.exports = ${JSON.stringify(url)}`;
    } else {
      code = `\
        exports.default = ${JSON.stringify(url)};
        exports.__esModule = true;
        if (module.hot) {
          module.hot.accept();
        }`;
    }

    shimModules.push(`
      __modules.defineModule({
        name: ${JSON.stringify(record.name)},
        hash: ${record.data.get('hash')},
        factory: function(module, exports) {
          ${code}
        }
      });
    `);
  }

  executionOrder.forEach(name => {
    const record = records.get(name);
    const hashedFilename = record.data.get('hashedFilename');
    const url = record.data.get('url');
    const ext = path.extname(hashedFilename);

    if (ext === '.css') {
      styles.push(`<link rel="stylesheet" href="${url}" data-unfort-name="${record.name}">`);
      createShimModule(record);
    }

    if (
      (ext === '.js' && record.name !== runtimeFile) ||
      ext === '.json'
    ) {
      scripts.push(`<script src="${url}" data-unfort-name="${record.name}"></script>`);
    }

    if (!record.data.get('isTextFile')) {
      createShimModule(record);
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
        ${shimModules.join('\n')}
        ${entryPointsInit.join('\n')}
      </script>
    </body>
    </html>
  `);
});

app.get(fileEndpoint + '*', (req, res) => {
  const url = req.path;

  const record = state.get('recordsByUrl').get(url);

  if (!record) {
    return res.status(404).send('Not found');
  }

  const mimeType = mimeTypes.lookup(record.data.get('hashedFilename'));
  if (mimeType) {
    res.contentType(mimeType);
  }

  if (record.data.get('isTextFile')) {
    return res.end(record.data.get('code'));
  }

  fs.createReadStream(record.name).pipe(res);
});

// Start the build
envHash({files: [__filename, 'package.json']}).then(hash => {
  console.log(chalk.bold('EnvHash: ') + hash + '\n');

  const cacheRoot = path.join(__dirname, hash);
  analyzedDependenciesCache = createFileCache(path.join(cacheRoot, 'dependency_identifiers'));
  resolvedDependenciesCache = createFileCache(path.join(cacheRoot, 'resolved_dependencies'));

  analyzedDependenciesCache.events.on('error', err => emitError(err));
  resolvedDependenciesCache.events.on('error', err => emitError(err));

  graphEntryPoints.forEach(file => {
    graph.setNodeAsEntry(file);
    graph.traceFromNode(file);
  });
});