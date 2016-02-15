import fs from 'fs';
import path from 'path';
import http from 'http';
import socketIo from 'socket.io';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import * as mimeTypes from 'mime-types';
import * as babel from 'babel-core';
import * as babylon from 'babylon';
import imm from 'immutable';
import stripAnsi from 'strip-ansi';
import babelCodeFrame from 'babel-code-frame';
import babelGenerator from 'babel-generator';
import chokidar from 'chokidar';
import murmur from 'imurmurhash';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import promisify from 'promisify-node';
import chalk from 'chalk';
import {startsWith, endsWith, repeat} from 'lodash/string';
import {pull, zipObject, uniq} from 'lodash/array';
import {values, assign} from 'lodash/object';
import {includes} from 'lodash/collection';
import {isNull} from 'lodash/lang';
import envHash from '../env-hash';
import babylonAstDependencies from '../babylon-ast-dependencies';
import postcssAstDependencies from '../postcss-ast-dependencies';
import browserifyBuiltins from 'browserify/lib/builtins';
import browserResolve from 'browser-resolve';
import {createFileCache} from '../kv-cache';
import {createGraph, resolveExecutionOrder} from '../cyclic-dependency-graph';
import createRecordStore from '../record-store';
import packageJson from '../../package.json';

sourceMapSupport.install();

process.on('unhandledRejection', err => {
  throw err;
});

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const resolve = promisify(browserResolve);

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');

const bootstrapRuntime = require.resolve('../../runtimes/bootstrap');

const entryPoints = [
  require.resolve('../../runtimes/hot'),
  require.resolve('../../test-src/entry')
];

console.log(`${chalk.bold('Unfort:')} v${packageJson.version}`);

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

function setState(newState) {
  state = newState;
  // TODO: handle request block and flushing
}

// We need to rebuild source maps for js files such that it
// reflects the call to our module runtime. Unfortunately, source
// maps are slow to both consume and generate. However, given
// that we know our call to the runtime only consumes one line,
// we can take advantage of the line offset character in source
// maps to simply offset everything. For context, source maps
// are encoded with Base64 and variable length quantity, and
// semicolons are used to indicate line offset. Hence, we can
// just prepend a semi-colon
const JS_MODULE_SOURCE_MAP_LINE_OFFSET = ';';

function createJSModule({name, deps, hash, code}) {
  const lines = [
    `__modules.defineModule({name: ${JSON.stringify(name)}, deps: ${JSON.stringify(deps)}, hash: ${JSON.stringify(hash)}, factory: function(module, exports, require, process, global) {`,
    code,
    '}});'
  ];

  return lines.join('\n');
}

let recordCache;

