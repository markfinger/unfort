import fs from 'fs';
import path from 'path';
import async from 'async';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import * as babel from 'babel-core';
import {startsWith} from 'lodash/string';
import {hashNpmDependencyTree} from '../hash-npm-dependency-tree';
import {
  getAggressivelyCachedResolvedDependencies, getCachedResolvedDependencies, getCachedAst,
  getCachedDependencyIdentifiers
} from '../dependencies/cached_dependencies';
import {createMockCaches, createFileCaches} from '../tests/tracer_perf';

sourceMapSupport.install();

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');
const entryFile = path.join(sourceRoot, 'src', 'server-test', 'entry.js');

const tree = Object.create(null);
const files = Object.create(null);
const transformedFiles = Object.create(null);

const start = (new Date()).getTime();

function startServer() {
  var app = express();

  app.get('/', (req, res) => {
    const scripts = Object.keys(tree)
      .map(file => `<script src="/script?src=${file}"></script>`)
      .join('\n');

    res.end(`
      <html>
      <body>
        <script>
          var __modules = Object.create(null);
        </script>
        ${scripts}
        <script>
          (function() {
            var entry = ${JSON.stringify(entryFile)};

            var cache = Object.create(null);

            function executeModule(name) {
              var dependencies = __modules[name][0];
              var factory = __modules[name][1];

              var module = {
                exports: {}
              };

              cache[name] = module.exports;

              var require = buildRequire(name, dependencies);

              var process = {env: {}};

              factory.call(window, module, module.exports, require, process, window);

              return module.exports;
            }

            function buildRequire(name, dependencies) {
              var resolved = Object.create(null);

              dependencies.forEach(function(deps) {
                resolved[deps[0]] = deps[1];
              });

              return function require(identifier) {
                var depName = resolved[identifier];
                if (depName) {
                  if (!cache[depName]) {
                    cache[depName] = executeModule(depName);
                  }
                  return cache[depName];
                } else {
                  var msg = 'File "' + name + '". Unknown identifier "' + identifier + '". Dependencies ' + JSON.stringify(dependencies, null, 2);
                  throw new Error(msg);
                }
              };
            }

            executeModule(entry);
          })();
        </script>
      </body>
      </html>
    `);
  });

  app.get('/script', (req, res) => {
    const src = req.query.src;

    if (!tree[src]) {
      return res.status(404).send('Not found');
    }

    if (files[src]) {
      return res.end(files[src]);
    }

    if (transformedFiles[src]) {
      if (!files[src]) {
        files[src] = wrapCommonJSModule({file: src, dependencies: tree[src], code: transformedFiles[src]});
      }

      res.end(files[src]);
    } else {
      fs.readFile(src, 'utf8', (err, text) => {
        if (err) return res.status(500).send(`File: ${src}\n\n${err.stack}`);

        files[src] = wrapCommonJSModule({file: src, dependencies: tree[src], code: text});

        res.end(files[src]);
      });
    }
  });

  app.get('/tree', (req, res) => {
    res.json(tree);
  });

  app.listen(3000, () => {
    console.log('listening at http://127.0.0.1:3000');
  });
}

function wrapCommonJSModule({code, file, dependencies}) {
  dependencies = JSON.stringify(dependencies);
  return (
    `__modules[${JSON.stringify(file)}] = [${dependencies}, function(module, exports, require, process, global){\n` +
    code +
    '\n}];'
  );
}

function traceFile(file, tree, caches, cb) {
  tree[file] = [];

  function onTraceComplete(err) {
    if (err) {
      err.message = `Error in file: ${file}\n\n${err.message}`;
      return cb(err);
    }
    cb(null);
  }

  console.log(file)
  fs.stat(file, (err, stat) => {
    if (err) return cb(err);

    const key = file + stat.mtime.getTime();

    function getAst(cb) {
      if (startsWith(file, rootNodeModules)) {
        return getCachedAst({cache: caches.ast, key, file}, cb);
      }

      babel.transformFile(
        file,
        {
          plugins: [
            //'transform-object-rest-spread',
            //'transform-react-jsx',
            ['react-transform', {
              transforms: [{
                transform: 'react-transform-hmr',
                imports: ['react'],
                locals: ['module']
              }]
            }]
          ]
          //,
          //'presets': ['es2015']
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
        {cache: caches.dependencyIdentifiers, key, file, getAst},
        cb
      )
    }

    function onDepsResolved(err, resolved) {
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

    // If the file is within the root node_modules, we can aggressively
    // cache its resolved dependencies
    if (startsWith(file, rootNodeModules)) {
      getAggressivelyCachedResolvedDependencies(
        {cache: caches.resolvedDependencies, key, file, getDependencyIdentifiers},
        onDepsResolved
      );
    } else {
      getCachedResolvedDependencies(
        {cache: caches.resolvedDependencies, key, file, getDependencyIdentifiers},
        onDepsResolved
      );
    }
  });
}

hashNpmDependencyTree(process.cwd(), (err, hash) => {
  if (err) throw err;

  //const caches = createFileCaches(hash);
  const caches = createMockCaches();
  traceFile(entryFile, tree, caches, (err) => {
    if (err) throw err;
    const end = (new Date()).getTime() - start;
    console.log(`traced ${Object.keys(tree).length} records in ${end}ms`);
    startServer();
  });
});