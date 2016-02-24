import fs from 'fs';
import {assign} from 'lodash/object';
import {createRecordStore} from 'record-store';
import {createJobs} from '../jobs';
import {assert} from './assert';

describe('unfort/jobs', () => {
  describe('#createJobs', () => {
    it('should produce an object of named jobs', () => {
      const jobs = createJobs({});
      assert.isObject(jobs);
      assert.isFunction(jobs.ready);
    });
  });

  function createTestStore(overrides={}, state) {
    let jobs = createJobs({
      getState() {
        return state;
      }
    });
    jobs = assign(jobs, overrides);
    return createRecordStore(jobs);
  }

  describe('##ready', () => {
    it('should ', () => {
      // TODO
    });
  });
  describe('##basename', () => {
    it('should produce the basename of a record\'s path', () => {
      const store = createTestStore();
      const record = '/foo/bar.js';
      store.create(record);
      return assert.becomes(store.basename(record), 'bar');
    });
  });
  describe('##ext', () => {
    it('should produce the file extension of a record\'s path', () => {
      const store = createTestStore();
      const record = '/foo/bar.js';
      store.create(record);
      return assert.becomes(store.ext(record), '.js');
    });
  });
  describe('##isTextFile', () => {
    it('should indicate if the file is JS, CSS or JSON in type', () => {
      const store = createTestStore();
      store.create('test.js');
      store.create('test.json');
      store.create('test.css');
      return Promise.resolve()
        .then(() => assert.becomes(store.isTextFile('test.js'), true))
        .then(() => assert.becomes(store.isTextFile('test.json'), true))
        .then(() => assert.becomes(store.isTextFile('test.css'), true));
    });
  });
  describe('##mimeType', () => {
    it('should indicate the appropriate mime-type of a file', () => {
      const store = createTestStore();
      store.create('test.js');
      store.create('test.json');
      store.create('test.css');
      store.create('test.png');
      return Promise.resolve()
        .then(() => assert.becomes(store.mimeType('test.js'), 'application/javascript'))
        .then(() => assert.becomes(store.mimeType('test.json'), 'application/json'))
        .then(() => assert.becomes(store.mimeType('test.css'), 'text/css'))
        .then(() => assert.becomes(store.mimeType('test.png'), 'image/png'));
    });
  });
  describe('##readText', () => {
    it('should read the textual content of a record\'s file', () => {
      const store = createTestStore();
      store.create(__filename);
      return assert.becomes(
        store.readText(__filename),
        fs.readFileSync(__filename, 'utf8')
      );
    });
  });
  describe('##stat', () => {
    it('should produce a stat object of a record\'s file', () => {
      const store = createTestStore();
      store.create(__filename);
      return store.stat(__filename)
        .then(stat => {
          assert.isTrue(stat.isFile());
          assert.instanceOf(stat.atime, Date);
          assert.instanceOf(stat.ctime, Date);
          assert.instanceOf(stat.mtime, Date);
        });
    });
  });
  describe('##mtime', () => {
    it('should convert the mtime of `stat` to a number', () => {
      const date = new Date();
      const store = createTestStore({
        stat() {
          return {
            mtime: date
          };
        }
      });
      store.create('test');
      return assert.becomes(store.mtime('test'), date.getTime());
    });
  });
  describe('##hashText', () => {
    it('should convert the value of `getText` to a murmur hash', () => {
      const store = createTestStore({
        readText() {
          return 'hello';
        }
      });
      store.create('test');
      return assert.becomes(store.hashText('test'), '613153351');
    });
  });
  describe('##hash', () => {
    it('should return the value of `hashText`, for text files', () => {
      const store = createTestStore({
        isTextFile: () => true,
        hash: () => 'hello'
      });
      store.create('test');
      return assert.becomes(store.hash('test'), 'hello');
    });
    it('should return the value of `mtime` as a string, for non-text files', () => {
      const store = createTestStore({
        isTextFile: () => false,
        mtime: () => 1337
      });
      store.create('test');
      return assert.becomes(store.hash('test'), '1337');
    });
  });
  describe('##hashedFilename', () => {
    it('should generate a cache-busting filename from the `basename`, `hash` and `ext`', () => {
      const store = createTestStore({
        basename: () => '__basename__',
        hash: () => '__hash__',
        ext: () => '.__ext__'
      });
      store.create('test');
      return assert.becomes(store.hashedFilename('test'), '__basename__-__hash__.__ext__');
    });
  });
  describe('##hashedName', () => {
    it('should generate a cache-busting name from the `hashedFilename`', () => {
      const store = createTestStore({
        hashedFilename: () => 'woz-10.js'
      });
      store.create('/foo/bar/woz.js');
      return assert.becomes(store.hashedName('/foo/bar/woz.js'), '/foo/bar/woz-10.js');
    });
  });
  describe('##cache', () => {
    it('should return the `jobCache` state property', () => {
      const store = createTestStore({
        isTextFile: () => false,
        mtime: () => 1337
      }, {
        jobCache: 'cache test'
      });
      store.create('test');
      return assert.becomes(store.cache('test'), 'cache test');
    });
  });
  describe('##cacheKey', () => {
    it('should return an array containing the record\'s name, `hash`, and `mtime`, for text files', () => {
      const store = createTestStore({
        isTextFile: () => true,
        hash: () => 'test hash',
        mtime: () => 'test mtime'
      });
      store.create('test');
      return assert.becomes(
        store.cacheKey('test'),
        ['test', 'test mtime', 'test hash']
      );
    });
    it('should return an array containing the record\'s name and `mtime`, for non-text files', () => {
      const store = createTestStore({
        isTextFile: () => false,
        mtime: () => 'test mtime'
      });
      store.create('test');
      return assert.becomes(
        store.cacheKey('test'),
        ['test', 'test mtime']
      );
    });
  });
  describe('##readCache', () => {
    it('should read from the cache and produce any associated data available', () => {
      const store = createTestStore({
        cache: () => {
          return {
            get(key) {
              assert.equal(key, 'test key');
              return Promise.resolve('test cache data');
            }
          };
        },
        cacheKey: () => 'test key'
      });
      store.create('test');
      return assert.becomes(
        store.readCache('test'),
        'test cache data'
      );
    });
    it('should produce a new object, if the cache is empty (returns null)', () => {
      const store = createTestStore({
        cache: () => {
          return {
            get(key) {
              assert.equal(key, 'test key');
              return null;
            }
          };
        },
        cacheKey: () => 'test key'
      });
      store.create('test');
      return assert.becomes(
        store.readCache('test'),
        {}
      );
    });
  });
  describe('##writeCache', () => {
    it('should pass any data from `readCache` to the cache', () => {
      const store = createTestStore({
        cache: () => {
          return {
            set(key, data) {
              assert.equal(key, 'test key');
              assert.equal(data, 'test data');
              return Promise.resolve('test cache data');
            }
          };
        },
        cacheKey: () => 'test key',
        readCache: () => 'test data'
      });
      store.create('test');
      return assert.becomes(
        store.writeCache('test'),
        'test cache data'
      );
    });
  });
  describe('##url', () => {
    it('should produce a hashed url for text files', () => {
      const store = createTestStore({
        isTextFile: () => true,
        hashedName: () => '/foo/bar/woz-10.js'
      }, {
        sourceRoot: '/foo/',
        fileEndpoint: '/files/'
      });
      store.create('/foo/bar/woz.js');
      return assert.becomes(
        store.url('/foo/bar/woz.js'),
        '/files/bar/woz-10.js'
      );
    });
    it('should produce a relative url for non-text files', () => {
      const store = createTestStore({
        isTextFile: () => false
      }, {
        sourceRoot: '/foo/',
        fileEndpoint: '/files/'
      });
      store.create('/foo/bar/woz.png');
      return assert.becomes(
        store.url('/foo/bar/woz.png'),
        '/files/bar/woz.png'
      );
    });
  });
  describe('##sourceUrl', () => {
    it('should produce a url to the original content of a record', () => {
      const store = createTestStore({}, {
        sourceRoot: '/foo/',
        fileEndpoint: '/files/'
      });
      store.create('/foo/bar/woz.png');
      return assert.becomes(
        store.url('/foo/bar/woz.png'),
        '/files/bar/woz.png'
      );
    });
  });
  describe('##sourceMapUrl', () => {
    it('should produce a url to a record\'s source map', () => {
      const store = createTestStore({
        url: () => '/foo/bar.js'
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.sourceMapUrl('/foo/bar.js'),
        '/foo/bar.js.map'
      );
    });
  });
  describe('##sourceMapAnnotation', () => {
    it('should produce a source map annotation for css files', () => {
      const store = createTestStore({
        url: () => '/foo/bar.css',
        sourceMapUrl: () => '/foo/bar.css.map'
      });
      store.create('/foo/bar.css');
      return assert.becomes(
        store.sourceMapAnnotation('/foo/bar.css'),
        '\n/*# sourceMappingURL=/foo/bar.css.map */'
      );
    });
    it('should produce a source map annotation for js files', () => {
      const store = createTestStore({
        url: () => '/foo/bar.js',
        sourceMapUrl: () => '/foo/bar.js.map'
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.sourceMapAnnotation('/foo/bar.js'),
        '\n//# sourceMappingURL=/foo/bar.js.map'
      );
    });
    it('should produce a source map annotation for json files', () => {
      const store = createTestStore({
        url: () => '/foo/bar.json',
        sourceMapUrl: () => '/foo/bar.json.map'
      });
      store.create('/foo/bar.json');
      return assert.becomes(
        store.sourceMapAnnotation('/foo/bar.json'),
        '\n//# sourceMappingURL=/foo/bar.json.map'
      );
    });
    it('should produce null for files other than js, css or json', () => {
      const store = createTestStore({
        url: () => '/foo/bar.png',
        sourceMapUrl: () => null
      });
      store.create('/foo/bar.png');
      return assert.becomes(
        store.sourceMapAnnotation('/foo/bar.png'),
        null
      );
    });
  });
  describe('##postcssPlugins', () => {
    it('should return an empty array', () => {
      const store = createTestStore();
      store.create('test.css');
      return assert.becomes(
        store.postcssPlugins('test.css'),
        []
      );
    });
  });
  describe('##postcssTransformOptions', () => {
    it('should return the processing options that are passed to postcss', () => {
      const store = createTestStore({
        hashedName: () => '/foo/bar/test-123.css'
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/bar/test.css');
      return assert.becomes(
        store.postcssTransformOptions('/foo/bar/test.css'),
        {
          from: 'bar/test.css',
          to: 'bar/test-123.css',
          map: {
            inline: false,
            annotation: false
          }
        }
      );
    });
  });
  describe('##postcssTransform', () => {
    it('should produce a postcss result from a css file', () => {
      const store = createTestStore({
        readText: () => 'color: blue;'
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.css');
      return store.postcssTransform('/foo/test.css')
        .then(result => {
          assert.equal(result.css, 'color: blue;');
          assert.isObject(result.map);
        });
    });
    // TODO: test deps are discovered
    // TODO: test imports are removed
    // TODO: test plugins
  });
  describe('##shouldBabelTransfrom', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelTransformOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelTransform', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelGeneratorOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelGenerator', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelFile', () => {
    it('should ', () => {
      
    });
  });
  describe('##babelAst', () => {
    it('should ', () => {
      
    });
  });
  describe('##babylonAst', () => {
    it('should ', () => {
      
    });
  });
  describe('##ast', () => {
    it('should ', () => {
      
    });
  });
  describe('##analyzeDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##dependencyIdentifiers', () => {
    it('should ', () => {
      
    });
  });
  describe('##packageDependencyIdentifiers', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolver', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolverOptions', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolvePathDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolvePackageDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##resolvedDependencies', () => {
    it('should ', () => {
      
    });
  });
  describe('##code', () => {
    it('should ', () => {
      
    });
  });
  describe('##sourceMap', () => {
    it('should ', () => {

    });
  });
});