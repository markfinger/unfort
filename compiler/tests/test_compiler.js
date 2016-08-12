"use strict";

const {Buffer} = require('buffer');
const test = require('ava');
const rx = require('rxjs');
const imm = require('immutable');
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

test('Should produce a dependency graph of multiple file types that link to one another', (t) => {
  const files = {
    '/foo/index.html': '<script src="./script1.js">',
    '/foo/script1.js': `
      import "./data1.json";
      import "./styles1.css";
      import "./script2.js";
    `,
    '/foo/script2.js': `
      import "./data2.json";
      import "./styles2.css";
    `,
    '/foo/styles1.css': `
      @import url('./styles2.css');
      body { background-image: url(./image.png); }
    `,
    '/foo/styles2.css': 'div { background-image: url(./image.png); }',
    '/foo/data1.json': '{}',
    '/foo/data2.json': '{}',
    '/foo/image.png': ''
  };
  const fileSystemCache = createPrepopulatedFileSystemCache(files);
  const compiler = new Compiler({
    fileSystemCache
  });
  compiler.addEntryPoint('/foo/index.html');
  compiler.compile();
  const obs = new rx.Subject();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    obs.error(obj.error);
  });
  compiler.complete.subscribe(data => {
    const expected = createNodesFromNotation(`
      /foo/index.html -> /foo/script1.js
      /foo/script1.js -> /foo/data1.json
      /foo/script1.js -> /foo/styles1.css
      /foo/script1.js -> /foo/script2.js
      /foo/script2.js -> /foo/data2.json
      /foo/script2.js -> /foo/styles2.css
      /foo/styles1.css -> /foo/styles2.css
      /foo/styles1.css -> /foo/image.png
      /foo/styles2.css -> /foo/image.png
    `);
    t.truthy(imm.is(expected, data.graph));
    obs.complete();
  });
  return obs;
});
