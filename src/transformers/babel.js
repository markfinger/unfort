import imm from 'immutable';
import path from 'path';
import fs from 'fs';
import {transformFromAst as babelTransformFromAst} from 'babel-core';
import {isUndefined, isString, isObject} from 'lodash/lang';
import {cloneWithoutUnderscoreProps} from './utils';

// Note: this will mutate the ast object
export function transformBabylonAst(ast, options, cb) {
  let file;

  try {
    file = babelTransformFromAst(ast, null, options);
  } catch(err) {
    cb(err);
  }

  cb(null, file);
}

// Babel adds a bunch of circular references which are generally
// bound in `_...` props, so we need to remove them before any
// serialization should occur
export function _transformBabylonAstWorkerEntry(ast, options, cb) {
  transformBabylonAst(ast, options, (err, file) => {
    if (err) return cb(err);

    cb(null, cloneWithoutUnderscoreProps(file));
  });
}

export function transformBabylonAstWithWorkers(ast, options, workers, cb) {
  workers.callFunction({
    filename: __filename,
    name: _transformBabylonAstWorkerEntry.name,
    args: [
      ast,
      options
    ]
  }, cb);
}

export function generateBabelTransformCacheKey(options, babylonAst) {
  let optionsHashCode;
  if (!isObject(options)) {
    optionsHashCode = null;
  } else {
    optionsHashCode = imm.fromJS(options).hashCode();
  }

  return {
    namespace: 'transformers__babel',
    key: `${babylonAst.hashCode()}__${optionsHashCode}`,
    packageDependencies: ['babel']
  };
}

export function createBabelTransformer(options) {
  return function babelTransformer(pipeline, cb) {
    const {record, workers, cache} = pipeline;

    const babylonAst = record.get('babylonAst');
    if (isUndefined(babylonAst)) {
      return cb(new Error(`Record does have a \`babylonAst\` property defined: ${record}`));
    }

    const cacheKey = generateBabelTransformCacheKey(options, babylonAst);

    cache.get(cacheKey, (err, file) => {
      if (err) return cb(err);

      if (isObject(file)) {
        return cb(null, file);
      }

      const ast = babylonAst.toJS();
      transformBabylonAstWithWorkers(ast, options, workers, (err, file) => {
        if (err) {
          err.message = `Error applying babel transform to record: ${record.get('filename')}\n\n${err.message}`;
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
  };
}