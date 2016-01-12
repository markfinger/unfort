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
const runtimeFile = require.resolve('./runtime');

const tree = Object.create(null);
const files = Object.create(null);
const transformedFiles = Object.create(null);

const start = (new Date()).getTime();

function startServer() {
  var app = express();

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
          __modules.executeModule(${JSON.stringify(entryFile)});
        </script>
      </body>
      </html>
    `);
  });

  app.get('/*', (req, res) => {
    const file = req.path;
    console.log(file);
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

  app.listen(3000, () => {
    console.log('listening at http://127.0.0.1:3000');
  });
}

function wrapCommonJSModule({code, file, dependencies}) {
  return (
    `__modules.addModule(${JSON.stringify(file)}, ${JSON.stringify(dependencies)}, function(module, exports, require, process, global){\n` +
    code +
    '\n});'
  );
}

function traceFile(file, tree, caches, cb) {
  console.log(`Tracing: ${file.split(sourceRoot)[1]}`);

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

    function getAst(cb) {
      if (startsWith(file, rootNodeModules) || file === runtimeFile) {
        return getCachedAst({cache: caches.ast, key, file}, cb);
      }

      babel.transformFile(
        file,
        {
          plugins: [
            //'transform-object-rest-spread',
            //'transform-react-jsx',
            //['react-transform', {
            //  transforms: [{
            //    transform: 'react-transform-hmr',
            //    imports: ['react'],
            //    locals: ['module']
            //  }]
            //}]
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

  const caches = createMockCaches();
  async.parallel([
    (cb) => traceFile(runtimeFile, tree, caches, cb),
    (cb) => traceFile(entryFile, tree, caches, cb)
  ], (err) => {
    if (err) throw err;
    const end = (new Date()).getTime() - start;
    console.log(`traced ${Object.keys(tree).length} records in ${end}ms`);
    startServer();
  });
});