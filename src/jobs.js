import fs from 'fs';
import path from 'path';
import Murmur from 'imurmurhash';
import * as mimeTypes from 'mime-types';
import * as babel from 'babel-core';
import * as babylon from 'babylon';
import postcss from 'postcss';
import browserifyBuiltins from 'browserify/lib/builtins';
import browserResolve from 'browser-resolve';
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
const resolve = promisify(browserResolve);

export function createJobs({getState}={}) {
  return {
    ready(ref, store) {
      // All the jobs that must be completed before
      // the record is emitted
      return Promise.all([
        ref.name,
        store.hash(ref),
        store.code(ref),
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
        .then(ext => mimeTypes.lookup(ext));
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

          const relUrl = path.relative(sourceRoot, name).split(path.ext).join('/');
          return fileEndpoint + relUrl;
        });
    },
    // Note: `url` and `sourceUrl` are mostly duplicates. This is intentional,
    // so that they can be overridden individually
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
            sourceFileName: sourceUrl,
            babelrc: false
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
    shouldBabelTransfrom(ref) {
      const {rootNodeModules, vendorRoot} = getState();

      return (
        !startsWith(ref.name, rootNodeModules) &&
        !startsWith(ref.name, vendorRoot)
      );
    },
    babelFile(ref, store) {
      return store.shouldBabelTransfrom(ref)
        .then(shouldBabelTransfrom => {
          if (shouldBabelTransfrom) {
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
      if (ref.ext === '.js') {
        if (startsWith(ref.name, getState().rootNodeModules)) {
          return store.babylonAst(ref);
        }
        return store.babelAst(ref);
      }

      throw new Error(`Unknown extension "${ref.ext}", cannot parse "${ref.name}"`);
    },
    analyzeDependencies(ref, store) {
      if (ref.ext === '.css') {
        return store.postcssTransform(ref)
          .then(result => {
            return result.unfortDependencies;
          });
      }

      if (ref.ext === '.js') {
        return store.ast(ref)
          .then(ast => babylonAstDependencies(ast));
      }

      return [];
    },
    dependencyIdentifiers(ref, store) {
      return store.readCache(ref)
        .then(cachedData => {
          if (cachedData.dependencyIdentifiers) {
            return cachedData.dependencyIdentifiers;
          }

          return store.analyzeDependencies(ref)
            .then(deps => deps.map(dep => dep.source))
            .then(ids => {
              cachedData.dependencyIdentifiers = ids;
              return ids;
            });
        });
    },
    packageDependencyIdentifiers(ref, store) {
      return store.dependencyIdentifiers(ref)
        .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)));
    },
    resolver(ref, store) {
      return store.resolverOptions(ref)
        .then(options => {
          return id => resolve(id, options);
        });
    },
    resolverOptions(ref) {
      return {
        basedir: path.dirname(ref.name),
        extensions: ['.js', '.json'],
        modules: browserifyBuiltins
      };
    },
    resolvePathDependencies(ref, store) {
      return store.dependencyIdentifiers(ref)
        .then(ids => ids.filter(id => id[0] === '.' || path.isAbsolute(id)))
        .then(ids => store.resolver(ref)
          .then(resolver => Promise.all(ids.map(id => resolver(id))))
          .then(resolved => zipObject(ids, resolved))
        );
    },
    resolvePackageDependencies(ref, store) {
      return store.packageDependencyIdentifiers(ref)
        .then(ids => ids.filter(id => id[0] !== '.' && !path.isAbsolute(id)))
        .then(ids => store.resolver(ref)
          .then(resolver => Promise.all(ids.map(id => resolver(id))))
          .then(resolved => zipObject(ids, resolved))
        );
    },
    resolvedDependencies(ref, store) {
      return store.readCache(ref)
        .then(cachedData => {
          // Aggressively cache resolved paths for files that live in node_modules
          if (startsWith(ref.name, getState().rootNodeModules)) {
            if (cachedData.resolvedDependencies) {
              return cachedData.resolvedDependencies;
            }

            return Promise.all([
              store.resolvePathDependencies(ref),
              store.resolvePackageDependencies(ref)
            ]).then(([pathDeps, packageDeps]) => {
              const deps = assign({}, pathDeps, packageDeps);
              cachedData.resolvedDependencies = deps;
              return deps;
            });
          }

          // To avoid any edge-cases caused by caching path-based dependencies,
          // we only cache the resolved paths which relate to packages
          let packageDeps = cachedData.resolvedDependencies;
          if (!packageDeps) {
            packageDeps = store.resolvePackageDependencies(ref);
          }
          return Promise.all([
            store.resolvePathDependencies(ref),
            packageDeps
          ]).then(([pathDeps, packageDeps]) => {
            cachedData.resolvedDependencies = packageDeps;
            return assign({}, pathDeps, packageDeps);
          });
        });
    },
    code(ref, store) {
      return store.isTextFile(ref)
        .then(isTextFile => {
          if (!isTextFile) {
            return null;
          }

          return store.readCache(ref)
            .then(cachedData => {
              if (cachedData.code) {
                return cachedData.code;
              }

              if (ref.ext === '.css') {
                return store.postcssTransform(ref)
                  .then(result => {
                    cachedData.code = result.css;
                    return result.css;
                  });
              }

              if (ref.ext === '.js') {
                if (ref.name === getState().bootstrapRuntime) {
                  return store.readText(ref);
                }

                return Promise.all([
                  store.babelFile(ref),
                  store.resolvedDependencies(ref),
                  store.hash(ref)
                ]).then(([file, deps, hash]) => {
                  const code = createJSModuleDefinition({
                    name: ref.name,
                    deps,
                    hash,
                    code: file.code
                  });
                  cachedData.code = code;
                  return code;
                });
              }

              if (ref.ext === '.json') {
                return Promise.all([
                  store.readText(ref),
                  store.hash(ref)
                ]).then(([text, hash]) => {
                  let jsModuleCode;
                  if (startsWith(ref.name, getState().rootNodeModules)) {
                    jsModuleCode = `module.exports = ${text};`;
                  } else {
                    // We fake babel's commonjs shim so that hot swapping can occur
                    jsModuleCode = `
                      var json = ${text};
                      exports.default = json;
                      exports.__esModule = true;
                      if (module.hot) {
                        module.hot.accept();
                      }
                    `;
                  }

                  const code = createJSModuleDefinition({
                    name: ref.name,
                    deps: {},
                    hash,
                    code: jsModuleCode
                  });

                  cachedData.code = code;

                  return code;
                });
              }

              return Promise.reject(
                `Unknown text file extension: ${ref.ext}. Cannot generate code for file: ${ref.name}`
              );
            });
        });
    },
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

              if (ref.ext === '.css') {
                return store.postcssTransform(ref).then(result => {
                  const sourceMap = result.map.toString();
                  cachedData.sourceMap = sourceMap;
                  return sourceMap;
                });
              }

              if (ref.ext === '.js') {
                return store.babelFile(ref).then(file => {
                  // Offset each line in the source map to reflect the call to
                  // the module runtime
                  file.map.mappings = JS_MODULE_SOURCE_MAP_LINE_OFFSET + file.map.mappings;

                  const sourceMap = JSON.stringify(file.map);
                  cachedData.sourceMap = sourceMap;
                  return sourceMap;
                });
              }

              if (ref.ext === '.json') {
                return null;
              }

              return Promise.reject(
                `Unknown text file extension: ${ref.ext}. Cannot generate source map for file: ${ref.name}`
              );
            });
        });
    }
  };
}