const records = createRecordStore({
  ready(ref, store) {
    // All the jobs that must be completed before
    // the record is emitted
    return Promise.all([
      ref.name,
      store.hash(ref),
      store.code(ref),
      store.url(ref),
      store.sourceMap(ref),
      store.sourceMapUrl(ref),
      store.sourceMapAnnotation(ref),
      store.hashedFilename(ref),
      store.isTextFile(ref)
    ]);
  },
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
    return store.stat(ref)
      .then(stat => {
        return stat.mtime.getTime();
      });
  },
  hashText(ref, store) {
    return store.readText(ref)
      .then(text => {
        const hash = new murmur(text).result();
        return hash.toString();
      });
  },
  hash(ref, store) {
    return store.isTextFile(ref)
      .then(isTextFile => {
        if (!isTextFile) {
          return store.mtime(ref);
        }
        return store.hashText(ref);
      })
      .then(hash => hash.toString());
  },
  cacheKey(ref, store) {
    return Promise.all([
      ref.name,
      store.readText(ref),
      store.mtime(ref)
    ]);
  },
  readCache(ref, store) {
    return store.cacheKey(ref)
      .then(key => recordCache.get(key))
      .then(data => {
        if (isNull(data)) {
          return {};
        }
        return data;
      });
  },
  writeCache(ref, store) {
    return Promise.all([
      store.cacheKey(ref),
      store.readCache(ref)
    ]).then(([key, data]) => recordCache.set(key, data));
  },
  hashedFilename(ref, store) {
    return store.hash(ref)
      .then(hash => {
        const basename = path.basename(ref.name, ref.ext);
        return `${basename}-${hash}${ref.ext}`;
      });
  },
  hashedPath(ref, store) {
    return store.hashedFilename(ref)
      .then(hashedFilename => {
        return path.join(path.basename(ref.name), hashedFilename);
      });
  },
  url(ref, store) {
    function createRelativeUrl(absPath) {
      const relPath = path.relative(sourceRoot, absPath);
      return fileEndpoint + relPath;
    }

    return store.isTextFile(ref)
      .then(isTextFile => {
        if (!isTextFile) {
          return createRelativeUrl(ref.name);
        }

        return store.hashedFilename(ref).then(filename => {
          const dirname = path.dirname(ref.name);
          return createRelativeUrl(path.join(dirname, filename));
        });
      });
  },
  sourceMapUrl(ref, store) {
    return store.url(ref)
      .then(url => url + '.map');
  },
  sourceMapAnnotation(ref, store) {
    return Promise.all([
      store.url(ref),
      store.sourceMapUrl(ref)
    ]).then(([url, sourceMapUrl]) => {
      if (endsWith(url, '.css')) {
        return `\n/*# sourceMappingURL=${sourceMapUrl} */`;
      }

      if (
        endsWith(url, '.js') ||
        endsWith(url, '.json')
      ) {
        return `\n//# sourceMappingURL=${sourceMapUrl}`;
      }

      return null;
    });
  },
  postcssPlugins() {
    // Finds any `@import ...` and `url(...)` identifiers and
    // annotates the result object
    const analyzeDependencies = postcss.plugin('unfort-analyze-dependencies', () => {
      return (root, result) => {
        result.unfortDependencies = postcssAstDependencies(root);
      };
    });

    // As we serve the files with different names, we need to remove
    // the `@import ...` rules
    const removeImports = postcss.plugin('unfort-remove-imports', () => {
      return root => {
        root.walkAtRules('import', rule => rule.remove());
      };
    });

    return [autoprefixer, analyzeDependencies, removeImports];
  },
  postcssProcessOptions(ref, store) {
    return store.hashedPath(ref)
      .then(hashedPath => {
        return {
          from: path.relative(sourceRoot, ref.name),
          to: path.relative(sourceRoot, hashedPath),
          // Generate a source map, but keep it separate from the code
          map: {
            inline: false,
            annotation: false
          }
        };
      });
  },
  postcssTransform(ref, store) {
    return Promise.all([
      store.readText(ref),
      store.postcssPlugins(ref),
      store.postcssProcessOptions(ref)
    ]).then(([text, postcssPlugins, processOptions]) => {
      return postcss(postcssPlugins).process(text, processOptions);
    });
  },
  babelTransformOptions(ref) {
    return {
      filename: ref.name,
      sourceRoot,
      sourceType: 'module',
      sourceMaps: true,
      babelrc: false,
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
  babelGeneratorOptions(ref, store) {
    return store.url(ref)
      .then(url => {
        return {
          sourceMaps: true,
          sourceMapTarget: path.basename(url),
          sourceFileName: path.basename(ref.name)
        };
      });
  },
  babelGenerator(ref, store) {
    return Promise.all([
      store.readText(ref),
      store.babylonAst(ref),
      store.babelGeneratorOptions(ref)
    ]).then(([text, ast, options]) => {
      return babelGenerator(ast, options, text);
    });
  },
  babelFile(ref, store) {
    if (startsWith(ref.name, rootNodeModules)) {
      return store.babelGenerator(ref);
    }

    return store.babelTransform(ref);
  },
  babelAst(ref, store) {
    return store.babelTransform(ref)
      .then(file => file.ast);
  },
  babylonAst(ref, store) {
    return store.readText(ref)
      .then(text => {
        return babylon.parse(text, {
          sourceType: 'script'
        });
      });
  },
  ast(ref, store) {
    if (ref.ext === '.js') {
      if (startsWith(ref.name, rootNodeModules)) {
        return store.babylonAst(ref);
      }
      return store.babelAst(ref);
    }

    throw new Error(`Unknown extension "${ref.ext}", cannot parse "${ref.name}"`);
  },
  analyzeDependencies(ref, store) {
    if (ref.ext === '.css') {
      return store.postcssTransform(ref)
        .then(result => {
          return result.unfortDependencies;
        });
    }

    if (ref.ext === '.js') {
      return store.ast(ref)
        .then(ast => babylonAstDependencies(ast));
    }

    return [];
  },
  dependencyIdentifiers(ref, store) {
    return store.readCache(ref)
      .then(data => {
        if (data.dependencyIdentifiers) {
          return data.dependencyIdentifiers;
        }

        return store.analyzeDependencies(ref)
          .then(deps => deps.map(dep => dep.source))
          .then(ids => {
            data.dependencyIdentifiers = ids;
            return ids;
          });
      });
  },
  packageDependencyIdentifiers(ref, store) {
    return store.dependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)));
  },
  resolver(ref, store) {
    return store.resolverOptions(ref)
      .then(options => {
        return id => resolve(id, options);
      });
  },
  resolverOptions(ref) {
    return {
      basedir: path.dirname(ref.name),
      extensions: ['.js', '.json'],
      modules: browserifyBuiltins
    };
  },
  resolvePathDependencies(ref, store) {
    return store.dependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] === '.' || path.isAbsolute(id)))
      .then(ids => store.resolver(ref)
          .then(resolver => Promise.all(ids.map(id => resolver(id))))
          .then(resolved => zipObject(ids, resolved))
      );
  },
  resolvePackageDependencies(ref, store) {
    return store.packageDependencyIdentifiers(ref)
      .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)))
      .then(ids => store.resolver(ref)
        .then(resolver => Promise.all(ids.map(id => resolver(id))))
        .then(resolved => zipObject(ids, resolved))
      );
  },
  resolvedDependencies(ref, store) {
    return store.readCache(ref)
      .then(data => {
        // Aggressively cache resolved paths for files that live in node_modules
        if (startsWith(ref.name, rootNodeModules)) {
          if (data.resolvedDependencies) {
            return data.resolvedDependencies;
          }

          return Promise.all([
            store.resolvePathDependencies(ref),
            store.resolvePackageDependencies(ref)
          ]).then(([pathDeps, packageDeps]) => {
            return data.resolvedDependencies = assign({}, pathDeps, packageDeps);
          });
        }

        // To avoid any edge-cases caused by caching path-based dependencies,
        // we only cache the resolved paths which relate to packages
        let packageDeps = data.resolvedDependencies;
        if (!packageDeps) {
          packageDeps = store.resolvePackageDependencies(ref);
        }
        return Promise.all([
          store.resolvePathDependencies(ref),
          packageDeps
        ]).then(([pathDeps, packageDeps]) => {
          data.resolvedDependencies = packageDeps;
          return assign({}, pathDeps, packageDeps)
        });
      });
  },
  code(ref, store) {
    return store.isTextFile(ref)
      .then(isTextFile => {
        if (!isTextFile) {
          return null;
        }

        return store.readCache(ref)
          .then(data => {
            if (data.code) {
              return data.code;
            }

            if (ref.ext === '.css') {
              return store.postcssTransform(ref)
                .then(result => {
                  data.code = result.css;
                  return result.css;
                });
            }

            if (ref.ext === '.js') {
              if (ref.name === bootstrapRuntime) {
                return store.readText(ref);
              }

              return Promise.all([
                store.babelFile(ref),
                store.resolvedDependencies(ref),
                store.hash(ref)
              ]).then(([file, deps, hash]) => {
                const code = createJSModule({
                  name: ref.name,
                  deps,
                  hash,
                  code: file.code
                });
                data.code = code;
                return code;
              });
            }

            if (ref.ext === '.json') {
              return Promise.all([
                store.readText(ref),
                store.hash(ref)
              ]).then(([text, hash]) => {
                let code;
                if (startsWith(ref.name, rootNodeModules)) {
                  code = `module.exports = ${text};`;
                } else {
                  // We fake babel's commonjs shim so that hot swapping can occur
                  code = `
                    var json = ${text};
                    exports.default = json;
                    exports.__esModule = true;
                    if (module.hot) {
                      module.hot.accept();
                    }
                  `;
                }

                const jsModule = createJSModule({
                  name: ref.name,
                  deps: {},
                  hash,
                  code
                });

                data.code = jsModule;

                return code;
              });
            }

            return Promise.reject(
              `Unknown text file extension: ${ref.ext}. Cannot generate code for file: ${ref.name}`
            );
          });
      });
  },
  sourceMap(ref, store) {
    return store.isTextFile(ref)
      .then(isTextFile => {
        if (!isTextFile) {
          return null;
        }

        return store.readCache(ref)
          .then(data => {
            if (data.sourceMap) {
              return data.sourceMap;
            }

            if (ref.ext === '.css') {
              return store.postcssTransform(ref).then(result => {
                const sourceMap = result.map.toString();
                data.sourceMap = sourceMap;
                return sourceMap;
              });
            }

            if (ref.ext === '.js') {
              return store.babelFile(ref).then(file => {
                // Offset each line in the source map to reflect the call to
                // the module runtime
                file.map.mappings = JS_MODULE_SOURCE_MAP_LINE_OFFSET + file.map.mappings;

                const sourceMap = JSON.stringify(file.map);
                data.sourceMap = sourceMap;
                return sourceMap;
              });
            }

            if (ref.ext === '.json') {
              return null;
            }

            return Promise.reject(
              `Unknown text file extension: ${ref.ext}. Cannot generate source map for file: ${ref.name}`
            );
          });
      });
  }
});

