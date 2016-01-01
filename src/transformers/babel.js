import * as imm from 'immutable';
import * as babel from 'babel-core';
import {isUndefined, isString, isObject} from 'lodash/lang';
import {cloneDeepOmitPrivateProps} from '../utils/clone';

// Be aware that babel will mutate the provided object.
// You'll probably want to clone it at a higher level
export function transformBabylonAst(ast, options, cb) {
  let file;

  try {
    file = babel.transformFromAst(ast, null, options);
  } catch(err) {
    cb(err);
  }

  cb(null, file);
}

// Babel adds a bunch of circular references which are generally
// bound in `_...` props. So that the structure can be serialized,
// this function wraps `transformBabylonAst` and then removes the
// props that are likely to cause issues
export function _transformBabylonAstWorkerEntry(ast, options, cb) {
  transformBabylonAst(ast, options, (err, file) => {
    if (err) return cb(err);

    cb(null, cloneDeepOmitPrivateProps(file));
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

export function createBabelAstTransformer(babelOptions) {
  return function babelAstTransformer(options, pipeline, cb) {
    const {ast} = options;
    const {workers} = pipeline;

    if (!isObject(ast)) {
      return cb(new Error(`An \`ast\` option must be provided: ${JSON.stringify(options)}`))
    }

    transformBabylonAstWithWorkers(ast, babelOptions, workers, cb);
  };
}