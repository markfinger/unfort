import fs from 'fs';
import path from 'path';
import Murmur from 'imurmurhash';
import * as mimeTypes from 'mime-types';
import * as babel from 'babel-core';
import * as babylon from 'babylon';
import postcss from 'postcss';
import browserifyBuiltins from 'browserify/lib/builtins';
import _browserResolve from 'browser-resolve';
import promisify from 'promisify-node';
import {startsWith, endsWith} from 'lodash/string';
import {zipObject} from 'lodash/array';
import {assign} from 'lodash/object';
import {isNull} from 'lodash/lang';
import babylonAstDependencies from 'babylon-ast-dependencies';
import postcssAstDependencies from 'postcss-ast-dependencies';
import babelGenerator from 'babel-generator';
import {createJSModuleDefinition, JS_MODULE_SOURCE_MAP_LINE_OFFSET} from './utils';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const browserResolve = promisify(_browserResolve);

export function createJobs({getState}={}) {
  return {
    ready(ref, store) {
      // All the jobs that must be completed before
      // the record is emitted
      return Promise.all([
        ref.name,
        store.hash(ref),
        store.code(ref),
        store.moduleDefinition(ref),
        store.url(ref),
        store.sourceMap(ref),
        store.sourceMapUrl(ref),
        store.sourceMapAnnotation(ref),
        store.hashedFilename(ref),
        store.isTextFile(ref),
        store.mimeType(ref)
      ]);
    },
    basename(ref) {
      return path.basename(ref.name, path.extname(ref.name));
    },
    ext(ref) {
      return path.extname(ref.name);
    },
    isTextFile(ref, store) {
      return store.ext(ref).then(ext => {
        return (
          ext === '.js' ||
          ext === '.css' ||
          ext === '.json'
        );
      });
    },
    mimeType(ref, store) {
      return store.ext(ref)
        .then(ext => mimeTypes.lookup(ext) || null);
    },
    readText(ref) {
      return readFile(ref.name, 'utf8');
    },
    stat(ref) {
      return stat(ref.name);
    },
    mtime(ref, store) {
      return store.stat(ref)
        .then(stat => {
          return stat.mtime.getTime();
        });
    },
    hashText(ref, store) {
      return store.readText(ref)
        .then(text => {
          const hash = new Murmur(text).result();
          return hash.toString();
        });
    },
    hash(ref, store) {
      return store.isTextFile(ref)
        .then(isTextFile => {
          if (isTextFile) {
            return store.hashText(ref);
          } else {
            return store.mtime(ref);
          }
        })
        // We coerce everything to a string for consistency
        .then(hash => hash.toString());
    },
    hashedFilename(ref, store) {
      return Promise.all([
        store.basename(ref),
        store.hash(ref),
        store.ext(ref)
      ])
        .then(([basename, hash, ext]) => {
          return `${basename}-${hash}${ext}`;
        });
    },
    hashedName(ref, store) {
      return store.hashedFilename(ref)
        .then(hashedFilename => {
          return path.join(path.dirname(ref.name), hashedFilename);
        });
    },
    cache() {
      return getState().jobCache;
    },
    cacheKey(ref, store) {
      return store.isTextFile(ref)
        .then(isTextFile => {
          const key = [
            ref.name,
            store.mtime(ref)
          ];

          if (isTextFile) {
            key.push(store.hash(ref));
          }

          return Promise.all(key);
        });
    },
    readCache(ref, store) {
      return Promise.all([
        store.cache(ref),
        store.cacheKey(ref)
      ])
        .then(([cache, key]) => cache.get(key))
        .then(data => {
          if (isNull(data)) {
            return {};
          }
          return data;
        });
    },
    writeCache(ref, store) {
      return Promise.all([
        store.cache(ref),
        store.cacheKey(ref),
        store.readCache(ref)
      ])
        .then(([cache, key, cacheData]) => {
          return cache.set(key, cacheData);
        });
    },
    url(ref, store) {
      return store.isTextFile(ref)
        .then(isTextFile => {
          if (isTextFile) {
            return store.hashedName(ref);
          } else {
            return ref.name;
          }
        })
        .then(name => {
          const {sourceRoot, fileEndpoint} = getState();

          // Try to produce a more readable url, but fallback to an absolute
          // path if necessary. The fallback is necessary if the record is
          // being pulled in from a symbolic link
          let relPath;
          if (startsWith(name, sourceRoot)) {
            relPath = path.relative(sourceRoot, name);
          } else {
            relPath = name;
          }

          return fileEndpoint + relPath.split(path.ext).join('/');
        });
    },
    /**
     * A url to the original content of the record
     *
     * TODO: this has diverged from `url`, need to consolidate them. use `relativePathIfContained` in utils.js
     */
    sourceUrl(ref) {
      const {sourceRoot, fileEndpoint} = getState();

      const relUrl = path.relative(sourceRoot, ref.name).split(path.ext).join('/');
      return fileEndpoint + relUrl;
    },
    sourceMapUrl(ref, store) {
      return store.url(ref)
        .then(url => url + '.map');
    },
    sourceMapAnnotation(ref, store) {
      return Promise.all([
        store.url(ref),
        store.sourceMapUrl(ref)
      ]).then(([url, sourceMapUrl]) => {
        if (endsWith(url, '.css')) {
          return `\n/*# sourceMappingURL=${sourceMapUrl} */`;
        }

        if (
          endsWith(url, '.js') ||
          endsWith(url, '.json')
        ) {
          return `\n//# sourceMappingURL=${sourceMapUrl}`;
        }

        return null;
      });
    },
    postcssPlugins() {
      return [];
    },
    postcssTransformOptions(ref, store) {
      return store.hashedName(ref)
        .then(hashedName => {
          const state = getState();
          return {
            from: path.relative(state.sourceRoot, ref.name),
            to: path.relative(state.sourceRoot, hashedName),
            // Generate a source map, but keep it separate from the code
            map: {
              inline: false,
              annotation: false
            }
          };
        });
    },
    postcssTransform(ref, store) {
      return Promise.all([
        store.readText(ref),
        store.postcssPlugins(ref),
        store.postcssTransformOptions(ref)
      ]).then(([text, plugins, options]) => {

        // Finds any `@import ...` and `url(...)` identifiers and
        // annotates the result object
        const analyzeDependencies = postcss.plugin('unfort-analyze-dependencies', () => {
          return (root, result) => {
            result.unfortDependencies = postcssAstDependencies(root);
          };
        });

        // As we serve the files with different names, we need to remove
        // the `@import ...` rules
        const removeImports = postcss.plugin('unfort-remove-imports', () => {
          return root => {
            root.walkAtRules('import', rule => rule.remove());
          };
        });

        plugins = plugins.concat([
          analyzeDependencies,
          removeImports
        ]);

        return postcss(plugins).process(text, options);
      });
    },
    babelTransformOptions(ref, store) {
      return Promise.all([
        store.url(ref),
        store.sourceUrl(ref)
      ])
        .then(([url, sourceUrl]) => {
          return {
            filename: ref.name,
            sourceType: 'module',
            sourceMaps: true,
            sourceMapTarget: url,
            sourceFileName: sourceUrl
          };
        });
    },
    babelTransform(ref, store) {
      return Promise.all([
        store.readText(ref),
        store.babelTransformOptions(ref)
      ]).then(([text, options]) => {
        return babel.transform(text, options);
      });
    },
    babelGeneratorOptions(ref, store) {
      return Promise.all([
        store.url(ref),
        store.sourceUrl(ref)
      ])
        .then(([url, sourceUrl]) => {
          // We want to preserve the compression applied to vendor assets
          const shouldMinify = startsWith(ref.name, getState().vendorRoot);

          return {
            sourceMaps: true,
            sourceMapTarget: url,
            sourceFileName: sourceUrl,
            minified: shouldMinify
          };
        });
    },
    babelGenerator(ref, store) {
      return Promise.all([
        store.readText(ref),
        store.babylonAst(ref),
        store.babelGeneratorOptions(ref)
      ]).then(([text, ast, options]) => {
        return babelGenerator(ast, options, text);
      });
    },
    shouldBabelTransform(ref) {
      const {rootNodeModules, vendorRoot} = getState();

      return (
        !startsWith(ref.name, rootNodeModules) &&
        !startsWith(ref.name, vendorRoot)
      );
    },
    babelFile(ref, store) {
      return store.shouldBabelTransform(ref)
        .then(shouldBabelTransform => {
          if (shouldBabelTransform) {
            return store.babelTransform(ref);
          } else {
            return store.babelGenerator(ref);
          }
        });
    },
    babelAst(ref, store) {
      return store.babelTransform(ref)
        .then(file => file.ast);
    },
    babylonAst(ref, store) {
      return store.readText(ref)
        .then(text => {
          return babylon.parse(text, {
            sourceType: 'script'
          });
        });
    },
    ast(ref, store) {
      return store.ext(ref)
        .then(ext => {
          if (ext === '.js') {
            return store.shouldBabelTransform(ref)
              .then(shouldBabelTransform => {
                if (shouldBabelTransform) {
                  return store.babelAst(ref);
                } else {
                  return store.babylonAst(ref);
                }
              });
          }

          // Note: we reject the `ast` job for .css files as we handle
          // it during the initial traversal and transformation in the
          // `postcssTransform` job

          throw new Error(`Unknown extension "${ext}", cannot parse "${ref.name}"`);
        });
    },
    analyzeDependencies(ref, store) {
      return store.ext(ref)
        .then(ext => {
          if (ext === '.css') {
            return store.postcssTransform(ref)
              .then(result => {
                return result.unfortDependencies;
              });
          }

          if (ext === '.js') {
            return store.ast(ref)
              .then(ast => babylonAstDependencies(ast));
          }

          return [];
        });
    },
    dependencyIdentifiers(ref, store) {
      return store.readCache(ref)
        .then(cachedData => {
          if (cachedData.dependencyIdentifiers) {
            return cachedData.dependencyIdentifiers;
          }

          return store.analyzeDependencies(ref)
            .then(deps => deps.map(dep => dep.source))
            .then(ids => cachedData.dependencyIdentifiers = ids);
        });
    },
    pathDependencyIdentifiers(ref, store) {
      return store.dependencyIdentifiers(ref)
        .then(ids => ids.filter(id => id[0] === '.' || path.isAbsolute(id)));
    },
    packageDependencyIdentifiers(ref, store) {
      return store.dependencyIdentifiers(ref)
        .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)));
    },
    resolver(ref, store) {
      return store.resolverOptions(ref)
        .then(options => {
          // We use `browser-resolve` to resolve ids as it picks up browser-specific
          // entry points for packages
          return id => browserResolve(id, options);
        });
    },
    resolverOptions(ref) {
      return {
        // The directory that the resolver starts in when looking for a file
        // to matches an identifier
        basedir: path.dirname(ref.name),
        // The extensions that the resolver looks for considering identifiers
        // without an extension
        extensions: ['.js', '.json'],
        // The node core modules that should be shimmed for browser environments.
        // We use browserify's as they tend to upgrade them more often. Webpack's
        // `node-libs-browser` is another alternative
        modules: browserifyBuiltins
      };
    },
    shouldCacheResolvedPathDependencies(ref) {
      // If a dependency identifier is relative (./ ../) or absolute (/), there are
      // edge-cases where caching the resolved path may produce the wrong result.
      // For example: an identifier "./foo" may resolve to either a "./foo.js" or
      // or "./foo/index.js". Detecting these cases is problematic, so we avoid the
      // problem by ensuring that the resolver always inspects the file system for
      // path-based identifiers originating from files that we expect to change
      // frequently
      return startsWith(ref.name, getState().rootNodeModules);
    },
    shouldCacheResolvedPackageDependencies() {
      // If a dependency identifier refers to a package (eg: is not a path-based
      // identifier), we can cache the resolved path and leave higher levels to
      // perform cache invalidation
      return true;
    },
    resolvePathDependencies(ref, store) {
      return Promise.all([
        store.readCache(ref),
        store.shouldCacheResolvedPathDependencies(ref)
      ])
        .then(([cachedData, shouldCache]) => {
          if (shouldCache && cachedData.resolvePathDependencies) {
            return cachedData.resolvePathDependencies;
          }

          return store.pathDependencyIdentifiers(ref)
            .then(ids => store.resolver(ref)
              .then(resolver => Promise.all(ids.map(id => resolver(id))))
              .then(resolved => zipObject(ids, resolved))
            )
            .then(deps => cachedData.resolvePathDependencies = deps);
        });
    },
    resolvePackageDependencies(ref, store) {
      return Promise.all([
        store.readCache(ref),
        store.shouldCacheResolvedPackageDependencies(ref)
      ])
      .then(([cachedData, shouldCache]) => {
        if (shouldCache && cachedData.resolvePackageDependencies) {
          return cachedData.resolvePackageDependencies;
        }

        return store.packageDependencyIdentifiers(ref)
          .then(ids => store.resolver(ref)
            .then(resolver => Promise.all(ids.map(id => resolver(id))))
            .then(resolved => zipObject(ids, resolved))
          )
          .then(deps => cachedData.resolvePackageDependencies = deps);
      });
    },
    resolvedDependencies(ref, store) {
      return Promise.all([
        store.resolvePackageDependencies(ref),
        store.resolvePathDependencies(ref)
      ])
        .then(([pathDeps, packageDeps]) => {
          return assign({}, pathDeps, packageDeps);
        });
    },
    code(ref, store) {
      return store.isTextFile(ref)
        .then(isTextFile => {
          if (!isTextFile) {
            return null;
          }

          return Promise.all([
            store.ext(ref),
            store.readCache(ref)
          ])
            .then(([ext, cachedData]) => {
              if (cachedData.code) {
                return cachedData.code;
              }

              if (ext === '.css') {
                return store.postcssTransform(ref)
                  .then(result => cachedData.code = result.css);
              }

              if (ext === '.js') {
                if (ref.name === getState().bootstrapRuntime) {
                  return store.readText(ref);
                }

                return store.babelFile(ref)
                  .then(file => cachedData.code = file.code);
              }

              if (ext === '.json') {
                return store.readText(ref);
              }

              return Promise.reject(
                `Unknown text file extension: ${ext}. Cannot generate code for file: ${ref.name}`
              );
            });
        });
    },
    /**
     * For JS and JSON records, we can inject the record's code. For all other
     * types, we inject a url to their location
     */
    moduleContents(ref, store) {
      return store.ext(ref)
        .then(ext => {
          if (ext === '.js' || ext === '.json') {
            return store.code(ref);
          } else {
            return store.url(ref)
              .then(url => JSON.stringify(url));
          }
        });
    },
    /**
     * Indicates if the record requires a shim module to be defined. These shim
     * modules are used so that the runtime can interact with a representation
     * of non-JS records
     */
    shouldShimModuleDefinition(ref, store) {
      return store.ext(ref)
        .then(ext => ext !== '.js');
    },
    /**
     * Generates the module code for a record. This is primarily of use to
     * create shim modules for non-js records
     */
    moduleCode(ref, store) {
      return Promise.all([
        store.shouldShimModuleDefinition(ref),
        store.moduleContents(ref)
      ])
        .then(([shouldShimModuleDefinition, moduleContents]) => {
          if (!shouldShimModuleDefinition) {
            return moduleContents;
          }

          // We fake babel's ES => commonjs shim so that the hot runtime knows
          // that `module.exports` will never be a function and hence a proxy
          // object can be used
          return [
            'Object.defineProperty(exports, "__esModule", {',
            '  value: true',
            '});',
            `exports["default"] = ${moduleContents};`,
            'if (module.hot) {',
            '  module.hot.accept();',
            '}'
          ].join('\n');
        });
    },
    /**
     * We use this as a hook so that we can push the bootstrap runtime
     * down to the client without any shims or wrapper code
     */
    shouldDefineModule(ref) {
      return ref.name !== getState().bootstrapRuntime;
    },
    /**
     * Create the module definition that we use to inject a record into
     * the runtime
     */
    moduleDefinition(ref, store) {
      return store.shouldDefineModule(ref)
        .then(shouldDefineModule => {
          if (!shouldDefineModule) {
            return null;
          }

          return Promise.all([
            store.resolvedDependencies(ref),
            store.hash(ref),
            store.moduleCode(ref)
          ])
            .then(([resolvedDependencies, hash, moduleCode]) => {
              return createJSModuleDefinition({
                name: ref.name,
                deps: resolvedDependencies,
                hash,
                code: moduleCode
              });
            });
        });
    },
    /**
     * Generates a textual representation of a record's source map
     */
    sourceMap(ref, store) {
      return store.isTextFile(ref)
        .then(isTextFile => {
          if (!isTextFile) {
            return null;
          }

          return store.readCache(ref)
            .then(cachedData => {
              if (cachedData.sourceMap) {
                return cachedData.sourceMap;
              }

              return store.ext(ref)
                .then(ext => {
                  if (ext === '.css') {
                    return store.postcssTransform(ref)
                      .then(result => cachedData.sourceMap = result.map.toString());
                  }

                  if (ext === '.js') {
                    return store.babelFile(ref).then(file => {
                      // Offset each line in the source map to reflect the call to
                      // the module runtime
                      file.map.mappings = JS_MODULE_SOURCE_MAP_LINE_OFFSET + file.map.mappings;

                      return cachedData.sourceMap = JSON.stringify(file.map);
                    });
                  }

                  if (ext === '.json') {
                    return null;
                  }

                  return Promise.reject(
                    `Unknown text file extension: ${ext}. Cannot generate source map for file: ${ref.name}`
                  );
                });
            });
        });
    }
  };
}
