import {parse as babylonParse} from 'babylon';
import {isUndefined, isString, isObject} from 'lodash/lang';

export function createBabylonOptions(options) {
  if (!isObject(options)) {
    options = {}
  }

  if (isUndefined(options.sourceType)) {
    options.sourceType = 'module';
  }

  return options;
}

export function buildBabylonAST(text, options, cb) {
  let ast;

  options = createBabylonOptions(options);

  try {
    ast = babylonParse(text, options);
  } catch(err) {
    return cb(err);
  }

  cb(null, ast);
}

export function buildBabylonASTWithWorkers(text, options, workers, cb) {
  workers.callFunction({
    filename: __filename,
    name: buildBabylonAST.name,
    args: [text, options]
  }, cb);
}

export function createBabylonParser(options) {
  return function babylonParser(pipeline, cb) {
    const {record, workers, cache} = pipeline;

    const text = record.get('content');
    if (!isString(text)) {
      return cb(new Error(`Record does not have a string defined as the \`content\` property: ${record}`));
    }

    cache.get({
      key: text,
      packageDependencies: ['babylon']
    }, (err, ast) => {
      if (err) return cb(err);

      if (isObject(ast)) {
        return cb(null, ast);
      }

      buildBabylonASTWithWorkers(text, options, workers, (err, ast) => {
        if (err) {
          err.message = `Error parsing record: ${record.get('filename')}\n\n${err.message}`;
          return cb(err);
        }

        cache.set({
          key: text,
          packageDependencies: ['babylon']
        }, (err) => {
          if (err) return cb(err);

          cb(null, ast);
        })
      });
    });
  }
}