import fs from 'fs';
import path from 'path';
import async from 'async';
import sourceMapSupport from 'source-map-support';
import express from 'express';
import {startsWith} from 'lodash/string';
import {hashNpmDependencyTree} from '../hash-npm-dependency-tree';
import {
  getAggressivelyCachedResolvedDependencies,
  getCachedResolvedDependencies
} from '../dependencies/cached_dependencies';
import {createMockCaches, createFileCaches} from '../tests/tracer_perf';

sourceMapSupport.install();

const sourceRoot = process.cwd();
const rootNodeModules = path.join(sourceRoot, 'node_modules');
const entryFile = path.join(sourceRoot, 'src', 'server-test', 'entry.js');

const tree = Object.create(null);
const files = Object.create(null);

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

    fs.readFile(src, 'utf8', (err, text) => {
      if (err) return res.status(500).send(`File: ${src}\n\n${err.stack}`);

      if (!startsWith(src, rootNodeModules)) {
        const babel = require('babel-core');
        const file = babel.transform(text, {
          plugins: [
            ['react-transform', {
              "transforms": [{
                "transform": "react-transform-hmr"
              }]
            }]
          ],
          "presets": [
            "es2015",
            "react"
          ]
        });
        text = file.code;
      }

      const dependencies = JSON.stringify(tree[src]);

      text = (
        `__modules[${JSON.stringify(src)}] = [${dependencies}, function(module, exports, require, process, global){\n` +
        text +
        '\n}];'
      );

      files[src] = text;

      return res.end(text);
    });
  });

  app.get('/tree', (req, res) => {
    res.json(tree);
  });

  app.listen(3000, () => {
    console.log('listening at http://127.0.0.1:3000');
  });
}

function traceFile(file, tree, caches, cb) {
  tree[file] = [];

  fs.stat(file, (err, stat) => {
    if (err) return cb(err);

    getResolvedDependencies(file, stat, caches, (err, resolved) => {
      if (err) {
        err.message = `File: ${file}\n\n${err.message}`;
        return cb(err);
      }

      tree[file] = resolved;

      const untracedFiles = [];

      resolved.forEach(dep => {
        const filename = dep[1];
        if (!tree[filename]) {
          untracedFiles.push(filename);
        }
      });

      if (untracedFiles.length) {
        untracedFiles.forEach(file => {
          tree[file] = {};
        });

        async.map(
          untracedFiles,
          (file, cb) => traceFile(file, tree, caches, cb),
          cb
        );
      } else {
        cb(null);
      }
    });
  });
}

function getResolvedDependencies(file, stat, caches, cb) {
  const key = file + stat.mtime.getTime();

  const options = {
    cache: caches.resolvedDependencies,
    astCache: caches.ast,
    dependencyIdentifierCache: caches.dependencyIdentifiers,
    key,
    file
  };

  // If the file is within the root node_modules, we can aggressively
  // cache its resolved dependencies
  if (startsWith(file, rootNodeModules)) {
    getAggressivelyCachedResolvedDependencies(options, cb);
  } else {
    getCachedResolvedDependencies(options, cb);
  }
}

hashNpmDependencyTree(process.cwd(), (err, hash) => {
  const caches = createFileCaches(hash);
  //const caches = createMockCaches();
  traceFile(entryFile, tree, caches, (err) => {
    if (err) throw err;
    const end = (new Date()).getTime() - start;
    console.log(`traced ${Object.keys(tree).length} records in ${end}ms`);
    startServer();
  });
});