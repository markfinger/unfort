// 'use strict';
//
// const {Record} = require('immutable');
// const babylon = require('babylon');
// const {assert} = require('../../utils/assert');
// const {LazyPromise} = require('../../utils/lazy_promise');
//
// describe('TODO', () => {
//   it('', () => {
//     const services = {
//       readFile(path) {},
//       // Should be distinct from `readFile` in case the original buffer is required
//       readFileAsText(path) {},
//       readFileModifiedTime(path) {},
//       statFile(path) {},
//       fileExists(path) {},
//       isTextFile(path) {},
//       generateFileContentHash(path) {},
//       resolveDependency(id, record) {},
//       generateRecordHash(record) {},
//
//       // Caching
//       generateRecordCacheKey(record) {},
//       getCachedData(key, property) {},
//       setCachedData(key, property, value) {},
//       writeCachedData(key) {},
//
//       // Used for source maps
//       generateRecordUrl(record) {},
//
//       // Profiling
//       startTimer(data) {},
//       stopTimer(timer) {},
//
//       // Workers
//       executeFunction(file, functionName, args) {}
//     };
//
//     const hooks = {
//       "build:start": null,
//       "build:restart": null,
//       // Mostly for reporting in a CLI environment
//       "build:error": [{error: {}, record: {}}],
//       // Useful for handling req/res pattern in an endpoint
//       "build:end": null,
//       // watcher events?
//       "file-watcher:directory-found": ['path'],
//       "file-watcher:file-found": ['path'],
//       "file-watcher:file-stat": ['path', {}],
//       "file-watcher:directory-stat": ['path', {}],
//       "file-watcher:file-changed": ['path'],
//       "file-watcher:file-removed": ['path'],
//       "file-watcher:directory-removed": ['path'],
//       "dependency-watcher:dependencies-changed": []
//     };
//
//     // Should the compiler be stand-alone, and emitters handle
//     // pushing compiled content elsewhere?
//
//     compiler.on('done', state => {
//       if (!utils.buildHasErrors(state)) {
//         cache.persistData();
//       }
//     });
//
//     const compiler = function(){}
//     compiler.on('done', state => {
//       if (utils.buildHasErrors(state)) {
//         // log errors
//       } else {
//         // emit
//       }
//     });
//
//     class Profiler {
//       constructor(name) {
//         this.name = name;
//         this.groups = [];
//         this.profiles = [];
//       }
//       recordProfile(profile) {
//         this.profiles.push(profile);
//       }
//       exportProfiles() {
//         const profiles = this.groups.reduce(
//           (group, accum) => accum.push.apply(accum, group.export()),
//           []
//         );
//         profiles.push.apply(this.profiles);
//         return JSON.stringify(profiles);
//       }
//     }
//
//     function getDependencies(record) {
//       record = {
//         id: '',
//         path: '/path/to/file.ext'
//       }
//     }
//
//     function readText(pipeline, recordPath) {
//       return pipeline.readText(recordPath);
//     }
//
//     function processor(pipeline, options) {
//       const {recordPath} = options;
//       const ext = path.splitExt(recordPath);
//       if (ext === '.js') {
//         if (/node_modules/.test(recordPath)) {
//           return acornAndEscodegenJsProcessor(pipeline, options);
//         } else {
//           return babelJsProcessor(pipeline, options);
//         }
//       } else if (ext === '.css') {
//
//       }
//     }
//
//     function postcssProcessor() {
//
//     }
//
//     function acornAndEscodegenJsProcessor({startProfile, stopProfile, recordPath, text}) {
//
//     }
//
//     function babelJsProcessor({startProfile, stopProfile, recordPath, text}) {
//       let profile = startProfile({name: babelJsProcessor.name, path: recordPath});
//
//       const {ast} = babel.transform(text, {
//         code: false,
//         ast: true,
//         sourceMaps: false
//       });
//
//       const rewrittenDeps = rewriteBabylonAstDependencies(ast);
//
//       const file = babelGenerator(deps.ast, {
//         sourceMaps: true
//         // and other source map options
//       });
//
//       profile = stopProfile(profile);
//
//       return {
//         code: file.code,
//         sourceMap: file.map,
//         dependencies: rewrittenDeps,
//         profile: profile
//       }
//     }
//
//     const pipeline = {
//       readText(path) {
//         return fs.readFile(path, 'utf8');
//       },
//       readModifiedTime(path) {
//
//       },
//       getCachedData(key) {
//
//       },
//       setCachedData(key, value) {
//
//       },
//       createProfileGroup(name) {
//         return {
//           name
//         };
//       },
//       createProfile(name, group=null) {
//         return {
//           group,
//           name: 'something',
//           start: (new Date()).getTime(),
//           end: null
//         }
//       },
//       record(id) {
//
//       },
//       profile(id, start, end) {
//
//       }
//     };
//
//
//
//     // const pipeline = {
//     //   getCachedData(key) {
//     //
//     //   },
//     //   setCachedData(key) {
//     //
//     //   },
//     //   readFile(path, encoding) {
//     //     return new Promise((res, rej) => {
//     //       fs.readFile(path, encoding, (err, data) => {
//     //         if (err) return rej(err);
//     //         return res(data);
//     //       });
//     //     });
//     //   },
//     //   startProfiler(id) {
//     //
//     //   },
//     //   stopProfiler(id) {
//     //
//     //   }
//     // };
//     //
//     // function createStore(path) {
//     //   return Promise.all([
//     //     fs.readFile(path, 'utf8'),
//     //     fs.stat(path)
//     //   ]).then(([text, stat]) => {
//     //     return {
//     //       id: '',
//     //       code: babelTransform(text),
//     //       cacheKey: [path, text, stat.mtime]
//     //     }
//     //   });
//     // }
//     //
//     // const fileStore = createStore({
//     //   text(ref, store) {
//     //     return fs.readFile(ref.name);
//     //   }
//     // });
//     //
//     // const babelStore = createStore({
//     //   dependencies(ref, store) {
//     //     return parse(fileStore.text).getDeps();
//     //   }
//     // });
//     //
//     // const recordStore = createStore({
//     //   ready(ref, store) {
//     //     const data = {};
//     //     data.text = null;
//     //   },
//     //   text(record) {
//     //     return fs.readFile(record.path, 'utf8');
//     //   },
//     //   stat(record) {
//     //     return fs.stat(record.path);
//     //   },
//     //   modifiedTime(record) {
//     //     return record.stat.then(stat => stat.mtime);
//     //   }
//     // });
//     //
//     // Promise.all([
//     //   record.text,
//     //   record.modifiedTime
//     // ]).then(() => {
//     //   const data = record.getData();
//     //   data.modifiedTime;
//     // });
//     //
//     // const record = Record({
//     //   id: '',
//     //   path: '',
//     //   data: new LazyPromise(() => {
//     //     return fs.readFile(record.path);
//     //   }),
//     //   stat: new LazyPromise(() => {
//     //     return fs.stat(record.path);
//     //   }),
//     //   getModifiedTime: new LazyPromise(() => {
//     //     return record.stat.then(stat => stat.mtime);
//     //   })
//     // });
//     //
//     // function getBabylonAst(pipeline, record) {
//     //   return pipeline.getText(record)
//     //     .then(text => {
//     //
//     //     });
//     //   pipeline.profiler.start(record.id);
//     //   return pipeline.fs.readFile(record, 'utf8')
//     //     .then(text => {
//     //       pipeline.profiler.start(record.id);
//     //     });
//     // }
//     //
//     // babelProcessor(pipeline, record)
//     //   .then(record => {
//     //
//     //   });
//   });
// });