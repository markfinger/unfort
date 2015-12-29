import {parse as babylonParse} from 'babylon';
import {isUndefined, isString, isObject} from 'lodash/lang';
import {cloneDeepOmitPrivateProps} from '../utils/clone';

export function createBabylonOptions(options) {
  if (!isObject(options)) {
    options = {}
  }

  if (isUndefined(options.sourceType)) {
    options.sourceType = 'module';
  }

  return options;
}

export function buildBabylonAst(text, options, cb) {
  let ast;

  options = createBabylonOptions(options);

  try {
    ast = babylonParse(text, options);
  } catch(err) {
    return cb(err);
  }

  // immutable doesn't like that the AST comes from a constructor with a
  // prototype. Cloning the object ensures that higher levels can treat it
  // as a normal object
  ast = cloneDeepOmitPrivateProps(ast);

  cb(null, ast);
}

export function buildBabylonAstWithWorkers(text, options, workers, cb) {
  workers.callFunction({
    filename: __filename,
    name: buildBabylonAst.name,
    args: [text, options]
  }, cb);
}

export function generateBabylonParserCacheKey(text) {
  return {
    namespace: 'parsers__babylon',
    key: text,
    packageDependencies: ['babylon']
  }
}

export function createBabylonParser(options) {
  return function babylonParser(pipeline, cb) {
    const {record, workers, cache} = pipeline;

    const text = record.get('content');
    if (!isString(text)) {
      return cb(new Error(`Record does not have a string defined as the \`content\` property: ${record}`));
    }

    const cacheKey = generateBabylonParserCacheKey(text);
    cache.get(cacheKey, (err, ast) => {
      if (err) return cb(err);

      if (isObject(ast)) {
        return cb(null, ast);
      }

      buildBabylonAstWithWorkers(text, options, workers, (err, ast) => {
        if (err) {
          err.message = `Error parsing record: ${record.get('filename')}\n\n${err.message}`;
          return cb(err);
        }

        cache.set(cacheKey, ast, (err) => {
          if (err) return cb(err);

          cb(null, ast);
        })
      });
    });
  }
}