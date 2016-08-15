import {Buffer} from 'buffer';
import test from 'ava';
import {Subject} from 'rxjs';
import * as imm from 'immutable';
import {FileSystemCache} from '../../file_system';
import {createNodesFromNotation} from '../../cyclic_dependency_graph';
import {Compiler} from '../compiler';

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

test('should produce a dependency graph of multiple file types that link to one another', (t) => {
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
  const compiler = new Compiler();
  compiler.fileSystemCache = createPrepopulatedFileSystemCache(files);
  compiler.addEntryPoint('/foo/index.html');
  compiler.startCompilation();
  const obs = new Subject<any>();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    obs.error(obj.error);
  });
  compiler.graph.complete.subscribe(data => {
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

test('should compile JS files into the expected format', (t) => {
  const files = {
    '/foo/file1.js': 'import {two} from "./file2.js";      console.log(two)',
    '/foo/file2.js': 'export const two = 2'
  };
  const compiler = new Compiler();
  compiler.fileSystemCache = createPrepopulatedFileSystemCache(files);
  compiler.addEntryPoint('/foo/file1.js');
  compiler.startCompilation();
  const obs = new Subject<any>();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    obs.error(obj.error);
  });
  compiler.complete.subscribe(data => {
    const built1 = data.built.get('/foo/file1.js');
    const built2 = data.built.get('/foo/file2.js');
    t.is(built1.content, 'import { two } from "./file2.js";console.log(two);');
    t.is(built2.content, 'export const two = 2;');
    obs.complete();
  });
  return obs;
});

test('should compile CSS files into the expected format', (t) => {
  const files = {
    '/foo/file1.css': '@import url("./file2.css");      body { color: blue; }',
    '/foo/file2.css': 'body { font-size: 28px; }'
  };
  const compiler = new Compiler();
  compiler.fileSystemCache = createPrepopulatedFileSystemCache(files);
  compiler.addEntryPoint('/foo/file1.css');
  compiler.startCompilation();
  const obs = new Subject<any>();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    obs.error(obj.error);
  });
  compiler.complete.subscribe(data => {
    const built1 = data.built.get('/foo/file1.css');
    const built2 = data.built.get('/foo/file2.css');
    t.is(built1.content, 'body { color: blue; }');
    t.is(built2.content, 'body { font-size: 28px; }');
    obs.complete();
  });
  return obs;
});

test('should compile html files into the expected format', (t) => {
  const files = {
    '/foo/file1.html': '<script src="./file2.js"></script>',
    '/foo/file2.js': 'console.log("hello");'
  };
  const compiler = new Compiler();
  compiler.fileSystemCache = createPrepopulatedFileSystemCache(files);
  compiler.addEntryPoint('/foo/file1.html');
  compiler.startCompilation();
  const obs = new Subject<any>();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    obs.error(obj.error);
  });
  compiler.complete.subscribe(data => {
    const builtHtml = data.built.get('/foo/file1.html');
    const expected = '<html><head><script src=\"/foo/file2-2938366898.js"></script></head><body></body></html>';
    t.is(builtHtml.content, expected);
    obs.complete();
  });
  return obs;
});
