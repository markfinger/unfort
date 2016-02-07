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

const runtimeFile = require.resolve('../../runtime/runtime');
const entryPoints = [
  require.resolve('./hmr-runtime'),
  path.join(sourceRoot, 'src', 'server-test', 'entry.js')
];

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
    return store.readText(ref)
      .then(text => new murmur(text).result());
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
      // TODO
      // Given we have the `code` job, should we use babylon for everything?
      // Will need to handle new deps added by transforms as well. Currently
      // the babelAst job is throwing away any generated code or maps, so
      // we'll need to clean this up at some point
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

    // Aggressively cache resolved paths for files that live in node_modules
    if (startsWith(ref.name, rootNodeModules)) {
      return getCachedData(cache, key, () => {
        return Promise.all([
          store.resolvePathDependencies(ref),
          store.resolvePackageDependencies(ref)
        ]).then(flatten)
      });
    }

    // To avoid any edge-cases caused by caching path-based dependencies,
    // we only cache the resolved paths which relate to packages
    return Promise.all([
      store.resolvePathDependencies(ref),
      getCachedData(cache, key, () => store.resolvePackageDependencies(ref))
    ]).then(flatten)
  },
  code(ref, store) {
    const ext = path.extname(ref.name);

    if (ext === '.css') {
      return Promise.all([
        store.ast(ref),
        store.hash(ref)
      ]).then(([ast, hash]) => {
        // Remove import rules
        ast.walkAtRules('import', rule => rule.remove());

        const result = ast.toResult({
          // Generate a source map, but keep it separate from the code
          map: {
            inline: false,
            annotation: false
          }
        });

        return {
          code: result.css,
          sourceMap: result.map,
          hash
        };
      });
    }

    if (ext === '.js') {
      return Promise.all([
        store.readText(ref),
        store.ast(ref),
        store.resolvedDependencies(ref),
        store.hash(ref)
      ]).then(([text, ast, dependencies, hash]) => {
        const result = babelGenerator(ast, null, text);

        const code = result.code;

        const moduleData = {
          name: ref.name,
          dependencies,
          hash
        };

        const lines = [
          `__modules.addModule(${JSON.stringify(moduleData)}, function(module, exports, require, process, global) {`,
          code,
          '});'
        ];

        return {
          code: lines.join('\n'),
          sourceMap: result.map,
          hash
        }
      });
    }

    // TODO: handle `.json`
    // TODO: handle binary files (images, etc)
    return Promise.reject(`Cannot generate code for extension: ${ext}. File: ${ref.name}`);
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

envHash({files: [__filename, 'package.json']}).then(hash => {
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

    console.log(chalk.bold(`\nCode generation...`));

    const buildStart = (new Date()).getTime();
    Promise.all(
      nodes.map(node => Promise.all([
        node,
        records.code(node)
      ]))
    ).then(files => {
      const buildElapsed = (new Date()).getTime() - buildStart;
      console.log(`${chalk.bold('Elapsed:')} ${buildElapsed}ms`);

      onCodeGenerated(files);
    });
  });

  [runtimeFile, ...entryPoints].forEach(file => {
    graph.setNodeAsEntry(file);
    graph.traceFromNode(file);
  });
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

server.listen(3000, '127.0.0.1', () => {
  console.log(`${chalk.bold('Server:')} http://127.0.0.1:3000`);
});

const sockets = [];

io.on('connection', (socket) => {
  console.log('hmr connection opened');

  socket.on('disconnect', () => {
    console.log('hmr connection closed');

    pull(sockets, socket);
  });

  sockets.push(socket);
});

const serverState = {
  files: null
};

function onCodeGenerated(files) {
  serverState.files = files;
}

app.get('/', (req, res) => {
  function generateScriptElement(file) {
    return `<script src="${file}"></script>`;
  }

  function generateLinkElement(file) {
    return `<link rel="stylesheet" href="${file}">`;
  }

  const runtimeScript = generateScriptElement(runtimeFile);

  const files = serverState.files;

  const styles = files.filter(file => path.extname(file) === '.css')
    .map(generateLinkElement)
    .join('\n');

  const scripts = files.filter(file => file !== runtimeFile && path.extname(file) === '.js')
    .map(generateScriptElement)
    .join('\n');

  const initCode = entryPoints.map(file => {
    return `__modules.executeModule(${JSON.stringify(file)});`;
  }).join('\n');

  res.end(`
    <html>
    <head>
      ${styles}
    </head>
    <body>
      ${runtimeScript}
      ${scripts}
      <script>
        ${initCode}
      </script>
    </body>
    </html>
  `);
});

app.get('/file/*', (req, res) => {
  const file = req.path;

  if (!file) {
    return res.status(404).send('Not found');
  }

  const abs = path.join(sourceRoot, file);

  if (files[abs]) {
    return res.end(files[abs]);
  }
});

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