// The directories that our watcher has been instructed to observe.
// We use an object as a map as it's far more performant than
// chokidar's `getWatched` method
const watchedDirectories = {};

const watcher = chokidar.watch([], {
  persistent: true,
  depth: 0
});

watcher.on('addDir', dirname => {
  watchDirectory(dirname);

  restartBuildForFailedNodes();
});
watcher.on('add', restartBuildForFailedNodes);
watcher.on('unlinkDir', restartBuildForFailedNodes);
watcher.on('change', onChangeToFile);
watcher.on('unlink', onChangeToFile);
watcher.on('error', error => console.error(`Watcher error: ${error}`));

// We use another watcher that does a shallow watch on node_modules.
// We generally treat node_modules as a fairly static lump of data,
// but there are plenty of real world situations where we need to
// detect changes so that we can rebuild a failed or invalid graph
const nodeModulesWatcher = chokidar.watch([rootNodeModules], {
  persistent: true,
  depth: 0
});

nodeModulesWatcher.on('error', error => console.error(`\`node_modules\` watcher error: ${error}`));

// We wait until the node_modules directory has been scanned, as we
// only care about directories that are added or removed
nodeModulesWatcher.on('ready', () => {

  // If npm has installed a package, it's quite likely that a failed
  // build might complete successfully now
  nodeModulesWatcher.on('addDir', restartBuildForFailedNodes);

  // If a directory has been removed, we need to find every node that
  // used to live in it and potentially rebuild the graph
  nodeModulesWatcher.on('unlinkDir', dirname => {
    const nodesImpactingOthers = [];

    graph.getState().forEach((node, name) => {
      if (startsWith(name, dirname)) {
        node.dependents.forEach(dependentName => {
          // If the file was a dependency of a file in either another
          // package or a file outside of node_modules, then we need
          // to remove it from the graph
          if (
            !startsWith(dependentName, rootNodeModules) ||
            !startsWith(dependentName, dirname)
          ) {
            nodesImpactingOthers.push(name);
          }
        });
      }
    });

    uniq(nodesImpactingOthers).forEach(restartTraceOfFile);
  });
});

