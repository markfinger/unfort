"use strict";

const path = require('path');
const fs = require('fs');
const {Buffer} = require('buffer');
const test = require('ava');
const rx = require('rxjs');
const {FileSystemCache} = require('../../file_system');
const {createNodesFromNotation} = require('../../cyclic_dependency_graph');
const {Compiler} = require('../compiler');

function createPrepopulatedFileSystemCache(files) {
  const cache = new FileSystemCache();
  for (const path of Object.keys(files)) {
    const file = cache._createFile(path);
    file.setIsFile(true);
    file.setModifiedTime(-Infinity);
    file.setText(files[path]);
    file.setBuffer(new Buffer(files[path]));
  }
  return cache;
}

test('TODO', (t) => {
  const files = {
    '/foo/index.html': '<script src="./script.js">',
    '/foo/script.js': 'import "./styles.css";',
    '/foo/styles.css': 'body { background-image: url(./image.png); }',
    '/foo/image.png': ''
  };
  const fileSystemCache = createPrepopulatedFileSystemCache(files);
  const compiler = new Compiler({
    fileSystemCache
  });
  t.is(compiler.fileSystemCache, fileSystemCache);
  compiler.addEntryPoint('/foo/index.html');
  compiler.compile();
  const obs = new rx.Subject();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    obs.error(obj.error);
  });
  compiler.complete.subscribe(data => {
    const expected = createNodesFromNotation(`
      /foo/index.html -> /foo/script.js
      /foo/script.js -> /foo/styles.css
      /foo/styles.css -> /foo/image.png
    `);
    t.deepEqual(data.graph.toJS(), expected.toJS());
    obs.complete();
  });
  return obs;
});
