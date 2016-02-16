import fs from 'fs';
import path from 'path';
import Murmur from 'imurmurhash';
import * as babel from 'babel-core';
import * as babylon from 'babylon';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import browserifyBuiltins from 'browserify/lib/builtins';
import browserResolve from 'browser-resolve';
import promisify from 'promisify-node';
import {startsWith, endsWith} from 'lodash/string';
import {zipObject} from 'lodash/array';
import {assign} from 'lodash/object';
import {isNull} from 'lodash/lang';
import babylonAstDependencies from '../babylon-ast-dependencies';
import postcssAstDependencies from '../postcss-ast-dependencies';
import babelGenerator from 'babel-generator';
import {createJSModule, JS_MODULE_SOURCE_MAP_LINE_OFFSET} from './utils';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const resolve = promisify(browserResolve);

export function createJobs(getState) {
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
        store.isTextFile(ref)
      ]);
    },
    isTextFile(ref) {
      return (
        ref.ext === '.js' ||
        ref.ext === '.css' ||
        ref.ext === '.json'
      );
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
          if (!isTextFile) {
            return store.mtime(ref);
          }
          return store.hashText(ref);
        })
        .then(hash => hash.toString());
    },
    cache() {
      return getState().jobCache;
    },
    cacheKey(ref, store) {
      return Promise.all([
        ref.name,
        store.readText(ref),
        store.mtime(ref)
      ]);
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
        .then(([cache, key, cacheData]) => cache.set(key, cacheData));
    },
    hashedFilename(ref, store) {
      return store.hash(ref)
        .then(hash => {
          const basename = path.basename(ref.name, ref.ext);
          return `${basename}-${hash}${ref.ext}`;
        });
    },
    hashedPath(ref, store) {
      return store.hashedFilename(ref)
        .then(hashedFilename => {
          return path.join(path.basename(ref.name), hashedFilename);
        });
    },
    url(ref, store) {
      const state = getState();

      function createRelativeUrl(absPath) {
        const relPath = path.relative(state.sourceRoot, absPath);
        return state.fileEndpoint + relPath;
      }

      return store.isTextFile(ref)
        .then(isTextFile => {
          if (!isTextFile) {
            return createRelativeUrl(ref.name);
          }

          return store.hashedFilename(ref).then(filename => {
            const dirname = path.dirname(ref.name);
            return createRelativeUrl(path.join(dirname, filename));
          });
        });
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

      return [autoprefixer, analyzeDependencies, removeImports];
    },
    postcssProcessOptions(ref, store) {
      return store.hashedPath(ref)
        .then(hashedPath => {
          const state = getState();
          return {
            from: path.relative(state.sourceRoot, ref.name),
            to: path.relative(state.sourceRoot, hashedPath),
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
        store.postcssProcessOptions(ref)
      ]).then(([text, postcssPlugins, processOptions]) => {
        return postcss(postcssPlugins).process(text, processOptions);
      });
    },
    babelTransformOptions(ref) {
      return {
        filename: ref.name,
        sourceRoot: getState().sourceRoot,
        sourceType: 'module',
        sourceMaps: true,
        babelrc: false,
        presets: [
          'es2015',
          'react'
        ]
      };
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
      return store.url(ref)
        .then(url => {
          return {
            sourceMaps: true,
            sourceMapTarget: path.basename(url),
            sourceFileName: path.basename(ref.name)
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
    babelFile(ref, store) {
      if (startsWith(ref.name, getState().rootNodeModules)) {
        return store.babelGenerator(ref);
      }

      return store.babelTransform(ref);
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
                  const code = createJSModule({
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

                  const code = createJSModule({
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