/**
 * Ensures that the watcher is observing a particular directory
 *
 * @param {String} dirname
 */
function watchDirectory(dirname) {
  if (startsWith(dirname, rootNodeModules)) {
    // We leave everything in node_modules to be handled by
    // it's specific watcher
    return;
  }

  if (!watchedDirectories[dirname]) {
    watchedDirectories[dirname] = true;
    watcher.add(dirname);
  }
}

/**
 * Given a particular file that has changed, invalidate any data
 * and restart the build if necessary
 *
 * @param {String} file
 */
function onChangeToFile(file) {
  if (graph.getState().has(file)) {
    restartTraceOfFile(file);
  } else {
    restartBuildForFailedNodes();
  }
}

/**
 * If a previous build failed, we start a retrace of nodes that
 * were known to have failed
 */
function restartBuildForFailedNodes() {
  const errors = state.get('errors');
  if (errors) {
    console.log('onChangeToFileStructure with errors');
    const nodesToRetrace = errors
      .map(error => error.node)
      .filter(node => node);

    uniq(nodesToRetrace).forEach(node => {
      restartTraceOfFile(node);
    });
  }
}

/**
 * Removes all data associated with a particular file, then
 * reconstructs any missing parts of the graph and starts
 * retracing the graph from the files that used to depend on
 * it
 *
 * @param {String} file
 */
