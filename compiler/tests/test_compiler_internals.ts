import test from 'ava';
import { Subject } from 'rxjs';
import { Compiler } from '../compiler';
import { createPrepopulatedFileSystemCache, handleCompilerErrors } from './utils';

test('should produce urls to the output of the assets', (t) => {
  const files = {
    '/foo/index.html': '<link rel="stylesheet" href="../woz/styles.css"><script src="./bar/script.js">',
    '/foo/bar/script.js': 'console.log("test");',
    '/woz/styles.css': 'body { color: blue; }',
  };
  const compiler = new Compiler();
  compiler.rootDirectory = '/foo';
  compiler.fileSystemCache = createPrepopulatedFileSystemCache(files);
  compiler.addEntryPoint('/foo/index.html');
  compiler.startCompilation();
  compiler.error.subscribe(obj => {
    console.error(obj.description);
    return Promise.reject(obj.error);
  });
  const obs = new Subject();
  handleCompilerErrors(compiler, obs);
  compiler.complete.subscribe(data => {
    const htmlFile = data.files.get('/foo/index.html');
    const jsFile = data.files.get('/foo/bar/script.js');
    const cssFile = data.files.get('/woz/styles.css');
    return Promise.all([
      compiler.getFileOutputUrl(htmlFile),
      compiler.getFileOutputUrl(jsFile),
      compiler.getFileOutputUrl(cssFile)
    ])
      .then(data => {
        const expected = [
          '/index-2544882799.html',
          '/bar/script-3331586148.js',
          '/woz/styles-3306346382.css'
        ];
        t.deepEqual(data, expected);
        obs.complete();
      });
  });
  return obs;
});