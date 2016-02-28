import fs from 'fs';
import {assign} from 'lodash/object';
import {createRecordStore} from 'record-store';
import postcss from 'postcss';
import {createMockCache} from 'kv-cache';
import * as babylon from 'babylon';
import * as babel from 'babel-core';
import browserifyBuiltins from 'browserify/lib/builtins';
import {createJobs} from '../jobs';
import {createJSModuleDefinition} from '../utils';
import {assert} from './assert';

describe('unfort/jobs', () => {
  describe('#createJobs', () => {
    it('should produce an object of named jobs', () => {
      const jobs = createJobs({});
      assert.isObject(jobs);
      assert.isFunction(jobs.ready);
    });
  });

  function createTestStore(overrides={}, state={}) {
    let jobs = createJobs({
      getState() {
        return state;
      }
    });
    jobs = assign(jobs, overrides);
    return createRecordStore(jobs);
  }

  describe('##ready', () => {
    it('should trigger evaluation of the data set required for the record', () => {
      // TODO check the codebase and see if these are still needed
      const store = createTestStore({
        hash: () => 'test hash',
        code: () => 'test code',
        url: () => 'test url',
        sourceMap: () => 'test source map',
        sourceMapUrl: () => 'test source url',
        sourceMapAnnotation: () => 'test source annotation',
        hashedFilename: () => 'test hashed filename',
        isTextFile: () => 'test is text file',
        mimeType: () => 'test mime type'
      });
      store.create('test.js');
      return store.ready('test.js')
        .then(() => {
          const record = store.get('test.js');
          const expected = {
            hash: 'test hash',
            code: 'test code',
            url: 'test url',
            sourceMap: 'test source map',
            sourceMapUrl: 'test source url',
            sourceMapAnnotation: 'test source annotation',
            hashedFilename: 'test hashed filename',
            isTextFile: 'test is text file',
            mimeType: 'test mime type'
          };
          for (let key in expected) {
            if (expected.hasOwnProperty(key)) {
              assert.equal(record.data[key], expected[key]);
            }
          }
        });
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
    it('should indicate true if the file is JS, CSS or JSON in type', () => {
      const store = createTestStore();
      store.create('test.js');
      store.create('test.json');
      store.create('test.css');
      return Promise.resolve()
        .then(() => assert.becomes(store.isTextFile('test.js'), true))
        .then(() => assert.becomes(store.isTextFile('test.json'), true))
        .then(() => assert.becomes(store.isTextFile('test.css'), true));
    });
    it('should indicate false for other file types', () => {
      const store = createTestStore();
      store.create('test');
      store.create('test.png');
      store.create('test.yaml');
      return Promise.resolve()
        .then(() => assert.becomes(store.isTextFile('test'), false))
        .then(() => assert.becomes(store.isTextFile('test.png'), false))
        .then(() => assert.becomes(store.isTextFile('test.yaml'), false));
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
    it('should fallback to null', () => {
      const store = createTestStore();
      store.create('test');
      return assert.becomes(store.mimeType('test'), null);
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
    it('should indicate dependencies via a `unfortDependencies` properties', () => {
      const store = createTestStore({
        readText: () => `
          @import url('./foo/bar.css');
          body {
            background-image: url('./foo/bar.png');
          }
        `
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.css');
      return store.postcssTransform('/foo/test.css')
        .then(result => {
          assert.deepEqual(
            result.unfortDependencies,
            [
              {source: './foo/bar.css'},
              {source: './foo/bar.png'}
            ]
          );
        });
    });
    it('should remove @import rules from the code', () => {
      const store = createTestStore({
        readText: () => '@import url("./foo/bar.css"); body { color: blue; }'
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.css');
      return store.postcssTransform('/foo/test.css')
        .then(result => {
          assert.equal(result.css, 'body { color: blue; }');
        });
    });
    it('should apply plugins provided by `postcssPlugins`', () => {
      const store = createTestStore({
        readText: () => '',
        postcssPlugins: () => [
          postcss.plugin('test-plugin', () => {
            return (root, result) => {
              result.unfortTestPlugin = 'test';
            };
          })
        ]
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.css');
      return store.postcssTransform('/foo/test.css')
        .then(result => {
          assert.equal(result.unfortTestPlugin, 'test');
        });
    });
  });
  describe('##babelTransformOptions', () => {
    it('should generate appropriate options for babel transformation', () => {
      const store = createTestStore({
        url: () => 'test url',
        sourceUrl: () => 'test source url'
      });
      store.create('test.js');
      return assert.becomes(
        store.babelTransformOptions('test.js'),
        {
          filename: 'test.js',
          sourceType: 'module',
          sourceMaps: true,
          sourceMapTarget: 'test url',
          sourceFileName: 'test source url',
          babelrc: false
        }
      );
    });
  });
  describe('##babelTransform', () => {
    it('should generate a babel file object', () => {
      const store = createTestStore({
        readText: () => 'const test = "test";',
        babelTransformOptions: () => ({
          ast: false
        })
      });
      store.create('test.js');
      return store.babelTransform('test.js')
        .then(file => {
          assert.isObject(file);
          assert.equal(file.code, 'const test = "test";');
          // Assert that it respects the `babelTransformOptions` above
          assert.isNull(file.ast);
        });
    });
    it('should respect `babelTransformOptions`', () => {
      const store = createTestStore({
        readText: () => 'const test = "test";',
        babelTransformOptions: () => ({
          ast: true
        })
      });
      store.create('test.js');
      return store.babelTransform('test.js')
        .then(file => {
          assert.isObject(file);
          assert.equal(file.code, 'const test = "test";');
          assert.isObject(file.ast);
        });
    });
  });
  describe('##babelGeneratorOptions', () => {
    it('should generate appropriate options', () => {
      const store = createTestStore({
        url: () => 'test url',
        sourceUrl: () => 'test source url'
      }, {
        vendorRoot: '/vendor_root'
      });
      store.create('test.js');
      return assert.becomes(
        store.babelGeneratorOptions('test.js'),
        {
          sourceMaps: true,
          sourceMapTarget: 'test url',
          sourceFileName: 'test source url',
          minified: false
        }
      );
    });
    it('should set `minified` to true, if the file lives in `vendorRoot`', () => {
      const store = createTestStore({
        url: () => 'test url',
        sourceUrl: () => 'test source url'
      }, {
        vendorRoot: '/vendor_root'
      });
      store.create('/vendor_root/test.js');
      return assert.becomes(
        store.babelGeneratorOptions('/vendor_root/test.js'),
        {
          sourceMaps: true,
          sourceMapTarget: 'test url',
          sourceFileName: 'test source url',
          minified: true
        }
      );
    });
  });
  describe('##babelGenerator', () => {
    it('should return a babel file', () => {
      const store = createTestStore({
        readText: () => 'const foo = "foo";'
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.js');
      return store.babelGenerator('/foo/test.js')
        .then(file => {
          assert.isObject(file);
          assert.equal(file.code, 'const foo = "foo";');
          assert.isObject(file.map);
        });
    });
    it('should respect babelGeneratorOptions', () => {
      const store = createTestStore({
        readText: () => 'const foo = "foo";',
        babelGeneratorOptions: () => {
          return {sourceMaps: false};
        }
      }, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.js');
      return store.babelGenerator('/foo/test.js')
        .then(file => {
          assert.isObject(file);
          assert.equal(file.code, 'const foo = "foo";');
          assert.isNull(file.map);
        });
    });
  });
  describe('##shouldBabelTransform', () => {
    it('should indicate true if a file lives in source root', () => {
      const store = createTestStore({}, {
        sourceRoot: '/foo'
      });
      store.create('/foo/test.js');
      return assert.becomes(store.shouldBabelTransform('/foo/test.js'), true);
    });
    it('should indicate false if a file lives in root node_modules', () => {
      const store = createTestStore({}, {
        rootNodeModules: '/foo'
      });
      store.create('/foo/test.js');
      return assert.becomes(store.shouldBabelTransform('/foo/test.js'), false);
    });
    it('should indicate false if a file lives in the vendor root', () => {
      const store = createTestStore({}, {
        vendorRoot: '/foo'
      });
      store.create('/foo/test.js');
      return assert.becomes(store.shouldBabelTransform('/foo/test.js'), false);
    });
  });
  describe('##babelFile', () => {
    it('should call `babelTransform` if `shouldBabelTransform` returns true', () => {
      const store = createTestStore({
        shouldBabelTransform: () => true,
        babelTransform: () => 'test babel transform',
        babelGenerator: () => 'test babel generator'
      });
      store.create('test.js');
      return assert.becomes(store.babelFile('test.js'), 'test babel transform');
    });
    it('should call `babelGenerator` if `shouldBabelTransform` returns false', () => {
      const store = createTestStore({
        shouldBabelTransform: () => false,
        babelTransform: () => 'test babel transform',
        babelGenerator: () => 'test babel generator'
      });
      store.create('test.js');
      return assert.becomes(store.babelFile('test.js'), 'test babel generator');
    });
  });
  describe('##babelAst', () => {
    it('should return the `ast` property of `babelTransform`', () => {
      const store = createTestStore({
        babelTransform: () => {
          return {
            ast: 'test ast'
          }
        }
      });
      store.create('test.js');
      return assert.becomes(store.babelAst('test.js'), 'test ast');
    });
  });
  describe('##babylonAst', () => {
    it('should generate a babylon AST from the record\'s text', () => {
      const store = createTestStore({
        readText: () => 'const foo = "foo";'
      });
      store.create('test.js');
      return assert.becomes(
        store.babylonAst('test.js'),
        babylon.parse('const foo = "foo";', {
          sourceType: 'script'
        })
      );
    });
  });
  describe('##ast', () => {
    it('should return the babel file\'s AST for JS files that are transformed', () => {
      const store = createTestStore({
        shouldBabelTransform: () => true,
        babelAst: () => 'test babel ast'
      });
      store.create('test.js');
      return assert.becomes(store.ast('test.js'), 'test babel ast');
    });
    it('should return a babylon AST for JS files that are not babel transformed', () => {
      const store = createTestStore({
        shouldBabelTransform: () => false,
        babylonAst: () => 'test babylon ast'
      });
      store.create('test.js');
      return assert.becomes(store.ast('test.js'), 'test babylon ast');
    });
    it('should reject for non-JS files', () => {
      const store = createTestStore();
      store.create('test.css');
      return assert.isRejected(
        store.ast('test.css'),
        /Unknown extension ".css", cannot parse "test.css"/
      );
    });
  });
  describe('##analyzeDependencies', () => {
    it('should return a css file\'s `unfortDependencies` property generated during the `postcssTransform` job', () => {
      const store = createTestStore({
        postcssTransform: () => {
          return {
            unfortDependencies: 'test analyze dependencies'
          }
        }
      });
      store.create('test.css');
      return assert.becomes(store.analyzeDependencies('test.css'), 'test analyze dependencies');
    });
    it('should traverse a js file\'s ast and find the identifiers', () => {
      const store = createTestStore({
        ast: () => {
          return babylon.parse(
            'import "./foo"; require("bar"); export * from "woz.js"',
            {sourceType: 'module'}
          )
        }
      });
      store.create('test.js');
      return assert.becomes(
        store.analyzeDependencies('test.js'),
        [
          {source: './foo'},
          {source: 'bar'},
          {source: 'woz.js'}
        ]
      );
    });
    it('should return an empty array for json files', () => {
      const store = createTestStore();
      store.create('test.json');
      return assert.becomes(store.analyzeDependencies('test.json'), []);
    });
    it('should return an empty array for non-text files', () => {
      const store = createTestStore();
      store.create('test.png');
      return assert.becomes(store.analyzeDependencies('test.png'), []);
    });
  });
  describe('##dependencyIdentifiers', () => {
    it('should pluck the `source` prop from analyzed dependencies', () => {
      const store = createTestStore({
        readCache: () => ({}),
        analyzeDependencies: () => [{source: 'foo'}, {source: 'bar'}]
      });
      store.create('test.js');
      return assert.becomes(
        store.dependencyIdentifiers('test.js'),
        ['foo', 'bar']
      );
    });
    it('should return the `dependencyIdentifiers` prop of the cached data', () => {
      const store = createTestStore({
        readCache: () => ({dependencyIdentifiers: 'test read cache'})
      });
      store.create('test.js');
      return assert.becomes(
        store.dependencyIdentifiers('test.js'),
        'test read cache'
      );
    });
    it('should set the `dependencyIdentifiers` value of the cached data', () => {
      const store = createTestStore({
        readCache: () => ({}),
        analyzeDependencies: () => [{source: 'foo'}, {source: 'bar'}]
      });
      store.create('test.js');
      return store.dependencyIdentifiers('test.js')
        .then(() => assert.becomes(
          store.readCache('test.js'),
          {dependencyIdentifiers: ['foo', 'bar']}
        ));
    });
  });
  describe('##pathDependencyIdentifiers', () => {
    it('should return the dependency identifiers that indicate relative or absolute paths', () => {
      const store = createTestStore({
        dependencyIdentifiers: () => ['foo', './bar', '/woo.js']
      });
      store.create('test.js');
      return store.dependencyIdentifiers('test.js')
        .then(() => assert.becomes(
          store.pathDependencyIdentifiers('test.js'),
          ['./bar', '/woo.js']
        ));
    });
  });
  describe('##packageDependencyIdentifiers', () => {
    it('should return the dependency identifiers that packages', () => {
      const store = createTestStore({
        dependencyIdentifiers: () => ['foo', './bar', '/woo.js']
      });
      store.create('test.js');
      return store.dependencyIdentifiers('test.js')
        .then(() => assert.becomes(
          store.packageDependencyIdentifiers('test.js'),
          ['foo']
        ));
    });
  });
  describe('##resolver', () => {
    it('should return a function that accepts an id and maps it to a file', () => {
      const store = createTestStore();
      store.create(__filename);
      return store.resolver(__filename)
        .then(resolver => {
          assert.isFunction(resolver);
          return assert.becomes(
            resolver('lodash'),
            require.resolve('lodash')
          );
        });
    });
  });
  describe('##resolverOptions', () => {
    it('should generate the resolvers options for a particular record', () => {
      const store = createTestStore();
      store.create('/foo/bar.js');
      assert.becomes(
        store.resolverOptions('/foo/bar.js'),
        {
          basedir: '/foo',
          extensions: ['.js', '.json'],
          modules: require('browserify/lib/builtins')
        }
      );
    });
  });
  describe('##resolvePathDependencies', () => {
    it('should pass all path dependencies through the resolver', () => {
      const idsPassed = [];
      const store = createTestStore({
        resolver: () => id => idsPassed.push(id),
        pathDependencyIdentifiers: () => ['./foo', '/bar.js']
      });
      store.create('/foo/bar.js');
      return store.resolvePathDependencies('/foo/bar.js')
        .then(() => {
          assert.deepEqual(idsPassed, ['./foo', '/bar.js']);
        });
    });
    it('should return an object mapping identifiers to resolved files', () => {
      const store = createTestStore({
        resolver: () => id => id + ' test',
        pathDependencyIdentifiers: () => ['./foo', '/bar.js']
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.resolvePathDependencies('/foo/bar.js'),
        {
          './foo': './foo test',
          '/bar.js': '/bar.js test'
        }
      );
    });
  });
  describe('##resolvePackageDependencies', () => {
    it('should pass all package dependencies through the resolver', () => {
      const idsPassed = [];
      const store = createTestStore({
        resolver: () => id => idsPassed.push(id),
        packageDependencyIdentifiers: () => ['foo', 'bar']
      });
      store.create('/foo/bar.js');
      return store.resolvePackageDependencies('/foo/bar.js')
        .then(() => {
          assert.deepEqual(idsPassed, ['foo', 'bar']);
        });
    });
    it('should return an object mapping identifiers to resolved files', () => {
      const store = createTestStore({
        resolver: () => id => id + ' test',
        packageDependencyIdentifiers: () => ['foo', 'bar']
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.resolvePackageDependencies('/foo/bar.js'),
        {
          'foo': 'foo test',
          'bar': 'bar test'
        }
      );
    });
  });
  describe('##shouldCacheResolvedPathDependencies', () => {
    it('should return true if the file lives in rootNodeModules', () => {
      const store = createTestStore({}, {
        rootNodeModules: '/foo'
      });
      store.create('/foo/bar.js');
      return assert.becomes(store.shouldCacheResolvedPathDependencies('/foo/bar.js'), true);
    });
    it('should return false if the file lives in rootNodeModules', () => {
      const store = createTestStore({}, {
        rootNodeModules: '/foo'
      });
      store.create('/bar/woz.js');
      return assert.becomes(store.shouldCacheResolvedPathDependencies('/bar/woz.js'), false);
    });
  });
  describe('##resolvedDependencies', () => {
    it('should return merge the returns of `resolvePathDependencies` and `resolvePackageDependencies`', () => {
      const store = createTestStore({
        readCache: () => ({}),
        shouldCacheResolvedPathDependencies: () => true,
        resolvePathDependencies: () => ({'./foo': '/foo/foo.js'}),
        resolvePackageDependencies: () => ({bar: '/foo/node_modules/bar/index.js'})
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.resolvedDependencies('/foo/bar.js'),
        {
          './foo': '/foo/foo.js',
          bar: '/foo/node_modules/bar/index.js'
        }
      );
    });
    it('should cause path dependencies to be cached if shouldCacheResolvedPathDependencies returns false', () => {
      const store = createTestStore({
        readCache: () => ({}),
        shouldCacheResolvedPathDependencies: () => true,
        resolvePathDependencies: () => ({'./foo': '/foo/foo.js'}),
        resolvePackageDependencies: () => ({bar: '/foo/node_modules/bar/index.js'})
      });
      store.create('/foo/bar.js');
      return store.resolvedDependencies('/foo/bar.js')
        .then(() => store.readCache('/foo/bar.js')
          .then(cachedData => {
            assert.deepEqual(
              cachedData.resolvedDependencies,
              {
                './foo': '/foo/foo.js',
                bar: '/foo/node_modules/bar/index.js'
              }
            );
          }));
    });
    it('should not cause path dependencies to be cached if shouldCacheResolvedPathDependencies returns false', () => {
      const store = createTestStore({
        readCache: () => ({}),
        shouldCacheResolvedPathDependencies: () => false,
        resolvePathDependencies: () => ({'./foo': '/foo/foo.js'}),
        resolvePackageDependencies: () => ({bar: '/foo/node_modules/bar/index.js'})
      });
      store.create('/foo/bar.js');
      return store.resolvedDependencies('/foo/bar.js')
        .then(() => store.readCache('/foo/bar.js')
          .then(cachedData => {
            assert.deepEqual(
              cachedData.resolvedDependencies,
              {bar: '/foo/node_modules/bar/index.js'}
            );
          }));
    });
    it('should return cached data if available and shouldCacheResolvedPathDependencies returns true', () => {
      const store = createTestStore({
        readCache: () => ({resolvedDependencies: 'test cache'}),
        shouldCacheResolvedPathDependencies: () => true
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.resolvedDependencies('/foo/bar.js'),
        'test cache'
      );
    });
    it('should return cached data for package dependencies if available and shouldCacheResolvedPathDependencies returns false', () => {
      const store = createTestStore({
        readCache: () => ({resolvedDependencies: {bar: 'test'}}),
        shouldCacheResolvedPathDependencies: () => false,
        resolvePathDependencies: () => ({'./foo': '/foo/foo.js'})
      });
      store.create('/foo/bar.js');
      return assert.becomes(
        store.resolvedDependencies('/foo/bar.js'),
        {
          './foo': '/foo/foo.js',
          bar: 'test'
        }
      );
    });
  });
  describe('##code', () => {
    it('should return null for non-text files', () => {
      const store = createTestStore({
        isTextFile: () => false
      });
      store.create('test.png');
      return assert.becomes(store.code('test.png'), null);
    });
    it('should return cached data if available', () => {
      const store = createTestStore({
        readCache: () => ({code: 'test cache'})
      });
      store.create('test.js');
      return assert.becomes(store.code('test.js'), 'test cache');
    });
    it('should return the `css` property of `postcssTransform` for .css files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        postcssTransform: () => ({css: 'test css'})
      });
      store.create('test.css');
      return assert.becomes(store.code('test.css'), 'test css');
    });
    it('should update the cached for .css files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        postcssTransform: () => ({css: 'test css'})
      });
      store.create('test.css');
      return store.code('test.css')
        .then(() => assert.becomes(store.readCache('test.css'), {code: 'test css'}));
    });
    it('should return the raw text of the bootstrapRuntime file', () => {
      const store = createTestStore({
        readText: () => 'text test',
        readCache: () => ({})
      }, {
        bootstrapRuntime: 'bootstrap.js'
      });
      store.create('bootstrap.js');
      return assert.becomes(store.code('bootstrap.js'), 'text test');
    });
    it('should generate a module definition from the `babelFile` code generated for js files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        babelFile: () => babel.transform('const foo = "test";'),
        resolvedDependencies: () => ({foo: './foo.js'}),
        hash: () => 'test hash'
      });
      store.create('test.js');

      return assert.becomes(
        store.code('test.js'),
        createJSModuleDefinition({
          name: 'test.js',
          deps: {foo: './foo.js'},
          hash: 'test hash',
          code: 'const foo = "test";'
        })
      );
    });
    it('should annotate the cached data object with the generated code for js files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        babelFile: () => babel.transform('const foo = "test";'),
        resolvedDependencies: () => ({foo: './foo.js'}),
        hash: () => 'test hash'
      });
      store.create('test.js');

      return store.code('test.js')
        .then(code => store.readCache('test.js')
          .then(data => {
            assert.equal(data.code, code);
          })
        );
    });
    it('should generate a module definition for json files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        readText: () => 'test text',
        hash: () => 'test hash'
      });
      store.create('test.json');

      return assert.becomes(
        store.code('test.json'),
        createJSModuleDefinition({
          name: 'test.json',
          deps: {},
          hash: 'test hash',
          code: [
            'var json = test text',
            'exports.default = json;',
            'exports.__esModule = true;',
            'if (module.hot) {',
            '  module.hot.accept();',
            '}'
          ].join('\n')
        })
      );
    });
    it('should annotate the cached data object with the generated code for json files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        readText: () => 'test text',
        hash: () => 'test hash'
      });
      store.create('test.json');

      return store.code('test.json')
        .then(code => store.readCache('test.json')
          .then(data => {
            assert.equal(data.code, code);
          })
        );
    });
    it('should reject job for unknown text file extensions', () => {
      const store = createTestStore({
        readCache: () => ({}),
        isTextFile: () => true
      });
      store.create('test.png');

      return assert.isRejected(
        store.code('test.png'),
        /Unknown text file extension: \.png\. Cannot generate code for file: test\.png/
      );
    });
  });
  describe('##sourceMap', () => {
    it('should return null for non-text files', () => {
      const store = createTestStore({
        isTextFile: () => false
      });
      store.create('test.png');
      return assert.becomes(store.sourceMap('test.png'), null);
    });
    it('should return cached data if available', () => {
      const store = createTestStore({
        readCache: () => ({sourceMap: 'test cache'})
      });
      store.create('test.js');
      return assert.becomes(store.sourceMap('test.js'), 'test cache');
    });
    it('should return the stringified `map` property of `postcssTransform` for .css files', () => {
      const store = createTestStore({
        readCache: () => ({}),
        postcssTransform: () => ({map: {toString: () => 'test map'}})
      });
      store.create('test.css');
      return assert.becomes(store.sourceMap('test.css'), 'test map');
    });
    it('should apply a .css file\'s source map to the cache object', () => {
      const store = createTestStore({
        readCache: () => ({}),
        postcssTransform: () => ({map: {toString: () => 'test map'}})
      });
      store.create('test.css');
      return store.sourceMap('test.css')
        .then(sourceMap => store.readCache('test.css')
          .then(data => assert.equal(data.sourceMap, sourceMap))
        );
    });
    it('should return a js file\'s source map from `babelFile` with the map\'s line numbers offset by one and the result stringified', () => {
      const store = createTestStore({
        readCache: () => ({}),
        babelFile: () => ({map: {mappings: 'test mappings'}})
      });
      store.create('test.js');
      return assert.becomes(
        store.sourceMap('test.js'),
        JSON.stringify({mappings: ';test mappings'})
      );
    });
    it('should apply a .js file\'s source map to the cache object', () => {
      const store = createTestStore({
        readCache: () => ({}),
        babelFile: () => ({map: {mappings: 'test mappings'}})
      });
      store.create('test.js');
      return store.sourceMap('test.js')
        .then(sourceMap => store.readCache('test.js')
          .then(data => assert.equal(data.sourceMap, sourceMap))
        );
    });
    it('should return null for a .json file', () => {
      const store = createTestStore({
        readCache: () => ({})
      });
      store.create('test.json');
      return assert.becomes(store.sourceMap('test.json'), null);
    });
    it('should reject for unknown text files', () => {
      const store = createTestStore({
        isTextFile: () => true,
        readCache: () => ({})
      });
      store.create('test.png');
      return assert.isRejected(
        store.sourceMap('test.png'),
        /Unknown text file extension: \.png\. Cannot generate source map for file: test\.png/
      );
    });
  });
});