function restartTraceOfFile(file) {
  console.log(`${chalk.bold('Retracing:')} ${file}`);

  const node = graph.getState().get(file);

  // Remove any data associated with the file
  records.remove(file);

  // Remove the node and any edges associated with it
  graph.pruneNode(file);

  // If the file is an entry point, we need to start re-tracing
  // it directly
  if (file === bootstrapRuntime || includes(entryPoints, file)) {
    graph.setNodeAsEntry(file);
    graph.traceFromNode(file);
  }

  // Ensure that the file's dependents are updated as well
  node.dependents.forEach(dependent => {
    graph.traceFromNode(dependent);
  });
}

const graph = createGraph({
  getDependencies: (file) => {
    if (!records.has(file)) {
      records.create(file);
    }

    // We reduce system load by only watching files outside
    // of the root node_modules directory
    if (startsWith(file, sourceRoot) && !startsWith(file, rootNodeModules)) {
      const sourceRootLength = sourceRoot.length;

      // We walk up the directory structure to the source root and
      // start watching every directory
      let dirname = path.dirname(file);
      while (dirname.length > sourceRootLength) {
        watchDirectory(dirname);
        dirname = path.dirname(dirname);
      }
    }

    return records.resolvedDependencies(file)
      .then(resolved => {
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
    setState(state.set('errors', errors));
    return;
  }

  console.log(`${chalk.bold('Trace elapsed:')} ${elapsed}ms`);

  // Traverse the graph and prune all nodes which are disconnected
  // from the entry points. This ensures that the graph never
  // carries along any unwanted dependencies
  graph.pruneDisconnectedNodes();

  const graphState = graph.getState();

  console.log(chalk.bold(`Code generation...`));

  const buildStart = (new Date()).getTime();
  const errorsDuringReadyJob = [];

  Promise.all(
    graphState.keySeq().toArray().map(name => {
      return records.ready(name)
        .catch(err => {
          emitError(err, name);

          const errObject = {
            error: err,
            node: name
          };
          errorsDuringReadyJob.push(errObject);

          return Promise.reject(errObject);
        });
    })
  )
    .then(() => {
      // If the graph is still the same as when we started the
      // build, then we start pushing the code towards the user
      if (graph.getState() === graphState) {
        const buildElapsed = (new Date()).getTime() - buildStart;
        console.log(`${chalk.bold('Code generation elapsed:')} ${buildElapsed}ms`);

        emitBuild();
      }
    })
    .catch(err => {
      if (!includes(errorsDuringReadyJob, err)) {
        // Handle an error that occurred outside of the `ready` jobs
        emitError(err);
        errorsDuringReadyJob.push(err);
      }

      setState(state.set('errors', errorsDuringReadyJob));

      console.log(repeat('-', 80));
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
    } catch (err) {
      // Ignore the error
    }
    if (text) {
      err.codeFrame = babelCodeFrame(text, err.loc.line, err.loc.column);
    }
  }

  if (err.codeFrame && !includes(err.stack, err.codeFrame)) {
    lines.push(err.codeFrame);
  }

  lines.push(err.stack);

  const message = lines.join('\n');

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
    url: record.data.get('url'),
    isTextFile: record.data.get('isTextFile')
  };
}

function emitBuild() {
  const prevState = state;

  const graphState = graph.getState();
  const prevGraphState = prevState.get('graph');

  // Find all the nodes that were removed from the graph during the
  // build process
  const prunedNodes = [];
  prevGraphState.forEach((_, name) => {
    if (!graphState.has(name)) {
      prunedNodes.push(name);
    }
  });

  // Remove all records that are no longer represented in the graph.
  // While most of the graph structure would have settled quite early
  // in the build process, we leave the records in memory for as long
  // as possible. This enables us to respond more swiftly to changes
  // that occur during the build, as we've preserved the computationally
  // expensive part of the process
  prunedNodes.forEach(name => {
    records.remove(name);
  });

  const recordsState = records.getState();
  const prevRecordsState = prevState.get('records');

  setState(
    state.merge({
      records: recordsState,
      graph: graphState,
      // Maps of records so that the file endpoint can perform record look ups
      // trivially. This saves us from having to iterate over every record
      recordsByUrl: recordsState
        .filter(record => Boolean(record.data.get('url')))
        .mapKeys((_, record) => record.data.get('url')),
      recordsBySourceMapUrl: recordsState
        .filter(record => Boolean(record.data.get('sourceMapAnnotation')))
        .mapKeys((_, record) => record.data.get('sourceMapUrl')),
      errors: null
    })
  );

  // The payload that we send with the `build:complete` signal.
  // The hot runtime uses this to reconcile the front-end by
  // adding, updating or removing assets. We don't send the assets
  // down the wire, we only tell the runtime what has changed and
  // where it can fetch each asset from
  const payload = {
    records: {},
    removed: {}
  };

  const recordsToCache = [];

  recordsState.forEach(record => {
    if (record.name !== bootstrapRuntime) {
      recordsToCache.push(record.name);
      payload.records[record.name] = createRecordDescription(record);
    }
  });

  prunedNodes.forEach(name => {
    const prevRecord = prevRecordsState.get(name);
    payload.removed[name] = createRecordDescription(prevRecord);
  });

  // Send the payload over the wire to any connected browser
  sockets.forEach(socket => socket.emit('build:complete', payload));

  // We write all the computationally expensive data to disk, so that
  // we can reduce the startup cost of repeated builds
  console.log(`${chalk.bold('Cache write:')} ${recordsToCache.length} records...`);
  const cacheWriteStart = (new Date()).getTime();
  Promise.all(
    recordsToCache.map(name => records.writeCache(name))
  )
    .then(() => {
      const elapsed = (new Date()).getTime() - cacheWriteStart;
      console.log(`${chalk.bold('Cache write elapsed:')} ${elapsed}ms`);
    })
    .catch(err => {
      if (records.isIntercept(err)) {
        // If the record store emitted an intercept, it means that a record
        // was removed or invalidated during the cache write. In this case,
        // we can just ignore it, as the tracing would have already restarted
        return;
      }

      err.message = 'Cache write error: ' + err.message;
      emitError(err);
    })
    .then(() => {
      // We should provide some form of visual indication that the build
      // has finished
      console.log(repeat('-', 80));
    });
}

app.get('/', (req, res) => {
  const records = state.get('records');
  const graph = state.get('graph');

  const scripts = [];
  const styles = [];
  const shimModules = [];

  const runtimeUrl = records.get(bootstrapRuntime).data.get('url');

  const executionOrder = resolveExecutionOrder(graph, entryPoints);

  // For non-js assets, we inject shims that expose the asset's
  // url, enabling JS assets to consume them. These module shims
  // also play an important role in enabling the hot runtime to
  // reconcile state changes between builds
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

    shimModules.push(
      createJSModule({
        name: record.name,
        deps: {},
        hash: record.data.get('hash'),
        code
      })
    );
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
      (ext === '.js' && record.name !== bootstrapRuntime) ||
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

function writeRecordToStream(record, stream) {
  const mimeType = mimeTypes.lookup(record.data.get('hashedFilename'));
  if (mimeType) {
    stream.contentType(mimeType);
  }

  if (record.data.get('isTextFile')) {
    stream.write(record.data.get('code'));

    const sourceMapAnnotation = record.data.get('sourceMapAnnotation');
    if (sourceMapAnnotation) {
      stream.write(sourceMapAnnotation);
    }

    return stream.end();
  }

  fs.createReadStream(record.name).pipe(stream);
}

function writeSourceMapToStream(record, stream) {
  const sourceMap = record.data.get('sourceMap');
  stream.end(sourceMap);
}

app.get(fileEndpoint + '*', (req, res) => {
  const url = req.path;

  const record = state.get('recordsByUrl').get(url);
  if (record) {
    return writeRecordToStream(record, res);
  }

  const sourceMapRecord = state.get('recordsBySourceMapUrl').get(url);
  if (sourceMapRecord) {
    return writeSourceMapToStream(sourceMapRecord, res);
  }

  return res.status(404).send('Not found');
});

// Start the build
envHash({files: [__filename, 'package.json']}).then(hash => {
  console.log(chalk.bold('EnvHash: ') + hash);
  console.log(repeat('-', 80));

  const cacheDirectory = path.join(sourceRoot, '.unfort', hash);
  recordCache = createFileCache(cacheDirectory);
  recordCache.events.on('error', err => emitError(err));

  [bootstrapRuntime, ...entryPoints].forEach(file => {
    graph.setNodeAsEntry(file);
    graph.traceFromNode(file);
  });
});